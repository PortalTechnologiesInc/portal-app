import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Alert,
  View,
  ScrollView,
  RefreshControl,
  Switch,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, Fingerprint, Shield } from 'lucide-react-native';
import { Moon, Sun, Smartphone } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnboarding } from '@/context/OnboardingContext';
import {
  isWalletConnected,
  walletUrlEvents,
  deleteMnemonic,
  getMnemonic,
} from '@/services/SecureStorageService';
import { resetDatabase } from '@/services/database/DatabaseProvider';
import { useNostrService } from '@/context/NostrServiceContext';
import { showToast } from '@/utils/Toast';
import { authenticateForSensitiveAction } from '@/services/BiometricAuthService';
import { isAppLockEnabled, setAppLockEnabled, canEnableAppLock } from '@/services/AppLockService';
import { useAppLock } from '@/context/AppLockContext';
import { useTheme, ThemeMode } from '@/context/ThemeContext';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function SettingsScreen() {
  const router = useRouter();
  const { resetOnboarding } = useOnboarding();
  const nostrService = useNostrService();
  const { refreshLockStatus } = useAppLock();
  const { themeMode, setThemeMode } = useTheme();
  const [isWalletConnectedState, setIsWalletConnectedState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [appLockEnabled, setAppLockEnabledState] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const inputBorderColor = useThemeColor({}, 'inputBorder');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonDangerColor = useThemeColor({}, 'buttonDanger');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');
  const buttonDangerTextColor = useThemeColor({}, 'buttonDangerText');
  const statusConnectedColor = useThemeColor({}, 'statusConnected');

  // Get real NWC connection status
  const { nwcConnectionStatus } = nostrService;

  // Initialize wallet connection status and app lock settings
  useEffect(() => {
    const checkWalletConnection = async () => {
      try {
        const walletConnected = await isWalletConnected();
        // Use real NWC connection status if available, otherwise fall back to URL existence
        const realConnectionStatus =
          nwcConnectionStatus !== null ? nwcConnectionStatus : walletConnected;
        setIsWalletConnectedState(realConnectionStatus);
      } catch (error) {
        console.error('Error checking connection:', error);
      }
    };

    const checkAppLockSettings = async () => {
      try {
        const [lockEnabled, biometricEnabled] = await Promise.all([
          isAppLockEnabled(),
          canEnableAppLock(),
        ]);
        setAppLockEnabledState(lockEnabled);
        setBiometricAvailable(biometricEnabled);
      } catch (error) {
        console.error('Error checking app lock settings:', error);
      }
    };

    const initializeSettings = async () => {
      await Promise.all([checkWalletConnection(), checkAppLockSettings()]);
      setIsLoading(false);
    };

    initializeSettings();

    // Subscribe to wallet URL changes
    const subscription = walletUrlEvents.addListener('walletUrlChanged', async newUrl => {
      setIsWalletConnectedState(Boolean(newUrl?.trim()));
    });

    return () => subscription.remove();
  }, [nwcConnectionStatus]);

  // Update wallet connection status when nwcConnectionStatus changes
  useEffect(() => {
    if (nwcConnectionStatus !== null) {
      setIsWalletConnectedState(nwcConnectionStatus);
    }
  }, [nwcConnectionStatus]);

  const handleWalletCardPress = () => {
    router.push({
      pathname: '/wallet',
      params: {
        source: 'settings',
      },
    });
  };

  const handleNostrCardPress = () => {
    // Navigate to nostr management page with proper source parameter
    router.push({
      pathname: '/relays',
      params: {
        source: 'settings',
      },
    });
  };

  const handleExportMnemonic = () => {
    authenticateForSensitiveAction(async () => {
      console.log('Exporting mnemonic...');
      try {
        const mnemonic = await getMnemonic();
        console.log('Mnemonic:', mnemonic);
        if (mnemonic) {
          Clipboard.setString(mnemonic);
          showToast('Mnemonic copied to clipboard', 'success');
        } else {
          showToast('No mnemonic found', 'error');
        }
      } catch (error) {
        console.error('Error exporting mnemonic:', error);
        showToast('Failed to export mnemonic', 'error');
      }
    }, 'Authenticate to export your seed phrase');
  };

  const handleExportAppData = () => {
    authenticateForSensitiveAction(async () => {
      console.log('Exporting app data...');
      // TODO: Implement app data export logic
      showToast('App data export not yet implemented', 'success');
    }, 'Authenticate to export app data');
  };

  const handleToggleAppLock = async (enabled: boolean) => {
    if (enabled && !biometricAvailable) {
      Alert.alert(
        'Biometric Authentication Required',
        'To enable app lock, you need to set up biometric authentication (fingerprint, face recognition, or PIN) on your device first.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (enabled) {
      // When enabling, require authentication to confirm
      authenticateForSensitiveAction(async () => {
        try {
          await setAppLockEnabled(true);
          setAppLockEnabledState(true);
          // Don't lock immediately when user is actively enabling it
          await refreshLockStatus(false);
          showToast('App lock enabled', 'success');
        } catch (error) {
          console.error('Error enabling app lock:', error);
          showToast('Failed to enable app lock', 'error');
        }
      }, 'Authenticate to enable app lock');
    } else {
      // When disabling, require authentication to confirm
      authenticateForSensitiveAction(async () => {
        try {
          await setAppLockEnabled(false);
          setAppLockEnabledState(false);
          // When disabling, unlock the app
          await refreshLockStatus(false);
          showToast('App lock disabled', 'success');
        } catch (error) {
          console.error('Error disabling app lock:', error);
          showToast('Failed to disable app lock', 'error');
        }
      }, 'Authenticate to disable app lock');
    }
  };

  const handleThemeChange = () => {
    // Cycle through theme options: auto -> light -> dark -> auto
    const nextTheme: ThemeMode =
      themeMode === 'auto' ? 'light' : themeMode === 'light' ? 'dark' : 'auto';

    setThemeMode(nextTheme);
    showToast(
      `Theme changed to ${
        nextTheme === 'auto' ? 'Auto (System)' : nextTheme === 'light' ? 'Light' : 'Dark'
      }`,
      'success'
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Refresh connection status for both relays and NWC wallet
      await nostrService.refreshConnectionStatus();
      await nostrService.refreshNwcConnectionStatus();
    } catch (error) {
      console.error('Error refreshing connection status:', error);
    }
    setRefreshing(false);
  };

  const handleClearAppData = () => {
    Alert.alert(
      'Reset App',
      'This will reset all app data and take you back to onboarding. Are you sure?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear Data',
          style: 'destructive',
          onPress: () => {
            authenticateForSensitiveAction(async () => {
              try {
                // Delete mnemonic first
                deleteMnemonic();
                // Reset the database
                await resetDatabase();
                // Reset onboarding state
                await resetOnboarding();
              } catch (error) {
                console.error('Error clearing app data:', error);
                Alert.alert('Error', 'Failed to Reset App. Please try again.');
              }
            }, 'Authenticate to reset all app data');
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: backgroundColor }]} edges={['top']}>
        <ThemedView style={styles.container}>
          <ThemedView style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <ArrowLeft size={20} color={primaryTextColor} />
            </TouchableOpacity>
            <ThemedText
              style={styles.headerText}
              lightColor={primaryTextColor}
              darkColor={primaryTextColor}
            >
              Settings
            </ThemedText>
          </ThemedView>
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <ThemedText style={{ color: primaryTextColor }}>Loading...</ThemedText>
          </ScrollView>
        </ThemedView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={20} color={primaryTextColor} />
          </TouchableOpacity>
          <ThemedText
            style={styles.headerText}
            lightColor={primaryTextColor}
            darkColor={primaryTextColor}
          >
            Settings
          </ThemedText>
        </ThemedView>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[statusConnectedColor]}
              tintColor={statusConnectedColor}
              title="Pull to refresh connection"
              titleColor={primaryTextColor}
            />
          }
        >
          {/* Wallet Section */}
          <ThemedView style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
              Wallet
            </ThemedText>
            <ThemedView style={styles.walletSection}>
              <TouchableOpacity
                style={[styles.card, { backgroundColor: cardBackgroundColor }]}
                onPress={handleWalletCardPress}
                activeOpacity={0.7}
              >
                <View style={styles.cardContent}>
                  <View style={styles.cardLeft}>
                    <ThemedText style={[styles.cardTitle, { color: primaryTextColor }]}>
                      Wallet Connect
                    </ThemedText>
                    <ThemedText style={[styles.cardStatus, { color: secondaryTextColor }]}>
                      {isWalletConnectedState ? 'Connected' : 'Not connected'}
                    </ThemedText>
                  </View>
                  <ChevronRight size={24} color={secondaryTextColor} />
                </View>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>

          {/* Nostr Section */}
          <ThemedView style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
              Relays
            </ThemedText>
            <ThemedView style={styles.walletSection}>
              <TouchableOpacity
                style={[styles.card, { backgroundColor: cardBackgroundColor }]}
                onPress={handleNostrCardPress}
                activeOpacity={0.7}
              >
                <View style={styles.cardContent}>
                  <View style={styles.cardLeft}>
                    <ThemedText style={[styles.cardTitle, { color: primaryTextColor }]}>
                      Nostr relays
                    </ThemedText>
                    <ThemedText style={[styles.cardStatus, { color: secondaryTextColor }]}>
                      Manage the Nostr relays your app connects to
                    </ThemedText>
                  </View>
                  <ChevronRight size={24} color={secondaryTextColor} />
                </View>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>

          {/* Theme Section */}
          <ThemedView style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
              Appearance
            </ThemedText>
            <ThemedView style={styles.themeSection}>
              <ThemedView style={[styles.themeCard, { backgroundColor: cardBackgroundColor }]}>
                <TouchableOpacity
                  onPress={handleThemeChange}
                  activeOpacity={0.7}
                  style={styles.themeCardTouchable}
                >
                  <View style={styles.themeCardContent}>
                    <View style={styles.themeCardLeft}>
                      <View style={styles.themeIconContainer}>
                        {themeMode === 'auto' ? (
                          <Smartphone size={24} color={buttonPrimaryColor} />
                        ) : themeMode === 'light' ? (
                          <Sun size={24} color={statusConnectedColor} />
                        ) : (
                          <Moon size={24} color={buttonPrimaryColor} />
                        )}
                      </View>
                      <View style={styles.themeTextContainer}>
                        <ThemedText style={[styles.themeTitle, { color: primaryTextColor }]}>
                          Theme
                        </ThemedText>
                        <ThemedText style={[styles.themeStatus, { color: secondaryTextColor }]}>
                          {themeMode === 'auto'
                            ? 'Auto (System)'
                            : themeMode === 'light'
                              ? 'Light'
                              : 'Dark'}
                        </ThemedText>
                      </View>
                    </View>
                    <View style={[styles.themeIndicator, { backgroundColor: buttonPrimaryColor }]}>
                      <ThemedText style={[styles.tapToChange, { color: buttonPrimaryTextColor }]}>
                        Tap to change
                      </ThemedText>
                    </View>
                  </View>
                </TouchableOpacity>
              </ThemedView>
            </ThemedView>
          </ThemedView>

          {/* Security Section */}
          <ThemedView style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
              Security
            </ThemedText>
            <ThemedView style={styles.securitySection}>
              <View style={[styles.appLockOption, { backgroundColor: cardBackgroundColor }]}>
                <View style={styles.appLockLeft}>
                  <View style={styles.appLockIconContainer}>
                    <Shield size={24} color={primaryTextColor} />
                  </View>
                  <View style={styles.appLockTextContainer}>
                    <ThemedText style={[styles.appLockTitle, { color: primaryTextColor }]}>
                      App Lock
                    </ThemedText>
                    <ThemedText style={[styles.appLockDescription, { color: secondaryTextColor }]}>
                      {biometricAvailable
                        ? 'Require biometric authentication to open the app'
                        : 'Biometric authentication not available'}
                    </ThemedText>
                  </View>
                </View>
                <Switch
                  value={appLockEnabled}
                  onValueChange={handleToggleAppLock}
                  disabled={!biometricAvailable}
                  trackColor={{
                    false: inputBorderColor,
                    true: buttonPrimaryColor,
                  }}
                  thumbColor={appLockEnabled ? primaryTextColor : secondaryTextColor}
                  ios_backgroundColor={inputBorderColor}
                />
              </View>
            </ThemedView>
          </ThemedView>

          {/* Export Section */}
          <ThemedView style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
              Export
            </ThemedText>
            <ThemedView style={styles.exportSection}>
              <TouchableOpacity
                style={[styles.exportButton, { backgroundColor: buttonPrimaryColor }]}
                onPress={handleExportMnemonic}
              >
                <View style={styles.exportButtonContent}>
                  <ThemedText style={[styles.exportButtonText, { color: buttonPrimaryTextColor }]}>
                    Export Mnemonic
                  </ThemedText>
                  <View style={styles.fingerprintIcon}>
                    <Fingerprint size={20} color={buttonPrimaryTextColor} />
                  </View>
                </View>
              </TouchableOpacity>
            </ThemedView>
            <ThemedView style={styles.exportSection}>
              <TouchableOpacity
                style={[styles.exportButton, { backgroundColor: buttonPrimaryColor }]}
                onPress={handleExportAppData}
              >
                <View style={styles.exportButtonContent}>
                  <ThemedText style={[styles.exportButtonText, { color: buttonPrimaryTextColor }]}>
                    Export App Data
                  </ThemedText>
                  <View style={styles.fingerprintIcon}>
                    <Fingerprint size={20} color={buttonPrimaryTextColor} />
                  </View>
                </View>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>

          {/* Extra Section */}
          <ThemedView style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
              Extra
            </ThemedText>
            <ThemedView style={styles.extraSection}>
              <TouchableOpacity
                style={[styles.clearDataButton, { backgroundColor: buttonDangerColor }]}
                onPress={handleClearAppData}
              >
                <View style={styles.clearDataButtonContent}>
                  <ThemedText
                    style={[styles.clearDataButtonText, { color: buttonDangerTextColor }]}
                  >
                    Reset App
                  </ThemedText>
                  <View style={styles.fingerprintIcon}>
                    <Fingerprint size={20} color={buttonDangerTextColor} />
                  </View>
                </View>
              </TouchableOpacity>
            </ThemedView>
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
  walletSection: {
    paddingVertical: 12,
    width: '100%',
  },
  themeSection: {
    paddingVertical: 12,
    width: '100%',
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardStatus: {
    fontSize: 14,
  },
  exportSection: {
    paddingVertical: 6,
    width: '100%',
  },
  exportButton: {
    padding: 16,
    borderRadius: 8,
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 8,
  },
  exportButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  exportButtonContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    position: 'relative',
  },
  fingerprintIcon: {
    position: 'absolute',
    right: 0,
  },
  securitySection: {
    paddingVertical: 12,
    width: '100%',
  },
  appLockOption: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appLockLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  appLockIconContainer: {
    marginRight: 12,
  },
  appLockTextContainer: {
    flex: 1,
  },
  appLockTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  appLockDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  themeCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  themeCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  themeCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeIconContainer: {
    marginRight: 12,
  },
  themeTextContainer: {
    flex: 1,
  },
  themeTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  themeStatus: {
    fontSize: 14,
  },
  themeIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  tapToChange: {
    fontSize: 12,
    fontWeight: '500',
  },
  themeCardTouchable: {
    width: '100%',
  },
  extraSection: {
    paddingVertical: 12,
    width: '100%',
  },
  clearDataButton: {
    padding: 16,
    borderRadius: 8,
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
    alignSelf: 'center',
  },
  clearDataButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 500,
    marginRight: 0,
    paddingRight: 0,
    paddingLeft: 0,
    marginLeft: 0,
  },
  clearDataButtonContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    position: 'relative',
  },
});
