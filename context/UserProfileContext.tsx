import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { keyToHex } from 'portal-app-lib';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { registerContextReset, unregisterContextReset } from '@/services/ContextResetService';
import { generateRandomGamertag } from '@/utils/common';
import type { ProfileSyncStatus } from '@/utils/types';
import { useNostrService } from './NostrServiceContext';

// Helper function to validate image
const validateImage = async (uri: string): Promise<{ isValid: boolean; error?: string }> => {
  try {
    // Check file extension for GIF first (before trying to access file system)
    const extension = uri.toLowerCase().split('.').pop();
    if (extension === 'gif') {
      return { isValid: false, error: 'GIF images are not supported' };
    }

    // Check MIME type if present in URI
    if (uri.includes('image/gif') || uri.includes('mimeType=image/gif')) {
      return { isValid: false, error: 'GIF images are not supported' };
    }

    // For certain URI schemes (content://, ph://, assets-library://), FileSystem.getInfoAsync might fail
    // but React Native Image can still handle them, so we'll skip file system validation for these
    const skipFileSystemCheck =
      uri.startsWith('content:') ||
      uri.startsWith('ph:') ||
      uri.startsWith('assets-library:') ||
      uri.startsWith('data:');

    if (skipFileSystemCheck) {
      // For these URI schemes, just do basic validation
      return { isValid: true };
    }

    // For file:// URIs, we can do full validation
    try {
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

      return { isValid: true };
    } catch (fileSystemError) {
      // If FileSystem.getInfoAsync fails, but it's a valid-looking image URI, allow it
      // React Native Image component can handle URIs that FileSystem can't access
      console.warn('FileSystem validation failed, but URI looks valid:', uri);
      return { isValid: true };
    }
  } catch (error) {
    console.error('Image validation error:', error);
    // If validation completely fails, still allow the URI - let React Native Image handle it
    // This prevents blocking valid URIs that we can't validate
    return { isValid: true };
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
  resetProfile: () => void; // Add reset method to clear all profile state
  hasProfileAssigned: () => boolean; // Check if nip-05 is assigned (networkUsername is set)
  waitForProfileSetup: (timeoutMs: number) => Promise<boolean>; // Wait for profile setup with timeout
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

  // Reset all profile state to initial values
  // This is called during app reset to ensure clean state
  const resetProfile = () => {
    // Reset local state to initial values
    setUsernameState('');
    setDisplayNameState('');
    setAvatarUriState(null);
    setSyncStatus('idle');
    setAvatarRefreshKey(Date.now());

    // Reset network state tracking
    setNetworkUsername('');
    setNetworkDisplayName('');
    setNetworkAvatarUri(null);
  };

  // Register/unregister context reset function
  useEffect(() => {
    registerContextReset(resetProfile);

    return () => {
      unregisterContextReset(resetProfile);
    };
  }, []);

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
        setSyncStatus('failed');
      }, 30000); // 30 second safety timeout

      return () => clearTimeout(timer);
    }
  }, [syncStatus]);

  const setUsername = useCallback(async (newUsername: string) => {
    try {
      await SecureStore.setItemAsync(USERNAME_KEY, newUsername);
      setUsernameState(newUsername);
      // Note: We no longer call registerNip05 here
      // Profile setting is now handled by setProfile method
    } catch (_e) {}
  }, []);

  const setDisplayName = useCallback(async (newDisplayName: string) => {
    try {
      if (newDisplayName === '') {
        // If display name is empty, remove it from storage
        await SecureStore.deleteItemAsync(DISPLAY_NAME_KEY);
      } else {
        // Store non-empty display name
        await SecureStore.setItemAsync(DISPLAY_NAME_KEY, newDisplayName);
      }
      setDisplayNameState(newDisplayName);
    } catch (_e) {}
  }, []);

  const fetchProfile = useCallback(
    async (
      publicKey: string
    ): Promise<{ found: boolean; username?: string; displayName?: string; avatarUri?: string }> => {
      if (!publicKey || syncStatus === 'syncing') {
        return { found: false };
      }

      // Check if NostrService is ready
      if (!nostrService.isInitialized) {
        setSyncStatus('failed');
        return { found: false };
      }

      setSyncStatus('syncing');

      try {
        const { found, avatarUri, displayName, username } =
          await nostrService.fetchProfile(publicKey);

        if (found) {
          // Save the fetched data to local storage
          if (username) {
            await setUsername(username);
          }

          // Always set display name, even if empty (user might have intentionally cleared it)
          await setDisplayName(displayName ?? '');

          // Always update avatar to match network profile (even if null/empty)
          setAvatarUriState(avatarUri ?? '');

          // Force avatar refresh to bust cache
          setAvatarRefreshKey(Date.now());

          if (avatarUri) {
            // Cache the avatar URL in SecureStore
            await SecureStore.setItemAsync(AVATAR_URI_KEY, avatarUri);
          } else {
            // No avatar in profile - clear cached avatar
            await SecureStore.deleteItemAsync(AVATAR_URI_KEY);
          }

          // Update network state to reflect what was fetched
          setNetworkUsername(username ?? '');
          setNetworkDisplayName(displayName ?? '');
          setNetworkAvatarUri(avatarUri || null);

          setSyncStatus('completed');

          // Return the fetched data directly
          return {
            found: true,
            username: username || undefined,
            displayName: displayName || undefined,
            avatarUri: avatarUri || undefined,
          };
        } else {
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
          setSyncStatus('failed');
          return { found: false };
        }
        setSyncStatus('failed');
        return { found: false };
      }
    },
    [syncStatus, nostrService, setUsername, setDisplayName]
  );

  const setProfile = useCallback(
    async (newUsername: string, newDisplayName?: string, newAvatarUri?: string | null) => {
      try {
        if (!nostrService.publicKey) {
          throw new Error('Public key not initialized');
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

        if (!usernameChanged && !displayNameChanged && !avatarChanged) {
          setSyncStatus('completed');
          return;
        }

        // Step 1: Handle username changes (submitNip05)
        let nip05Error: string | null = null;
        let actualUsernameToUse = networkUsername; // Default to current network username

        if (usernameChanged) {
          try {
            await nostrService.submitNip05(normalizedUsername);
            actualUsernameToUse = normalizedUsername; // Use new username if successful
          } catch (error: any) {
            // Store the error but don't throw - continue with other updates
            let errorMessage = '';

            // Extract error from portal app response
            if (error.inner && Array.isArray(error.inner) && error.inner.length > 0) {
              errorMessage = error.inner[0];
            }

            if (errorMessage.includes('403')) {
              nip05Error = `Username "${normalizedUsername}" is already taken. Please choose a different name.`;
            } else {
              nip05Error = `Registration service offline. Please try again later.`;
            }

            // Keep actualUsernameToUse as networkUsername (previous valid username)
          }
        }

        // Step 2: Handle avatar changes (submitImage)
        let imageUrl = '';
        if (avatarChanged && newAvatarUri) {
          let cleanBase64 = '';

          // Check if the avatar is already base64 (from network fetch)
          if (isBase64String(newAvatarUri)) {
            cleanBase64 = newAvatarUri;
          } else {
            // Validate the image file
            const validation = await validateImage(newAvatarUri);
            if (!validation.isValid) {
              throw new Error(validation.error || 'Invalid image');
            }

            // Read image as base64
            try {
              cleanBase64 = await FileSystem.readAsStringAsync(newAvatarUri, {
                encoding: FileSystem.EncodingType.Base64,
              });
            } catch (_error) {
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

          try {
            await nostrService.submitImage(cleanBase64);

            // Generate portal image URL using hex pubkey
            const hexPubkey = keyToHex(nostrService.publicKey);
            imageUrl = `https://profile.getportal.cc/${hexPubkey}`;
          } catch (error: any) {
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

        const profileUpdate = {
          nip05: `${actualUsernameToUse}@getportal.cc`,
          name: actualUsernameToUse,
          displayName: newDisplayName !== undefined ? newDisplayName : actualUsernameToUse,
          picture: imageUrl, // Use the portal image URL or empty string
        };

        await nostrService.setUserProfile(profileUpdate);

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
          setSyncStatus('completed'); // Still mark as completed so user can edit again
          throw new Error(nip05Error); // Throw the NIP05 error to show to user
        } else {
          setSyncStatus('completed');
        }
      } catch (error) {
        setSyncStatus('failed');
        throw error;
      }
    },
    [
      nostrService,
      networkUsername,
      networkDisplayName,
      networkAvatarUri,
      setUsername,
      setDisplayName,
    ]
  );

  // Auto-fetch profile on app load when NostrService is ready
  useEffect(() => {
    const autoFetchProfile = async () => {
      // Only proceed if NostrService is ready and we have a public key
      if (!nostrService.isInitialized || !nostrService.publicKey) {
        return;
      }

      // Only fetch if we're in idle state (not already syncing)
      if (syncStatus !== 'idle') {
        return;
      }

      try {
        // Fetch the profile from the network
        const result = await fetchProfile(nostrService.publicKey);

        if (result.found) {
          // Profile loaded successfully
        } else {
          // Check if this is a newly generated seed (new user)
          try {
            const seedOrigin = await SecureStore.getItemAsync('portal_seed_origin');
            if (seedOrigin === 'generated') {
              // Generate a random username for new users
              const randomUsername = generateRandomGamertag();

              // Set the username locally and update state
              await setUsername(randomUsername);
              setNetworkUsername(''); // Keep network state empty since nothing is saved yet

              // Clear the seed origin flag so this only happens once
              await SecureStore.deleteItemAsync('portal_seed_origin');

              // Auto-save the generated profile to the network with empty display name
              try {
                await setProfile(randomUsername, ''); // Explicitly set empty display name
              } catch (error) {
                // Don't throw - let user manually save later
              }
            }
          } catch (error) {
            // Could not check seed origin, skipping auto-generation
          }
        }
      } catch (error) {
        // Auto-fetch failed - this is a background operation
      }
    };

    autoFetchProfile();
  }, [
    nostrService.isInitialized,
    nostrService.publicKey,
    syncStatus,
    fetchProfile,
    setProfile,
    setUsername,
  ]);

  const setAvatarUri = useCallback(async (uri: string | null) => {
    try {
      if (uri) {
        // Validate the image
        const validation = await validateImage(uri);
        if (!validation.isValid) {
          throw new Error(validation.error || 'Invalid image');
        }
      }

      // Update both state and refresh key together to ensure Image component updates
      // Use a new timestamp for the refresh key to force cache invalidation
      const newRefreshKey = Date.now();
      setAvatarUriState(uri);
      setAvatarRefreshKey(newRefreshKey);

      // Note: Image processing and uploading is now handled by setProfile method
    } catch (e) {
      console.error('Failed to set avatar URI:', e);
      throw e; // Re-throw so the UI can handle the error
    }
  }, []);

  // Check if profile (nip-05) is assigned
  const hasProfileAssigned = useCallback(() => {
    return networkUsername.length > 0;
  }, [networkUsername]);

  // Wait for profile setup to complete with timeout
  const waitForProfileSetup = useCallback(
    async (timeoutMs: number): Promise<boolean> => {
      const startTime = Date.now();
      const pollInterval = 500; // Check every 500ms

      return new Promise(resolve => {
        const checkProfile = () => {
          // Check if profile is assigned
          if (networkUsername.length > 0) {
            resolve(true);
            return;
          }

          // Check if timeout exceeded
          if (Date.now() - startTime >= timeoutMs) {
            resolve(false);
            return;
          }

          // Check if sync failed
          if (syncStatus === 'failed') {
            resolve(false);
            return;
          }

          // Continue polling
          setTimeout(checkProfile, pollInterval);
        };

        // Start checking immediately
        checkProfile();
      });
    },
    [networkUsername, syncStatus]
  );

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
        resetProfile,
        hasProfileAssigned,
        waitForProfileSetup,
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
