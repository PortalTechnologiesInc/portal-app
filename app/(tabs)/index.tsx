import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { PendingRequestsList } from '@/components/PendingRequestsList';
import { UpcomingPaymentsList } from '@/components/UpcomingPaymentsList';
import { RecentActivitiesList } from '@/components/RecentActivitiesList';
import { ConnectionStatusIndicator } from '@/components/ConnectionStatusIndicator';
import { useOnboarding } from '@/context/OnboardingContext';
import { useUserProfile } from '@/context/UserProfileContext';
import { useNostrService } from '@/context/NostrServiceContext';
import { QrCode, ArrowRight, User } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { generateRandomGamertag } from '@/utils';

const FIRST_LAUNCH_KEY = 'portal_first_launch_completed';

export default function Home() {
  const { isLoading } = useOnboarding();
  const { username, avatarUri, fetchProfile, syncStatus, setUsername } = useUserProfile();
  const nostrService = useNostrService();
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const isMounted = useRef(true);

  // This would come from a real user context in the future
  const [userPublicKey, setUserPublicKey] = useState('unknown pubkey');

  // Function to mark the welcome screen as viewed
  const markWelcomeAsViewed = useCallback(async () => {
    try {
      if (isMounted.current) {
        await SecureStore.setItemAsync(FIRST_LAUNCH_KEY, 'true');
        setIsFirstLaunch(false);
      }
    } catch (e) {
      console.error('Failed to mark welcome as viewed:', e);
    }
  }, []);

  useEffect(() => {
    // Cleanup function to set mounted state to false
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    setUserPublicKey(nostrService.publicKey || '');

    // Check if this is the user's first launch after onboarding
    const checkFirstLaunch = async () => {
      try {
        if (!isMounted.current) return;

        const firstLaunchCompleted = await SecureStore.getItemAsync(FIRST_LAUNCH_KEY);
        setIsFirstLaunch(firstLaunchCompleted !== 'true');
        // We no longer set the flag here - we'll set it after user interaction
      } catch (e) {
        console.error('Failed to check first launch status:', e);
      }
    };

    checkFirstLaunch();
  }, [nostrService]);

  // Fetch profile when NostrService is ready and initialize if needed
  useEffect(() => {
    const initializeProfile = async () => {
      // Only proceed if we have a public key and service is initialized
      if (!nostrService.isInitialized || !nostrService.publicKey || !nostrService.portalApp) {
        return;
      }

      // Only run on first load (syncStatus === 'idle')
      if (syncStatus !== 'idle') {
        return;
      }

      // Prevent re-initialization if already done
      const hasInitialized = await SecureStore.getItemAsync('profile_initialized');
      if (hasInitialized === 'true') {
        return;
      }

      console.log('Starting profile initialization for:', nostrService.publicKey);

      try {
        // Check if this was a generated or imported seed
        const seedOrigin = await SecureStore.getItemAsync('portal_seed_origin');
        console.log('Seed origin:', seedOrigin);

        let currentUsername = '';

        if (seedOrigin === 'imported') {
          // For imported seeds, fetch existing profile first
          console.log('Imported seed detected, fetching existing profile...');
          await fetchProfile(nostrService.publicKey);

          // Wait a moment for the fetch to complete and update local state
          await new Promise(resolve => setTimeout(resolve, 1500));

          // Check if we have a username after the fetch
          currentUsername = (await SecureStore.getItemAsync('portal_username')) || '';
        } else {
          // For generated seeds, skip fetch (new keypair = no existing profile)
          console.log('Generated seed detected, skipping profile fetch...');

          // Check if we already have a local username (shouldn't happen, but be safe)
          currentUsername = (await SecureStore.getItemAsync('portal_username')) || '';
        }

        // Clean up the seed origin flag after first use
        await SecureStore.deleteItemAsync('portal_seed_origin');

        // If no username found, create a dummy profile
        if (!currentUsername.trim()) {
          console.log('No existing profile found, creating dummy profile...');

          const randomGamertag = generateRandomGamertag();
          console.log('Generated random gamertag:', randomGamertag);

          // Set local username first
          await setUsername(randomGamertag);

          // Then set the profile on the nostr network
          await nostrService.setUserProfile({
            nip05: `${randomGamertag}@getportal.cc`,
            name: randomGamertag,
            picture: '',
            displayName: randomGamertag,
          });

          console.log('Dummy profile created successfully:', randomGamertag);
        } else {
          console.log('Existing profile found:', currentUsername);
        }

        // Mark as initialized to prevent re-runs
        await SecureStore.setItemAsync('profile_initialized', 'true');
      } catch (error) {
        console.error('Profile initialization failed:', error);
        // Don't retry automatically - user can manually refresh
      }
    };

    initializeProfile();
  }, [
    nostrService.isInitialized,
    nostrService.publicKey,
    syncStatus,
    fetchProfile,
    setUsername,
    nostrService.portalApp,
    nostrService.setUserProfile,
  ]);

  const onRefresh = async () => {
    setRefreshing(true);
    // TODO: Add refresh functionality here when needed
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  // Memoize the truncated key to prevent recalculation on every render
  const truncatedPublicKey = useMemo(() => {
    if (!userPublicKey) return '';

    // Get screen width to determine how many characters to show
    const screenWidth = Dimensions.get('window').width;

    // Adjust number of characters based on screen width
    let charsToShow = 15;
    if (screenWidth < 375) {
      charsToShow = 8;
    } else if (screenWidth < 414) {
      charsToShow = 12;
    }

    return `${userPublicKey.substring(0, charsToShow)}...${userPublicKey.substring(userPublicKey.length - charsToShow)}`;
  }, [userPublicKey]);

  // Calculate if we need to truncate the username based on screen width
  const screenWidth = Dimensions.get('window').width;
  const maxUsernameWidth = screenWidth * 0.8; // 80% of screen width

  // Approximate the character count based on average character width
  // This is an estimation since actual rendering width depends on font and character types
  const getEstimatedTextWidth = (text: string) => {
    // Estimate avg char width (varies by font, this is a rough approximation)
    const avgCharWidth = 10; // pixels per character
    return text.length * avgCharWidth;
  };

  // Memoize the username display logic - use username directly with @getportal.cc suffix
  const truncatedUsername = useMemo(() => {
    if (!username) return '';

    const fullUsername = `${username}@getportal.cc`;

    // Check if username is likely to exceed 80% of screen width
    if (getEstimatedTextWidth(fullUsername) > maxUsernameWidth) {
      const maxChars = Math.floor(maxUsernameWidth / 10);
      const charsPerSide = Math.floor((maxChars - 3) / 2);
      return `${fullUsername.substring(0, charsPerSide)}...${fullUsername.substring(fullUsername.length - charsPerSide)}`;
    }

    return fullUsername;
  }, [username, maxUsernameWidth]);

  // Memoize handlers to prevent recreation on every render
  const handleQrScan = useCallback(() => {
    // Using 'modal' navigation to ensure cleaner navigation history
    router.push({
      pathname: '/qr',
      params: {
        source: 'homepage',
        timestamp: Date.now(), // Prevent caching issues
      },
    });

    // Mark welcome as viewed when user scans QR code
    if (isFirstLaunch) {
      markWelcomeAsViewed();
    }
  }, [isFirstLaunch, markWelcomeAsViewed]);

  const handleSettingsNavigate = useCallback(() => {
    router.push('/settings');
  }, []);

  // Don't render anything until we've checked the onboarding status and first launch status
  if (isLoading || isFirstLaunch === null) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={Colors.green} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ThemedView style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.green]}
              tintColor={Colors.green}
              title="Pull to refresh profile"
              titleColor={Colors.almostWhite}
            />
          }
        >
          <ThemedView style={styles.header}>
            <View style={styles.headerContent}>
              <TouchableOpacity style={styles.headerLeft} onPress={handleSettingsNavigate}>
                <View style={styles.welcomeRow}>
                  <ThemedText
                    style={styles.welcomeText}
                    lightColor={Colors.darkGray}
                    darkColor={Colors.dirtyWhite}
                    numberOfLines={1}
                    ellipsizeMode="middle"
                  >
                    {username ? `Welcome back, ${username} 👋` : 'Welcome back 👋'}
                  </ThemedText>
                  <ConnectionStatusIndicator size={10} />
                </View>
                <View style={styles.userInfoContainer}>
                  {/* Profile Avatar */}
                  <View style={styles.avatarContainer}>
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <User size={18} color={Colors.almostWhite} />
                      </View>
                    )}
                  </View>

                  <View style={styles.userTextContainer}>
                    {username ? (
                      <ThemedText
                        style={[
                          styles.username,
                          username.length > 15 && { fontSize: 18 },
                          username.length > 20 && { fontSize: 16 },
                        ]}
                        numberOfLines={1}
                        ellipsizeMode="middle"
                        lightColor={Colors.darkGray}
                        darkColor={Colors.almostWhite}
                      >
                        <ThemedText>{username}</ThemedText>
                        <ThemedText>@getportal.cc</ThemedText>
                      </ThemedText>
                    ) : null}
                    <ThemedText
                      style={styles.publicKey}
                      lightColor={username ? Colors.gray : Colors.darkGray}
                      darkColor={username ? Colors.dirtyWhite : Colors.almostWhite}
                    >
                      {truncatedPublicKey}
                    </ThemedText>
                  </View>
                  <TouchableOpacity style={styles.qrButton} onPress={handleQrScan}>
                    <QrCode size={40} color={Colors.almostWhite} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </View>
          </ThemedView>

          {isFirstLaunch === true ? (
            <View style={styles.welcomeContainer}>
              <View style={styles.welcomeCard}>
                <ThemedText
                  type="title"
                  style={styles.welcomeTitle}
                  darkColor={Colors.almostWhite}
                  lightColor={Colors.almostWhite}
                >
                  Welcome to Portal App!
                </ThemedText>

                <ThemedText
                  style={styles.welcomeSubtitle}
                  darkColor={Colors.dirtyWhite}
                  lightColor={Colors.darkGray}
                >
                  Your secure portal to the web3 world
                </ThemedText>

                <View style={styles.illustrationContainer}>
                  <QrCode size={80} color={Colors.green} style={styles.illustration} />
                </View>

                <ThemedText
                  style={styles.welcomeDescription}
                  darkColor={Colors.dirtyWhite}
                  lightColor={Colors.darkGray}
                >
                  Get started by scanning a QR code to log in to a website or make a payment.
                </ThemedText>

                <View style={styles.scanQrContainer}>
                  <TouchableOpacity style={styles.scanQrButton} onPress={handleQrScan}>
                    <QrCode size={24} color={Colors.almostWhite} style={styles.qrIcon} />
                    <ThemedText
                      style={styles.scanQrText}
                      darkColor={Colors.almostWhite}
                      lightColor={Colors.almostWhite}
                    >
                      Scan QR Code
                    </ThemedText>
                    <ArrowRight size={18} color={Colors.almostWhite} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.dismissButton} onPress={markWelcomeAsViewed}>
                  <ThemedText
                    style={styles.dismissText}
                    darkColor={Colors.dirtyWhite}
                    lightColor={Colors.darkGray}
                  >
                    Dismiss Welcome
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {/* Pending Requests Section */}
              <PendingRequestsList />

              {/* Upcoming Payments Section */}
              <UpcomingPaymentsList />

              {/* Recent Activities Section */}
              <RecentActivitiesList />
            </>
          )}
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.darkerGray,
  },
  container: {
    flex: 1,
    padding: 0,
    backgroundColor: Colors.darkerGray,
  },
  header: {
    backgroundColor: Colors.darkerGray,
    paddingHorizontal: 20,
    paddingVertical: 12,
    width: '100%',
  },
  headerContent: {
    width: '100%',
  },
  headerLeft: {
    flex: 1,
    justifyContent: 'center',
  },
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  welcomeText: {
    fontSize: 14,
    fontWeight: '400',
  },
  userInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarContainer: {
    width: 55,
    height: 55,
    borderRadius: 32,
    backgroundColor: Colors.gray,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: 55,
    height: 55,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    width: 55,
    height: 55,
    borderRadius: 32,
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userTextContainer: {
    flex: 1,
  },
  username: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 4,
    flexShrink: 1,
  },
  publicKey: {
    fontSize: 14,
    fontWeight: '400',
  },
  qrButton: {
    width: 72,
    height: 72,
    borderRadius: 50,
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },

  welcomeContainer: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  welcomeCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    padding: 24,
    minHeight: 200,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  illustrationContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  illustration: {
    opacity: 0.9,
  },
  welcomeDescription: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 30,
  },
  scanQrContainer: {
    alignItems: 'center',
  },
  scanQrButton: {
    flexDirection: 'row',
    backgroundColor: Colors.green,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrIcon: {
    marginRight: 10,
  },
  scanQrText: {
    fontSize: 18,
    fontWeight: '600',
    marginRight: 10,
  },
  button: {
    fontSize: 16,
    backgroundColor: 'white',
    color: 'black',
    padding: 15,
    borderRadius: 8,
    marginVertical: 10,
    width: '80%',
    textAlign: 'center',
  },
  dismissButton: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 8,
  },
  dismissText: {
    fontSize: 14,
    fontWeight: '500',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.darkerGray,
  },
});
