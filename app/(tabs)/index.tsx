import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { ArrowRight, Nfc, QrCode, User } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ConnectionStatusIndicator } from '@/components/ConnectionStatusIndicator';
import { PendingRequestsList } from '@/components/PendingRequestsList';
import { RecentActivitiesList } from '@/components/RecentActivitiesList';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { UpcomingPaymentsList } from '@/components/UpcomingPaymentsList';
import { WelcomeBanner } from '@/components/WelcomeBanner';
import { Colors } from '@/constants/Colors';
import { useNostrService } from '@/context/NostrServiceContext';
import { useOnboarding } from '@/context/OnboardingContext';
import { useUserProfile } from '@/context/UserProfileContext';
import { useWalletManager } from '@/context/WalletManagerContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { formatAvatarUri } from '@/utils/common';

const FIRST_LAUNCH_KEY = 'portal_first_launch_completed';

export default function Home() {
  const { isLoading, isOnboardingComplete } = useOnboarding();
  const { username, displayName, avatarUri, avatarRefreshKey } = useUserProfile();
  const nostrService = useNostrService();
  const walletService = useWalletManager();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // For triggering immediate ConnectionStatusIndicator updates

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const surfaceSecondaryColor = useThemeColor({}, 'surfaceSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');
  const buttonSuccessTextColor = useThemeColor({}, 'buttonSuccessText');

  // This would come from a real user context in the future
  const [userPublicKey, setUserPublicKey] = useState('unknown pubkey');

  useEffect(() => {
    setUserPublicKey(nostrService.publicKey || '');
  }, [nostrService]);

  // Profile initialization is now handled automatically in UserProfileContext

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Refresh wallet info
      await walletService.refreshWalletInfo();

      // Trigger ConnectionStatusIndicator update
      setRefreshTrigger(prev => prev + 1);
    } catch (_error) {}
    setRefreshing(false);
  };

  // Memoize the truncated key to prevent recalculation on every render
  const truncatedPublicKey = useMemo(() => {
    if (!userPublicKey) return '';

    // Get screen width to determine how many characters to show
    const screenWidth = Dimensions.get('window').width;

    // Adjust number of characters based on screen width
    let charsToShow = 22;
    if (screenWidth < 375) {
      charsToShow = 8;
    } else if (screenWidth < 414) {
      charsToShow = 14;
    }

    return `${userPublicKey.substring(0, charsToShow)}...${userPublicKey.substring(userPublicKey.length - charsToShow)}`;
  }, [userPublicKey]);

  // Memoize the username display logic - same responsive logic as npub
  // Truncate username only, then always append "@getportal.cc"
  const truncatedUsername = useMemo(() => {
    if (!username) return '';

    // Get screen width to determine how many characters to show (same logic as npub)
    const screenWidth = Dimensions.get('window').width;

    let charsToShow = 22;
    if (screenWidth < 375) {
      charsToShow = 8;
    } else if (screenWidth < 414) {
      charsToShow = 17;
    }

    // Use the same character limit as npub for the username part
    // This gives us responsive truncation that matches npub behavior
    if (username.length > charsToShow) {
      return `${username.substring(0, charsToShow - 3)}...`;
    }

    return username;
  }, [username]);

  // Memoize the display name for welcome text
  // Use display name if available, fallback to username
  const welcomeDisplayName = useMemo(() => {
    const nameToShow = displayName || username;
    if (!nameToShow) return '';

    // Get screen width to determine how many characters to show
    const screenWidth = Dimensions.get('window').width;

    let charsToShow = 25; // Slightly more generous for display names
    if (screenWidth < 375) {
      charsToShow = 12;
    } else if (screenWidth < 414) {
      charsToShow = 20;
    }

    // Truncate if too long
    if (nameToShow.length > charsToShow) {
      return `${nameToShow.substring(0, charsToShow - 3)}...`;
    }

    return nameToShow;
  }, [displayName, username]);

  // Memoize handlers to prevent recreation on every render
  const handleScan = useCallback(async (scanType: 'nfc' | 'qr') => {
    // Determine the navigation path based on scan type
    const pathname = scanType === 'nfc' ? '/nfc' : '/qr';

    // Using 'modal' navigation to ensure cleaner navigation history
    router.push({
      pathname,
      params: {
        source: 'homepage',
        scanType, // Pass the scan type to the destination
        timestamp: Date.now(), // Prevent caching issues
      },
    });

    // Mark welcome banner as viewed when user interacts with scan buttons (same as old behavior)
    try {
      await SecureStore.setItemAsync(FIRST_LAUNCH_KEY, 'true');
    } catch (_e) {}
  }, []);

  // Legacy handler for backward compatibility
  const handleQrScan = useCallback(() => {
    handleScan('qr');
  }, [handleScan]);

  const handleSettingsNavigate = useCallback(() => {
    router.push('/(tabs)/IdentityList');
  }, []);

  // Don't render anything until onboarding state is loaded
  if (isLoading) {
    return (
      <View style={[styles.loaderContainer, { backgroundColor }]}>
        <ActivityIndicator size="large" color={buttonPrimaryColor} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[buttonPrimaryColor]}
              tintColor={buttonPrimaryColor}
              title="Pull to refresh profile"
              titleColor={secondaryTextColor}
            />
          }
        >
          <ThemedView style={styles.header}>
            <View style={styles.headerContent}>
              <TouchableOpacity style={styles.headerLeft} onPress={handleSettingsNavigate}>
                <View style={styles.welcomeRow}>
                  <ThemedText
                    style={styles.welcomeText}
                    darkColor={Colors.dirtyWhite}
                    lightColor={Colors.gray700}
                    numberOfLines={1}
                    ellipsizeMode="middle"
                  >
                    {username ? (
                      <>
                        Welcome back,{' '}
                        <ThemedText style={styles.welcomeNameBold}>{welcomeDisplayName}</ThemedText>{' '}
                        👋
                      </>
                    ) : (
                      'Welcome back 👋'
                    )}
                  </ThemedText>
                  <ConnectionStatusIndicator size={10} triggerRefresh={refreshTrigger} />
                </View>
                <View style={styles.userInfoContainer}>
                  {/* Profile Avatar */}
                  <View
                    style={[styles.avatarContainer, { backgroundColor: surfaceSecondaryColor }]}
                  >
                    {avatarUri ? (
                      <Image
                        source={{ uri: formatAvatarUri(avatarUri, avatarRefreshKey) || '' }}
                        style={styles.avatar}
                      />
                    ) : (
                      <View
                        style={[styles.avatarPlaceholder, { backgroundColor: buttonPrimaryColor }]}
                      >
                        <User size={24} color={buttonPrimaryTextColor} />
                      </View>
                    )}
                  </View>

                  <View style={styles.userTextContainer}>
                    {username ? (
                      <ThemedText
                        style={styles.username}
                        numberOfLines={1}
                        ellipsizeMode="clip"
                        lightColor={Colors.gray900}
                        darkColor={Colors.almostWhite}
                      >
                        <ThemedText style={styles.usernameBold}>{truncatedUsername}</ThemedText>
                        <ThemedText style={styles.usernameBold}>@getportal.cc</ThemedText>
                      </ThemedText>
                    ) : null}
                    <ThemedText
                      style={styles.publicKey}
                      lightColor={username ? Colors.gray600 : Colors.gray700}
                      darkColor={username ? Colors.dirtyWhite : Colors.almostWhite}
                    >
                      {truncatedPublicKey}
                    </ThemedText>
                  </View>
                </View>
              </TouchableOpacity>
              <View style={styles.headerButtonsContainer}>
                <View style={styles.buttonContainer}>
                  <TouchableOpacity
                    style={[styles.nfcButton, { backgroundColor: buttonPrimaryColor }]}
                    onPress={() => handleScan('nfc')}
                  >
                    <ThemedText style={[styles.nfcText, { color: buttonPrimaryTextColor }]}>
                      Contactless
                    </ThemedText>
                    <Nfc size={24} color={buttonPrimaryTextColor} />
                  </TouchableOpacity>
                </View>
                <View style={styles.buttonContainer}>
                  <TouchableOpacity
                    style={[styles.qrButton, { backgroundColor: buttonPrimaryColor }]}
                    onPress={() => handleScan('qr')}
                  >
                    <ThemedText style={[styles.qrText, { color: buttonPrimaryTextColor }]}>
                      Scan QR
                    </ThemedText>
                    <QrCode size={24} color={buttonPrimaryTextColor} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ThemedView>

          <WelcomeBanner />

          {/* Pending Requests Section */}
          <PendingRequestsList />

          {/* Upcoming Payments Section */}
          <UpcomingPaymentsList />

          {/* Recent Activities Section */}
          <RecentActivitiesList />
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
    padding: 0,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    width: '100%',
  },
  headerContent: {
    width: '100%',
  },
  headerLeft: {
    flex: 1,
    justifyContent: 'center',
  },
  headerButtonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginTop: 20,
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
    width: 50,
    height: 50,
    borderRadius: 25,
    // backgroundColor handled by theme
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    // backgroundColor handled by theme (buttonPrimary)
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
    width: '100%',
    height: 48,
    borderRadius: 12,
    // backgroundColor handled by theme (buttonPrimary)
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  buttonContainer: {
    flex: 1,
  },
  nfcButton: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    // backgroundColor handled by theme (buttonPrimary)
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  nfcText: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 6,
  },
  qrText: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 6,
  },

  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeNameBold: {
    fontWeight: '700',
  },
  usernameBold: {
    fontWeight: '700',
  },
});
