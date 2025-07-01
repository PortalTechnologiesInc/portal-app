import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  FlatList, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput, 
  Image, 
  Alert, 
  ScrollView, 
  RefreshControl 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Identity } from '../../models/Identity';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Plus, Edit, User, Pencil, ArrowLeft, Copy } from 'lucide-react-native';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useUserProfile } from '@/context/UserProfileContext';
import { useNostrService } from '@/context/NostrServiceContext';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { showToast } from '@/utils/Toast';
import { formatAvatarUri } from '@/utils';

export type IdentityListProps = {
  onManageIdentity: (identity: Identity) => void;
  onDeleteIdentity: (identity: Identity) => void;
};

export default function IdentityList({ onManageIdentity }: IdentityListProps) {
  const [identities] = useState<Identity[]>([]);
  const router = useRouter();

  // Profile management state
  const { 
    username, 
    displayName,
    avatarUri, 
    avatarRefreshKey, 
    networkUsername,
    networkDisplayName,
    networkAvatarUri,
    setUsername, 
    setDisplayName,
    setAvatarUri, 
    setProfile,
    isProfileEditable, 
    fetchProfile, 
    syncStatus 
  } = useUserProfile();
  const nostrService = useNostrService();
  const [usernameInput, setUsernameInput] = useState('');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [profileIsLoading, setProfileIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textPrimary = useThemeColor({}, 'textPrimary');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const borderPrimary = useThemeColor({}, 'borderPrimary');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryText = useThemeColor({}, 'buttonPrimaryText');
  const shadowColor = useThemeColor({}, 'shadowColor');
  const inputBorderColor = useThemeColor({}, 'inputBorder');
  const inputPlaceholderColor = useThemeColor({}, 'inputPlaceholder');
  const statusConnectedColor = useThemeColor({}, 'statusConnected');

  // Initialize profile state
  useEffect(() => {
    if (username) {
      setUsernameInput(username);
    }
    if (displayName) {
      setDisplayNameInput(displayName);
    }
  }, [username, displayName]);

  const handleAvatarPress = async () => {
    if (!isProfileEditable) {
      Alert.alert(
        'Profile Sync in Progress',
        'Please wait for profile synchronization to complete before making changes.'
      );
      return;
    }

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert(
          'Permission Required',
          'You need to allow access to your photos to change your avatar.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        allowsMultipleSelection: false,
      });

      if (!result.canceled) {
        try {
          await setAvatarUri(result.assets[0].uri);
          showToast('Avatar updated successfully', 'success');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to set avatar';
          Alert.alert('Error', errorMessage);
        }
      }
    } catch (error) {
      console.error('Error selecting image:', error);
      Alert.alert('Error', 'Failed to select image. Please try again.');
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
    const avatarChanged = avatarUri !== networkAvatarUri;

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
      showToast('Username can only contain lowercase letters, numbers, dots, underscores, and hyphens', 'error');
      return;
    }

    setProfileIsLoading(true);
    try {
      // Use the setProfile method to save username, display name, and avatar to the network
      await setProfile(
        normalizedUsername || username || '', 
        trimmedDisplayName,
        avatarUri || undefined
      );

      // Update local inputs to reflect the normalized values
      setUsernameInput(normalizedUsername || username || '');
      setDisplayNameInput(trimmedDisplayName);

      // Provide specific feedback about what was saved
      const changes = [];
      if (usernameChanged) changes.push('username');
      if (displayNameChanged) changes.push('display name');
      if (avatarChanged) changes.push('avatar');
      
      if (changes.length > 0) {
        showToast(`${changes.join(', ')} saved successfully`, 'success');
      }
      
    } catch (error) {
      console.error('Error saving profile:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save profile';
      showToast(errorMessage, 'error');

      // Reset inputs to original network values when save fails
      setUsernameInput(networkUsername);
      setDisplayNameInput(networkDisplayName);
    } finally {
      setProfileIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (nostrService.publicKey) {
        await fetchProfile(nostrService.publicKey);
      }
    } catch (error) {
      // Silently handle errors
    }
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: Identity }) => (
    <TouchableOpacity style={[styles.identityCard, { backgroundColor: cardBackground }]}>
      <View style={styles.identityCardContent}>
        <View style={styles.identityInfo}>
          <ThemedText style={[styles.identityName, { color: textPrimary }]}>{item.name}</ThemedText>
          <ThemedText style={[styles.identityKey, { color: textSecondary }]}>{item.publicKey}</ThemedText>
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
          <ThemedText
            style={styles.headerText}
            lightColor={textPrimary}
            darkColor={textPrimary}
          >
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
                {avatarUri ? (
                  <Image
                    source={{ uri: formatAvatarUri(avatarUri, avatarRefreshKey) || '' }}
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
                    onChangeText={(text) => {
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

              <TouchableOpacity
                  style={[
                    styles.saveButton,
                    { backgroundColor: buttonPrimary },
                    (!isProfileEditable || profileIsLoading) && {
                      backgroundColor: inputBorderColor,
                      opacity: 0.5,
                    },
                  ]}
                  onPress={handleSaveProfile}
                  disabled={!isProfileEditable || profileIsLoading}
                >
                  <ThemedText
                    style={[
                      styles.saveButtonText,
                      { color: buttonPrimaryText },
                      (!isProfileEditable || profileIsLoading) && { color: textSecondary },
                    ]}
                  >
                    {profileIsLoading ? 'Saving...' : (() => {
                      const usernameChanged = usernameInput.trim() !== networkUsername;
                      const displayNameChanged = displayNameInput.trim() !== networkDisplayName;
                      const avatarChanged = avatarUri !== networkAvatarUri;
                      const hasChanges = usernameChanged || displayNameChanged || avatarChanged;
                      
                      return hasChanges ? 'Save Changes' : 'Save Profile';
                    })()}
                  </ThemedText>
                </TouchableOpacity>
            </View>
          </ThemedView>

          {/* Identities Section */}
          <ThemedView style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={[styles.sectionTitle, { color: textPrimary }]}>
                Sub-Identities
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
                <TouchableOpacity onPress={() => {
                  // Copy master key to clipboard
                  const masterKey = 'ax87DJe9IjdDJi40PoaW55tRf3h9kM2nQx4bV8cL1sEp6yR7tU9wA3mN5lK8hJ2bVx4cZ9qS2fG5hK8jL4mN7pQ1rT3uY6wA9bC2eF5hI7kM0nP4qS6vY8zA1dF3gH5jL7mP9rT2uW4yB6cE8gJ0kN2oQ4sV6xA8bD1fH3iL5nP7rT9uW2yC4eG6hJ8lN0pS2vY4zA6cF8iL0oR3tW5yB7dG9jM1pS3vY5zA8cF0hL2oR4tW6yB8dG1jM3pS5vY7zA9cF1hL3oR5tW7yB9dG2jM4pS6vY8zA0cF2hL4oR6tW8yB0dG3jM5pS7vY9zA1cF3hL5oR7tW9yB1dG4jM6pS8vY0zA2cF4hL6oR8tW0yB2dG5jM7pS9vY1zA3cF5hL7oR9tW1yB3dG6jM8pS0vY2zA4cF6hL8oR0tW2yB4dG7jM9pS1vY3zA5cF7hL9oR1tW3yB5dG8jM0pS2vY4zA6cF8hL0oR2tW4yB6dG9jM1pS3vY5zA7cF9hL1oR3tW5yB7dG0jM2pS4vY6zA8c';
                  Clipboard.setStringAsync(masterKey);
                  showToast('Master key copied to clipboard', 'success');
                }} style={styles.copyMasterKeyButton}>
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
          </ThemedView>
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
