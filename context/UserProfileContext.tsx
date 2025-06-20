import type React from 'react';
import { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import { useNostrService } from './NostrServiceContext';
import { base64ToArrayBuffer } from '@/utils/Images';

const USERNAME_KEY = 'portal_username';
const AVATAR_KEY = 'portal_avatar';

type ProfileSyncStatus = 'idle' | 'syncing' | 'completed' | 'failed';

type UserProfileContextType = {
  username: string;
  avatarUri: string | null;
  syncStatus: ProfileSyncStatus;
  isProfileEditable: boolean;
  setUsername: (username: string) => Promise<void>;
  setAvatarUri: (uri: string | null) => Promise<void>;
  fetchProfile: (
    publicKey: string
  ) => Promise<{ found: boolean; username?: string; avatarUri?: string }>;
};

const UserProfileContext = createContext<UserProfileContextType | null>(null);

export const UserProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [username, setUsernameState] = useState<string>('');
  const [avatarUri, setAvatarUriState] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<ProfileSyncStatus>('idle');

  const nostrService = useNostrService();

  // Profile is editable only when sync is not in progress
  const isProfileEditable = syncStatus !== 'syncing';

  // Load local profile data on mount
  useEffect(() => {
    const loadLocalProfile = async () => {
      try {
        const savedUsername = await SecureStore.getItemAsync(USERNAME_KEY);
        if (savedUsername) {
          setUsernameState(savedUsername);
        }

        const savedAvatarUri = await SecureStore.getItemAsync(AVATAR_KEY);
        if (savedAvatarUri) {
          setAvatarUriState(savedAvatarUri);
        }
      } catch (e) {
        console.error('Failed to load local user profile:', e);
      }
    };

    loadLocalProfile();
  }, []);

  const fetchProfile = async (
    publicKey: string
  ): Promise<{ found: boolean; username?: string; avatarUri?: string }> => {
    if (!publicKey || syncStatus === 'syncing') {
      console.log('Profile fetch skipped: no publicKey or already syncing');
      return { found: false };
    }

    // Check if NostrService is ready
    if (!nostrService.isInitialized || !nostrService.portalApp) {
      console.log('NostrService not ready, will retry profile fetch later');
      setSyncStatus('failed');
      return { found: false };
    }

    console.log('Starting profile fetch for:', publicKey);
    setSyncStatus('syncing');

    try {
      // Fetch fresh profile data
      console.log('DEBUG: About to call nostrService.getServiceName with pubkey:', publicKey);
      const fetchedProfile = await nostrService.getServiceName(publicKey);
      console.log('DEBUG: getServiceName returned:', fetchedProfile);

      if (fetchedProfile) {
        console.log('Fetched profile:', fetchedProfile);

        // Extract data from fetched profile
        const fetchedUsername = fetchedProfile.nip05?.split('@')[0] || fetchedProfile.name || '';
        const fetchedAvatarUri = fetchedProfile.picture || '';

        console.log('Extracted username from profile:', fetchedUsername);
        console.log('Extracted avatar from profile:', fetchedAvatarUri);

        // Save the fetched data to local storage
        if (fetchedUsername) {
          await setUsername(fetchedUsername);
        }

        if (fetchedAvatarUri) {
          await setAvatarUri(fetchedAvatarUri);
        }

        setSyncStatus('completed');

        // Return the fetched data directly
        return {
          found: true,
          username: fetchedUsername || undefined,
          avatarUri: fetchedAvatarUri || undefined,
        };
      } else {
        console.log('No profile found for public key');
        setSyncStatus('completed');
        return { found: false }; // No profile found
      }
    } catch (error) {
      // Handle specific connection errors more gracefully
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (
        errorMessage.includes('ListenerDisconnected') ||
        errorMessage.includes('AppError.ListenerDisconnected')
      ) {
        console.log('Nostr listener disconnected during profile fetch, will retry...');
        setSyncStatus('failed');
        return { found: false };
      }

      console.log('Failed to fetch profile:', error);
      setSyncStatus('failed');
      return { found: false };
    }
  };

  const setUsername = async (newUsername: string) => {
    try {
      await SecureStore.setItemAsync(USERNAME_KEY, newUsername);
      setUsernameState(newUsername);
      await nostrService.portalApp?.registerNip05(newUsername);
    } catch (e) {
      console.error('Failed to save username:', e);
    }
  };

  const setAvatarUri = async (uri: string | null) => {
    try {
      if (uri) {
        await SecureStore.setItemAsync(AVATAR_KEY, uri);
        const base64image = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await nostrService.portalApp?.registerImg(base64ToArrayBuffer(base64image))
      } else {
        await SecureStore.deleteItemAsync(AVATAR_KEY);
      }
      setAvatarUriState(uri);
    } catch (e) {
      console.error('Failed to save avatar URI:', e);
    }
  };

  return (
    <UserProfileContext.Provider
      value={{
        username,
        avatarUri,
        syncStatus,
        isProfileEditable,
        setUsername,
        setAvatarUri,
        fetchProfile,
      }}
    >
      {children}
    </UserProfileContext.Provider>
  );
};

export const useUserProfile = () => {
  const context = useContext(UserProfileContext);
  if (!context) {
    throw new Error('useUserProfile must be used within a UserProfileProvider');
  }
  return context;
};

export default UserProfileProvider;
