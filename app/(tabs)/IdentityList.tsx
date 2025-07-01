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
import { Plus, Edit, User, Pencil, ArrowLeft } from 'lucide-react-native';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useUserProfile } from '@/context/UserProfileContext';
import { useNostrService } from '@/context/NostrServiceContext';
import * as ImagePicker from 'expo-image-picker';
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
    avatarUri, 
    avatarRefreshKey, 
    setUsername, 
    setAvatarUri, 
    setProfile, 
    isProfileEditable, 
    fetchProfile, 
    syncStatus 
  } = useUserProfile();
  const nostrService = useNostrService();
  const [usernameInput, setUsernameInput] = useState('');
  const [networkUsername, setNetworkUsername] = useState('');
  const [networkAvatarUri, setNetworkAvatarUri] = useState<string | null>(null);
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
  }, [username]);

  // Track network state when profile is loaded/refreshed from network
  useEffect(() => {
    if (syncStatus === 'completed') {
      setNetworkUsername(username);
      setNetworkAvatarUri(avatarUri);
    }
  }, [syncStatus, username, avatarUri]);

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

    setProfileIsLoading(true);
    try {
      const trimmedUsername = usernameInput.trim();
      
      if (trimmedUsername && trimmedUsername !== username) {
        await setUsername(trimmedUsername);
      }

      // Save profile using individual setters rather than setProfile
      showToast('Profile updated successfully', 'success');
    } catch (error) {
      console.error('Error saving profile:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save profile';
      showToast(errorMessage, 'error');
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

              <View style={[styles.usernameContainer, { borderBottomColor: inputBorderColor }]}>
                <TextInput
                  style={[
                    styles.usernameInput,
                    { color: textPrimary },
                    !isProfileEditable && styles.usernameInputDisabled,
                  ]}
                  value={usernameInput}
                  onChangeText={setUsernameInput}
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
                      const avatarChanged = avatarUri !== networkAvatarUri;
                      const hasChanges = usernameChanged || avatarChanged;
                      
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
              <ThemedText style={[styles.masterKeyValue, { color: textPrimary }]}>
                ax87DJe9IjdDJi40PoaW55tR...
              </ThemedText>
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
              onPress={() => router.replace('/(tabs)')}
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
  usernameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    marginBottom: 24,
    width: '100%',
    maxWidth: 500,
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
});
