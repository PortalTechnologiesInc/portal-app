import type React from 'react';
import { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import { useNostrService } from './NostrServiceContext';
import { formatAvatarUri, generateRandomGamertag } from '@/utils';
import { keyToHex } from 'portal-app-lib';
import type { ProfileSyncStatus } from '@/utils/types';

// Helper function to validate image
const validateImage = async (uri: string): Promise<{ isValid: boolean; error?: string }> => {
  try {
    // Get file info
    const fileInfo = await FileSystem.getInfoAsync(uri);

    if (!fileInfo.exists) {
      return { isValid: false, error: 'File does not exist' };
    }

    // Check file size (3MB limit - reduced from 5MB)
    if (fileInfo.size && fileInfo.size > 3 * 1024 * 1024) {
      const sizeInMB = (fileInfo.size / (1024 * 1024)).toFixed(2);
      return {
        isValid: false,
        error: `Image is ${sizeInMB}MB. Please choose an image smaller than 3MB.`,
      };
    }

    // Check file extension for GIF
    const extension = uri.toLowerCase().split('.').pop();

    if (extension === 'gif') {
      return { isValid: false, error: 'GIF images are not supported' };
    }

    // Check MIME type if available (additional GIF check)
    const mimeTypes = ['image/gif'];
    if (fileInfo.uri && mimeTypes.some(type => fileInfo.uri.includes(type))) {
      return { isValid: false, error: 'GIF images are not supported' };
    }

    return { isValid: true };
  } catch (error) {
    console.error('Image validation error:', error);
    return { isValid: false, error: 'Failed to validate image' };
  }
};

// Helper function to check if a string is base64 data
const isBase64String = (str: string): boolean => {
  // Base64 strings are typically much longer and contain only valid base64 characters
  if (str.length < 100) return false; // Too short to be an image

  // Check if it contains only valid base64 characters
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  return (
    base64Regex.test(str) &&
    !str.startsWith('data:') &&
    !str.startsWith('file:') &&
    !str.startsWith('http')
  );
};

const USERNAME_KEY = 'portal_username';
const AVATAR_URI_KEY = 'portal_avatar_uri';
const DISPLAY_NAME_KEY = 'portal_display_name';

type UserProfileContextType = {
  username: string;
  displayName: string;
  avatarUri: string | null;
  syncStatus: ProfileSyncStatus;
  isProfileEditable: boolean;
  avatarRefreshKey: number; // Add refresh key to force image cache invalidation
  // Network state for change detection
  networkUsername: string;
  networkDisplayName: string;
  networkAvatarUri: string | null;
  setUsername: (username: string) => Promise<void>;
  setDisplayName: (displayName: string) => Promise<void>;
  setAvatarUri: (uri: string | null) => Promise<void>;
  setProfile: (username: string, displayName?: string, avatarUri?: string | null) => Promise<void>;
  fetchProfile: (
    publicKey: string
  ) => Promise<{ found: boolean; username?: string; displayName?: string; avatarUri?: string }>;
};

const UserProfileContext = createContext<UserProfileContextType | null>(null);

export const UserProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [username, setUsernameState] = useState<string>('');
  const [displayName, setDisplayNameState] = useState<string>('');
  const [avatarUri, setAvatarUriState] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<ProfileSyncStatus>('idle');
  const [avatarRefreshKey, setAvatarRefreshKey] = useState<number>(Date.now());

  // Track what's actually saved on the network (for change detection)
  const [networkUsername, setNetworkUsername] = useState<string>('');
  const [networkDisplayName, setNetworkDisplayName] = useState<string>('');
  const [networkAvatarUri, setNetworkAvatarUri] = useState<string | null>(null);

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

        const savedDisplayName = await SecureStore.getItemAsync(DISPLAY_NAME_KEY);
        if (savedDisplayName) {
          setDisplayNameState(savedDisplayName);
        }

        // Load cached avatar URI from SecureStore
        const savedAvatarUri = await SecureStore.getItemAsync(AVATAR_URI_KEY);
        if (savedAvatarUri) {
          setAvatarUriState(savedAvatarUri);
        }
      } catch (e) {
        console.error('Failed to load local user profile:', e);
      }
    };

    loadLocalProfile();
  }, []);

  // Safety mechanism: reset sync status if stuck for too long
  useEffect(() => {
    if (syncStatus === 'syncing') {
      const timer = setTimeout(() => {
        console.log('Profile sync timeout, resetting to failed');
        setSyncStatus('failed');
      }, 30000); // 30 second safety timeout

      return () => clearTimeout(timer);
    }
  }, [syncStatus]);

  // Auto-fetch profile on app load when NostrService is ready
  useEffect(() => {
    const autoFetchProfile = async () => {
      // Only proceed if NostrService is ready and we have a public key
      if (!nostrService.isInitialized || !nostrService.publicKey || !nostrService.portalApp) {
        return;
      }

      // Only fetch if we're in idle state (not already syncing)
      if (syncStatus !== 'idle') {
        return;
      }

      console.log('Auto-fetching profile for:', nostrService.publicKey);

      try {
        // Fetch the profile from the network
        const result = await fetchProfile(nostrService.publicKey);

        if (result.found) {
          console.log('Profile loaded from network');
        } else {
          console.log('No profile found on network');

          // Check if this is a newly generated seed (new user)
          try {
            const seedOrigin = await SecureStore.getItemAsync('portal_seed_origin');
            if (seedOrigin === 'generated') {
              console.log('New user detected - auto-generating profile');

              // Generate a random username for new users
              const randomUsername = generateRandomGamertag();

              // Set the username locally and update state
              await setUsername(randomUsername);
              setNetworkUsername(''); // Keep network state empty since nothing is saved yet

              // Clear the seed origin flag so this only happens once
              await SecureStore.deleteItemAsync('portal_seed_origin');

              console.log('Auto-generated profile setup completed');

              // Auto-save the generated profile to the network with empty display name
              try {
                await setProfile(randomUsername, ''); // Explicitly set empty display name
                console.log('Auto-generated profile saved to network');
              } catch (error) {
                console.log('Failed to auto-save profile to network:', error);
                // Don't throw - let user manually save later
              }
            }
          } catch (error) {
            console.log('Could not check seed origin, skipping auto-generation:', error);
          }
        }
      } catch (error) {
        console.log('Auto-fetch failed:', error);
        // Don't throw - this is a background operation
      }
    };

    autoFetchProfile();
  }, [nostrService.isInitialized, nostrService.publicKey, nostrService.portalApp, syncStatus]);

  const fetchProfile = async (
    publicKey: string
  ): Promise<{ found: boolean; username?: string; displayName?: string; avatarUri?: string }> => {
    if (!publicKey || syncStatus === 'syncing') {
      return { found: false };
    }

    // Check if NostrService is ready
    if (!nostrService.isInitialized || !nostrService.portalApp) {
      console.log('NostrService not ready, will retry profile fetch later');
      setSyncStatus('failed');
      return { found: false };
    }

    console.log('Fetching profile for:', publicKey);
    setSyncStatus('syncing');

    try {
      // Fetch fresh profile data with timeout
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Profile fetch timeout')), 15000); // 15 second timeout
      });

      const fetchedProfile = (await Promise.race([
        nostrService.portalApp.fetchProfile(publicKey),
        timeoutPromise,
      ])) as any;

      if (fetchedProfile) {
        console.log('Profile fetched successfully');
        console.log('Raw profile data:', JSON.stringify(fetchedProfile, null, 2));

        // Extract data from fetched profile with proper normalization
        let fetchedUsername = '';
        let fetchedDisplayName = '';

        // Try to get username from nip05 first (most reliable)
        if (fetchedProfile.nip05) {
          const nip05Parts = fetchedProfile.nip05.split('@');
          if (nip05Parts.length > 0 && nip05Parts[0]) {
            fetchedUsername = nip05Parts[0];
            console.log('Username extracted from nip05:', fetchedUsername);
          }
        }

        // Fallback to name field if nip05 didn't work
        if (!fetchedUsername && fetchedProfile.name) {
          fetchedUsername = fetchedProfile.name;
          console.log('Username extracted from name field:', fetchedUsername);
        }

        // Fallback to displayName if nothing else worked
        if (!fetchedUsername && fetchedProfile.displayName) {
          fetchedUsername = fetchedProfile.displayName;
          console.log('Username extracted from displayName field:', fetchedUsername);
        }

        // Always normalize the username to match server behavior
        // The server trims and lowercases, so we should do the same
        if (fetchedUsername) {
          const originalUsername = fetchedUsername;
          fetchedUsername = fetchedUsername.trim().toLowerCase().replace(/\s+/g, '');

          if (originalUsername !== fetchedUsername) {
            console.log('Username normalized from:', originalUsername, 'to:', fetchedUsername);
          }
        }

        // Extract display name (more flexible, keep as-is)
        if ('displayName' in fetchedProfile) {
          fetchedDisplayName = fetchedProfile.displayName || ''; // Allow empty string
          console.log('Display name extracted (including empty):', fetchedDisplayName);
        } else if (fetchedProfile.name && fetchedProfile.name !== fetchedUsername) {
          // Fallback to name if it's different from username
          fetchedDisplayName = fetchedProfile.name;
          console.log('Display name extracted from name field:', fetchedDisplayName);
        } else {
          // Final fallback to username
          fetchedDisplayName = fetchedUsername;
          console.log('Display name set to username:', fetchedDisplayName);
        }

        const fetchedAvatarUri = fetchedProfile.picture || null; // Ensure null instead of empty string

        console.log('Final extracted username:', fetchedUsername);
        console.log('Final extracted display name:', fetchedDisplayName);
        console.log('Final extracted avatarUri:', fetchedAvatarUri);

        // Save the fetched data to local storage
        if (fetchedUsername) {
          await setUsername(fetchedUsername);
        }

        // Always set display name, even if empty (user might have intentionally cleared it)
        await setDisplayName(fetchedDisplayName);

        // Always update avatar to match network profile (even if null/empty)
        setAvatarUriState(fetchedAvatarUri);

        // Force avatar refresh to bust cache
        setAvatarRefreshKey(Date.now());

        if (fetchedAvatarUri) {
          // Cache the avatar URL in SecureStore
          await SecureStore.setItemAsync(AVATAR_URI_KEY, fetchedAvatarUri);
        } else {
          // No avatar in profile - clear cached avatar
          await SecureStore.deleteItemAsync(AVATAR_URI_KEY);
        }

        // Update network state to reflect what was fetched
        setNetworkUsername(fetchedUsername);
        setNetworkDisplayName(fetchedDisplayName);
        setNetworkAvatarUri(fetchedAvatarUri);

        setSyncStatus('completed');

        // Return the fetched data directly
        return {
          found: true,
          username: fetchedUsername || undefined,
          displayName: fetchedDisplayName || undefined,
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
      // Note: We no longer call registerNip05 here
      // Profile setting is now handled by setProfile method
    } catch (e) {
      console.error('Failed to save username:', e);
    }
  };

  const setDisplayName = async (newDisplayName: string) => {
    try {
      if (newDisplayName === '') {
        // If display name is empty, remove it from storage
        await SecureStore.deleteItemAsync(DISPLAY_NAME_KEY);
      } else {
        // Store non-empty display name
        await SecureStore.setItemAsync(DISPLAY_NAME_KEY, newDisplayName);
      }
      setDisplayNameState(newDisplayName);
    } catch (e) {
      console.error('Failed to save display name:', e);
    }
  };

  const setAvatarUri = async (uri: string | null) => {
    try {
      if (uri) {
        // Validate the image
        const validation = await validateImage(uri);
        if (!validation.isValid) {
          throw new Error(validation.error || 'Invalid image');
        }
      }

      // Just update the state, no SecureStorage saving
      setAvatarUriState(uri);

      // Note: Image processing and uploading is now handled by setProfile method
    } catch (e) {
      console.error('Failed to set avatar URI:', e);
      throw e; // Re-throw so the UI can handle the error
    }
  };

  const setProfile = async (
    newUsername: string,
    newDisplayName?: string,
    newAvatarUri?: string | null
  ) => {
    try {
      if (!nostrService.portalApp || !nostrService.publicKey) {
        throw new Error('Portal app or public key not initialized');
      }

      // Validate and normalize username
      const normalizedUsername = newUsername.trim().toLowerCase();

      // Check for invalid characters
      if (normalizedUsername.includes(' ')) {
        throw new Error('Username cannot contain spaces');
      }

      // Additional validation for username format (optional - portal.cc specific rules)
      if (normalizedUsername && !/^[a-z0-9._-]+$/.test(normalizedUsername)) {
        throw new Error(
          'Username can only contain lowercase letters, numbers, dots, underscores, and hyphens'
        );
      }

      setSyncStatus('syncing');

      // Determine what has actually changed (compare against network state, not local state)
      const usernameChanged = normalizedUsername !== networkUsername;
      const displayNameChanged = newDisplayName !== networkDisplayName;
      const avatarChanged = newAvatarUri !== networkAvatarUri;

      console.log(
        'Updating profile - username changed:',
        usernameChanged,
        'display name changed:',
        displayNameChanged,
        'avatar changed:',
        avatarChanged
      );

      if (!usernameChanged && !displayNameChanged && !avatarChanged) {
        console.log('No changes detected, skipping profile update');
        setSyncStatus('completed');
        return;
      }

      // Step 1: Handle username changes (submitNip05)
      let nip05Error: string | null = null;
      let actualUsernameToUse = networkUsername; // Default to current network username

      if (usernameChanged) {
        console.log('Registering NIP05 username:', normalizedUsername);

        try {
          await nostrService.submitNip05(normalizedUsername);
          console.log('NIP05 registration successful');
          actualUsernameToUse = normalizedUsername; // Use new username if successful
        } catch (error: any) {
          console.error('NIP05 registration failed');

          // Store the error but don't throw - continue with other updates
          let errorMessage = '';

          // Extract error from portal app response
          if (error.inner && Array.isArray(error.inner) && error.inner.length > 0) {
            errorMessage = error.inner[0];
          }

          if (errorMessage.includes('409')) {
            nip05Error = `Username "${normalizedUsername}" is already taken. Please choose a different name.`;
          } else {
            nip05Error = `Registration service offline. Please try again later.`;
          }

          console.log('NIP05 failed, continuing with other profile updates...');
          // Keep actualUsernameToUse as networkUsername (previous valid username)
        }
      }

      // Step 2: Handle avatar changes (submitImage)
      let imageUrl = '';
      if (avatarChanged && newAvatarUri) {
        console.log('Processing and uploading image');

        let cleanBase64 = '';

        // Check if the avatar is already base64 (from network fetch)
        if (isBase64String(newAvatarUri)) {
          console.log('Avatar is already base64, using directly');
          cleanBase64 = newAvatarUri;
        } else {
          console.log('Converting file URI to base64');

          // Validate the image file
          const validation = await validateImage(newAvatarUri);
          if (!validation.isValid) {
            console.error('Image validation failed:', validation.error);
            throw new Error(validation.error || 'Invalid image');
          }

          // Read image as base64
          try {
            cleanBase64 = await FileSystem.readAsStringAsync(newAvatarUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
          } catch (error) {
            console.error('Failed to read image as base64:', error);
            throw new Error('Failed to process image file');
          }
        }

        // Remove data URL prefix if present (submitImage expects clean base64)
        if (cleanBase64.startsWith('data:image/')) {
          const commaIndex = cleanBase64.indexOf(',');
          if (commaIndex !== -1) {
            cleanBase64 = cleanBase64.substring(commaIndex + 1);
          }
        }

        console.log('Uploading image to portal servers');
        try {
          await nostrService.submitImage(cleanBase64);
          console.log('Image upload successful');

          // Generate portal image URL using hex pubkey
          const hexPubkey = keyToHex(nostrService.publicKey);
          imageUrl = `https://profile.getportal.cc/${hexPubkey}`;
        } catch (error: any) {
          console.error('Image upload failed');

          // Extract error from portal app response
          let errorMessage = '';
          if (error.inner && Array.isArray(error.inner) && error.inner.length > 0) {
            errorMessage = error.inner[0];
          } else {
            errorMessage = error instanceof Error ? error.message : String(error);
          }

          throw new Error(`Failed to upload image: ${errorMessage}`);
        }
      } else if (!avatarChanged && networkAvatarUri) {
        // Keep existing image URL if avatar didn't change
        if (networkAvatarUri.startsWith('https://profile.getportal.cc/')) {
          imageUrl = networkAvatarUri;
        }
      }

      // Step 3: Set complete profile (setUserProfile)
      console.log('Setting complete profile');

      const profileUpdate = {
        nip05: `${actualUsernameToUse}@getportal.cc`,
        name: actualUsernameToUse,
        displayName: newDisplayName !== undefined ? newDisplayName : actualUsernameToUse,
        picture: imageUrl, // Use the portal image URL or empty string
      };

      await nostrService.setUserProfile(profileUpdate);
      console.log('Profile set successfully');

      // Update local state - use the actual username that worked
      await setUsername(actualUsernameToUse);
      await setDisplayName(newDisplayName !== undefined ? newDisplayName : actualUsernameToUse);
      if (avatarChanged) {
        // Store the portal image URL, not the local file URI
        setAvatarUriState(imageUrl || null);

        // Force avatar refresh to bust cache when avatar changes
        setAvatarRefreshKey(Date.now());

        // Cache the image URL in SecureStore after successful upload
        if (imageUrl) {
          await SecureStore.setItemAsync(AVATAR_URI_KEY, imageUrl);
        } else {
          await SecureStore.deleteItemAsync(AVATAR_URI_KEY);
        }
      }

      // Update network state to reflect what was actually saved
      setNetworkUsername(actualUsernameToUse);
      setNetworkDisplayName(newDisplayName !== undefined ? newDisplayName : actualUsernameToUse);
      setNetworkAvatarUri(imageUrl || null);

      if (nip05Error) {
        // Profile was partially updated but NIP05 failed
        console.log('Profile update completed with NIP05 error');
        setSyncStatus('completed'); // Still mark as completed so user can edit again
        throw new Error(nip05Error); // Throw the NIP05 error to show to user
      } else {
        console.log('Profile update completed successfully');
        setSyncStatus('completed');
      }
    } catch (error) {
      setSyncStatus('failed');
      console.error('Profile update failed:', error);
      throw error;
    }
  };

  return (
    <UserProfileContext.Provider
      value={{
        username,
        displayName,
        avatarUri,
        syncStatus,
        isProfileEditable,
        avatarRefreshKey,
        // Network state for change detection
        networkUsername,
        networkDisplayName,
        networkAvatarUri,
        setUsername,
        setDisplayName,
        setAvatarUri,
        setProfile,
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
