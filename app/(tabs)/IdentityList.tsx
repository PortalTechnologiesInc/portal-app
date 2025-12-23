import Clipboard from '@react-native-clipboard/clipboard';
import { requestMediaLibraryPermissionsAsync } from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, Copy, Edit, Pencil, User } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useNostrService } from '@/context/NostrServiceContext';
import { useUserProfile } from '@/context/UserProfileContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { AppLockService } from '@/services/AppLockService';
import {
  cancelActiveFilePicker,
  isFilePickerActive,
  launchImagePickerWithAutoCancel,
} from '@/services/FilePickerService';
import { formatAvatarUri } from '@/utils/common';
import { showToast } from '@/utils/Toast';
import type { Identity } from '@/utils/types';

export type IdentityListProps = {
  onManageIdentity: (identity: Identity) => void;
  onDeleteIdentity: (identity: Identity) => void;
};

export default function IdentityList({ onManageIdentity }: IdentityListProps) {
  // const [identities] = useState<Identity[]>([]);
  const router = useRouter();

  // Profile management state
  const {
    username,
    displayName,
    avatarUri,
    networkUsername,
    networkDisplayName,
    networkAvatarUri,
    setAvatarUri,
    setProfile,
    isProfileEditable,
    fetchProfile,
  } = useUserProfile();
  const nostrService = useNostrService();
  const [usernameInput, setUsernameInput] = useState('');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [localAvatarRefreshKey, setLocalAvatarRefreshKey] = useState<number>(Date.now());
  const [profileIsLoading, setProfileIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Refs to track current values for cleanup
  const localAvatarUriRef = useRef<string | null>(null);
  const networkAvatarUriRef = useRef<string | null>(null);
  const savedSuccessfullyRef = useRef<boolean>(false);
  const previousAvatarUriRef = useRef<string | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    localAvatarUriRef.current = localAvatarUri;
  }, [localAvatarUri]);

  useEffect(() => {
    networkAvatarUriRef.current = networkAvatarUri;
  }, [networkAvatarUri]);

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textPrimary = useThemeColor({}, 'textPrimary');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryText = useThemeColor({}, 'buttonPrimaryText');
  const inputBorderColor = useThemeColor({}, 'inputBorder');
  const inputPlaceholderColor = useThemeColor({}, 'inputPlaceholder');
  const statusConnectedColor = useThemeColor({}, 'statusConnected');
  const surfaceSecondary = useThemeColor({}, 'surfaceSecondary');

  // Reset local state to network values when screen comes into focus
  // This ensures unsaved changes are discarded when user navigates away and comes back
  useFocusEffect(
    useCallback(() => {
      // Reset all local inputs to match network (saved) values
      setUsernameInput(networkUsername || username || '');
      setDisplayNameInput(networkDisplayName || displayName || '');
      
      // Only update refresh key if avatar URI actually changed to preserve cache
      const avatarUriChanged = networkAvatarUri !== previousAvatarUriRef.current;
      if (avatarUriChanged) {
        setLocalAvatarRefreshKey(Date.now());
        previousAvatarUriRef.current = networkAvatarUri;
      }
      
      setLocalAvatarUri(networkAvatarUri);
      savedSuccessfullyRef.current = false;
    }, [networkUsername, networkDisplayName, networkAvatarUri, username, displayName])
  );

  const handleAvatarPress = async () => {
    if (!isProfileEditable) {
      Alert.alert(
        'Profile Sync in Progress',
        'Please wait for profile synchronization to complete before making changes.'
      );
      return;
    }

    // Enable lock suppression during image picker interaction
    AppLockService.enableLockSuppression('image-picker');

    try {
      const permissionResult = await requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert(
          'Permission Required',
          'You need to allow access to your photos to change your avatar.'
        );
        // Disable lock suppression if permission denied
        AppLockService.disableLockSuppression('image-picker');
        return;
      }

      const result = await launchImagePickerWithAutoCancel({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        // Update local state only, don't update context until save
        const newUri = result.assets[0].uri;
        setLocalAvatarUri(newUri);
        setLocalAvatarRefreshKey(Date.now());
        previousAvatarUriRef.current = newUri;
      }
    } catch (_error) {
      Alert.alert('Error', 'Failed to select image. Please try again.');
    } finally {
      // Clear file picker active flag and disable lock suppression
      // Use setTimeout to ensure this happens after app state transitions complete
      setTimeout(() => {
        if (isFilePickerActive()) {
          cancelActiveFilePicker();
        }
        // Always disable lock suppression after image picker interaction completes
        AppLockService.disableLockSuppression('image-picker');
      }, 300);
    }
  };

  const handleSaveProfile = async () => {
    if (!isProfileEditable || profileIsLoading) return;

    // Normalize and validate username
    const normalizedUsername = usernameInput.trim().toLowerCase();
    const trimmedDisplayName = displayNameInput.trim();

    // Check if anything has actually changed
    const usernameChanged = normalizedUsername !== networkUsername;
    const displayNameChanged = trimmedDisplayName !== networkDisplayName;
    const avatarChanged = localAvatarUri !== networkAvatarUri;

    if (!usernameChanged && !displayNameChanged && !avatarChanged) {
      showToast('No changes to save', 'success');
      return;
    }

    // Client-side validation
    if (normalizedUsername.includes(' ')) {
      showToast('Username cannot contain spaces', 'error');
      return;
    }

    if (normalizedUsername && !/^[a-z0-9._-]+$/.test(normalizedUsername)) {
      showToast(
        'Username can only contain lowercase letters, numbers, dots, underscores, and hyphens',
        'error'
      );
      return;
    }

    setProfileIsLoading(true);
    try {
      // Update context avatar URI before saving (so setProfile can use it)
      if (localAvatarUri !== avatarUri) {
        await setAvatarUri(localAvatarUri);
      }

      // Use the setProfile method to save username, display name, and avatar to the network
      await setProfile(
        normalizedUsername || username || '',
        trimmedDisplayName,
        localAvatarUri || undefined
      );

      // Update local inputs to reflect the normalized values
      setUsernameInput(normalizedUsername || username || '');
      setDisplayNameInput(trimmedDisplayName);

      // Mark that save was successful to prevent cleanup from restoring
      savedSuccessfullyRef.current = true;

      // Note: After successful save, setProfile updates networkAvatarUri to match localAvatarUri
      // The useEffect that syncs localAvatarUri from networkAvatarUri will handle the sync
      // Show success message
      showToast('Updated profile', 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save profile';
      showToast(errorMessage, 'error');

      // Reset inputs to original network values when save fails
      setUsernameInput(networkUsername);
      setDisplayNameInput(networkDisplayName);
      const avatarUriChanged = networkAvatarUri !== previousAvatarUriRef.current;
      if (avatarUriChanged) {
        setLocalAvatarRefreshKey(Date.now());
        previousAvatarUriRef.current = networkAvatarUri;
      }
      setLocalAvatarUri(networkAvatarUri);
    } finally {
      setProfileIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (nostrService.publicKey) {
        await fetchProfile(nostrService.publicKey);
        // Reset all local state to network values after refresh
        // Note: useFocusEffect will also reset when networkAvatarUri updates, but we do it here
        // immediately to ensure UI updates right away
        setUsernameInput(networkUsername || username || '');
        setDisplayNameInput(networkDisplayName || displayName || '');
        const avatarUriChanged = networkAvatarUri !== previousAvatarUriRef.current;
        if (avatarUriChanged) {
          setLocalAvatarRefreshKey(Date.now());
          previousAvatarUriRef.current = networkAvatarUri;
        }
        setLocalAvatarUri(networkAvatarUri);
      }
    } catch (_error) {
      // Silently handle errors
    }
    setRefreshing(false);
  };

  // Restore original avatar when leaving page without saving
  useEffect(() => {
    return () => {
      // On unmount, restore network avatar if there are unsaved changes and we didn't just save
      if (
        !savedSuccessfullyRef.current &&
        localAvatarUriRef.current !== networkAvatarUriRef.current
      ) {
        setAvatarUri(networkAvatarUriRef.current);
      }
      // Reset flag for next mount
      savedSuccessfullyRef.current = false;
    };
  }, [setAvatarUri]);

  const _renderItem = ({ item }: { item: Identity }) => (
    <TouchableOpacity style={[styles.identityCard, { backgroundColor: cardBackground }]}>
      <View style={styles.identityCardContent}>
        <View style={styles.identityInfo}>
          <ThemedText style={[styles.identityName, { color: textPrimary }]}>{item.name}</ThemedText>
          <ThemedText style={[styles.identityKey, { color: textSecondary }]}>
            {item.publicKey}
          </ThemedText>
        </View>
        <TouchableOpacity
          style={[styles.editButton, { backgroundColor: buttonPrimary }]}
          onPress={() => onManageIdentity(item)}
        >
          <Edit size={16} color={buttonPrimaryText} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        {/* Header */}
        <ThemedView style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={20} color={textPrimary} />
          </TouchableOpacity>
          <ThemedText style={styles.headerText} lightColor={textPrimary} darkColor={textPrimary}>
            Identities & Profile
          </ThemedText>
        </ThemedView>

        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[statusConnectedColor]}
              tintColor={statusConnectedColor}
              title="Pull to refresh profile"
              titleColor={textSecondary}
            />
          }
        >
          {/* Profile Section */}
          <ThemedView style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={[styles.sectionTitle, { color: textPrimary }]}>
                Your Profile
              </ThemedText>
            </View>
            <View style={[styles.profileCard, { backgroundColor: cardBackground }]}>
              <TouchableOpacity
                style={[
                  styles.avatarContainer,
                  !isProfileEditable && styles.avatarContainerDisabled,
                ]}
                onPress={handleAvatarPress}
                disabled={!isProfileEditable}
              >
                {localAvatarUri ? (
                  <Image
                    key={localAvatarUri}
                    source={{ uri: formatAvatarUri(localAvatarUri, localAvatarRefreshKey) || '' }}
                    style={[styles.avatar, { borderColor: inputBorderColor }]}
                  />
                ) : (
                  <View
                    style={[
                      styles.avatarPlaceholder,
                      { backgroundColor: cardBackground, borderColor: inputBorderColor },
                    ]}
                  >
                    <User size={40} color={textPrimary} />
                  </View>
                )}
                <View
                  style={[
                    styles.avatarEditBadge,
                    { backgroundColor: cardBackground, borderColor: inputBorderColor },
                    !isProfileEditable && styles.avatarEditBadgeDisabled,
                  ]}
                >
                  <Pencil size={12} color={textPrimary} />
                </View>
              </TouchableOpacity>

              <View style={[styles.inputContainer, { borderBottomColor: inputBorderColor }]}>
                <ThemedText style={[styles.inputLabel, { color: textSecondary }]}>
                  Display Name
                </ThemedText>
                <TextInput
                  style={[
                    styles.displayNameInput,
                    { color: textPrimary },
                    !isProfileEditable && styles.inputDisabled,
                  ]}
                  value={displayNameInput}
                  onChangeText={setDisplayNameInput}
                  placeholder="Your display name (optional)"
                  placeholderTextColor={inputPlaceholderColor}
                  autoCapitalize="words"
                  autoCorrect={true}
                  editable={isProfileEditable}
                />
              </View>

              <View style={[styles.usernameContainer, { borderBottomColor: inputBorderColor }]}>
                <ThemedText style={[styles.inputLabel, { color: textSecondary }]}>
                  Username
                </ThemedText>
                <View style={styles.usernameInputWrapper}>
                  <TextInput
                    style={[
                      styles.usernameInput,
                      { color: textPrimary },
                      !isProfileEditable && styles.usernameInputDisabled,
                    ]}
                    value={usernameInput}
                    onChangeText={text => {
                      // Convert to lowercase and filter out invalid characters
                      // Show lowercase letters instead of blocking capitals entirely
                      const normalizedText = text
                        .toLowerCase() // Convert capitals to lowercase
                        .replace(/[^a-z0-9._-]/g, ''); // Remove spaces and other invalid characters
                      setUsernameInput(normalizedText);
                    }}
                    placeholder="username"
                    placeholderTextColor={inputPlaceholderColor}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={isProfileEditable}
                  />
                  <ThemedText style={[styles.usernameSuffix, { color: textSecondary }]}>
                    @getportal.cc
                  </ThemedText>
                </View>
              </View>

              <View style={styles.publicKeyContainer}>
                <ThemedText style={[styles.inputLabel, { color: textSecondary }]}>
                  Public key
                </ThemedText>
                <View
                  style={[
                    styles.publicKeyBox,
                    {
                      borderColor: inputBorderColor,
                      backgroundColor: surfaceSecondary,
                    },
                  ]}
                >
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.publicKeyScrollView}
                  >
                    <ThemedText
                      style={[styles.publicKeyText, { color: textPrimary }]}
                      selectable
                    >
                      {nostrService.publicKey || ''}
                    </ThemedText>
                  </ScrollView>
                  <TouchableOpacity
                    onPress={() => {
                      if (nostrService.publicKey) {
                        Clipboard.setString(nostrService.publicKey);
                        showToast('Public key copied to clipboard', 'success');
                      }
                    }}
                    style={styles.copyPublicKeyButton}
                    activeOpacity={0.7}
                  >
                    <Copy size={16} color={buttonPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              {(() => {
                const usernameChanged = usernameInput.trim() !== networkUsername;
                const displayNameChanged = displayNameInput.trim() !== networkDisplayName;
                const avatarChanged = localAvatarUri !== networkAvatarUri;
                const hasChanges = usernameChanged || displayNameChanged || avatarChanged;
                const isDisabled = !isProfileEditable || profileIsLoading || !hasChanges;

                return (
                  <TouchableOpacity
                    style={[
                      styles.saveButton,
                      { backgroundColor: buttonPrimary },
                      isDisabled && {
                        backgroundColor: inputBorderColor,
                        opacity: 0.5,
                      },
                    ]}
                    onPress={handleSaveProfile}
                    disabled={isDisabled}
                  >
                    <ThemedText
                      style={[
                        styles.saveButtonText,
                        { color: buttonPrimaryText },
                        isDisabled && { color: textSecondary },
                      ]}
                    >
                      {profileIsLoading
                        ? 'Saving...'
                        : 'Save Changes'}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })()}
            </View>
          </ThemedView>

          {/* Identities Section */}
          {/* <ThemedView style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={[styles.sectionTitle, { color: textPrimary }]}>
                Identities
              </ThemedText>
            </View>
            <View style={[styles.masterKeyCard, { backgroundColor: cardBackground }]}>
              <ThemedText style={[styles.masterKeyLabel, { color: textSecondary }]}>
                Master Key
              </ThemedText>
              <View style={styles.masterKeyContent}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.scrollableMasterKey}
                  contentContainerStyle={styles.scrollableMasterKeyContent}
                >
                  <ThemedText style={[styles.masterKeyValue, { color: textPrimary }]}>
                    ax87DJe9IjdDJi40PoaW55tRf3h9kM2nQx4bV8cL1sEp6yR7tU9wA3mN5lK8hJ2bVx4cZ9qS2fG5hK8jL4mN7pQ1rT3uY6wA9bC2eF5hI7kM0nP4qS6vY8zA1dF3gH5jL7mP9rT2uW4yB6cE8gJ0kN2oQ4sV6xA8bD1fH3iL5nP7rT9uW2yC4eG6hJ8lN0pS2vY4zA6cF8iL0oR3tW5yB7dG9jM1pS3vY5zA8cF0hL2oR4tW6yB8dG1jM3pS5vY7zA9cF1hL3oR5tW7yB9dG2jM4pS6vY8zA0cF2hL4oR6tW8yB0dG3jM5pS7vY9zA1cF3hL5oR7tW9yB1dG4jM6pS8vY0zA2cF4hL6oR8tW0yB2dG5jM7pS9vY1zA3cF5hL7oR9tW1yB3dG6jM8pS0vY2zA4cF6hL8oR0tW2yB4dG7jM9pS1vY3zA5cF7hL9oR1tW3yB5dG8jM0pS2vY4zA6cF8hL0oR2tW4yB6dG9jM1pS3vY5zA7cF9hL1oR3tW5yB7dG0jM2pS4vY6zA8c
                  </ThemedText>
                </ScrollView>
                <TouchableOpacity
                  onPress={() => {
                    // Copy master key to clipboard
                    const masterKey =
                      'ax87DJe9IjdDJi40PoaW55tRf3h9kM2nQx4bV8cL1sEp6yR7tU9wA3mN5lK8hJ2bVx4cZ9qS2fG5hK8jL4mN7pQ1rT3uY6wA9bC2eF5hI7kM0nP4qS6vY8zA1dF3gH5jL7mP9rT2uW4yB6cE8gJ0kN2oQ4sV6xA8bD1fH3iL5nP7rT9uW2yC4eG6hJ8lN0pS2vY4zA6cF8iL0oR3tW5yB7dG9jM1pS3vY5zA8cF0hL2oR4tW6yB8dG1jM3pS5vY7zA9cF1hL3oR5tW7yB9dG2jM4pS6vY8zA0cF2hL4oR6tW8yB0dG3jM5pS7vY9zA1cF3hL5oR7tW9yB1dG4jM6pS8vY0zA2cF4hL6oR8tW0yB2dG5jM7pS9vY1zA3cF5hL7oR9tW1yB3dG6jM8pS0vY2zA4cF6hL8oR0tW2yB4dG7jM9pS1vY3zA5cF7hL9oR1tW3yB5dG8jM0pS2vY4zA6cF8hL0oR2tW4yB6dG9jM1pS3vY5zA7cF9hL1oR3tW5yB7dG0jM2pS4vY6zA8c';
                    setStringAsync(masterKey);
                    showToast('Master key copied to clipboard', 'success');
                  }}
                  style={styles.copyMasterKeyButton}
                >
                  <Copy size={16} color={textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {identities.length > 0 ? (
              <FlatList
                scrollEnabled={false}
                data={identities}
                renderItem={renderItem}
                keyExtractor={item => item.publicKey}
                style={styles.identitiesList}
              />
            ) : (
              <View style={[styles.emptyCard, { backgroundColor: cardBackground }]}>
                <ThemedText style={[styles.emptyText, { color: textSecondary }]}>
                  No sub-identities created yet
                </ThemedText>
              </View>
            )}

            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: buttonPrimary }]}
              onPress={() => console.log('create new identity')}
            >
              <Plus size={16} color={buttonPrimaryText} style={styles.createButtonIcon} />
              <ThemedText style={[styles.createButtonText, { color: buttonPrimaryText }]}>
                Create New Identity
              </ThemedText>
            </TouchableOpacity>
          </ThemedView> */}
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  backButton: {
    marginRight: 15,
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  contentContainer: {
    paddingVertical: 12,
  },
  section: {
    marginBottom: 24,
    width: '100%',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  profileCard: {
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    width: 100,
    height: 100,
    marginBottom: 20,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
  },
  avatarContainerDisabled: {
    opacity: 0.5,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  avatarEditBadgeDisabled: {
    opacity: 0.5,
  },
  inputContainer: {
    borderBottomWidth: 1,
    marginBottom: 20,
    width: '100%',
    maxWidth: 500,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  displayNameInput: {
    fontSize: 16,
    paddingVertical: 8,
    width: '100%',
  },
  inputDisabled: {
    opacity: 0.5,
  },
  usernameContainer: {
    borderBottomWidth: 1,
    marginBottom: 24,
    width: '100%',
    maxWidth: 500,
  },
  usernameInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  usernameInput: {
    fontSize: 16,
    flex: 1,
    paddingVertical: 8,
  },
  usernameInputDisabled: {
    opacity: 0.5,
  },
  usernameSuffix: {
    fontSize: 16,
  },
  publicKeyContainer: {
    marginBottom: 24,
    width: '100%',
    maxWidth: 500,
  },
  publicKeyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  publicKeyScrollView: {
    flex: 1,
  },
  publicKeyText: {
    fontSize: 13,
    fontFamily: 'monospace',
  },
  copyPublicKeyButton: {
    padding: 4,
  },
  saveButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    width: '100%',
    maxWidth: 500,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  masterKeyCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  masterKeyLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  masterKeyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  scrollableMasterKey: {
    flex: 1,
    maxHeight: 24,
    marginRight: 12,
  },
  scrollableMasterKeyContent: {
    alignItems: 'center',
    paddingRight: 8,
  },
  masterKeyValue: {
    fontSize: 16,
    fontFamily: 'monospace',
  },
  identitiesList: {
    marginBottom: 16,
  },
  identityCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  identityCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  identityInfo: {
    flex: 1,
    marginRight: 12,
  },
  identityName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  identityKey: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCard: {
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    width: '100%',
  },
  createButtonIcon: {
    marginRight: 8,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  copyMasterKeyButton: {
    padding: 8,
    marginLeft: 12,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
