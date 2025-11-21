import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Alert,
  View,
  ScrollView,
  RefreshControl,
  Switch,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  ChevronRight,
  Fingerprint,
  Shield,
  X,
  Check,
  Wallet,
  Wifi,
  RotateCcw,
  Clock,
  KeyRound,
} from 'lucide-react-native';
import { Moon, Sun, Smartphone } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { walletUrlEvents, getMnemonic, getWalletUrl } from '@/services/SecureStorageService';
import { useNostrService } from '@/context/NostrServiceContext';
import { showToast } from '@/utils/Toast';
import { authenticateForSensitiveAction } from '@/services/BiometricAuthService';
import { useTheme, ThemeMode } from '@/context/ThemeContext';
import { useCurrency } from '@/context/CurrencyContext';
import { Currency, CurrencyHelpers } from '@/utils/currency';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useWalletStatus } from '@/hooks/useWalletStatus';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { useKey } from '@/context/KeyContext';
import { getNsecStringFromKey } from '@/utils/keyHelpers';
import { useAppLock } from '@/context/AppLockContext';
import { LockTimerDuration, PIN_MIN_LENGTH, PIN_MAX_LENGTH } from '@/services/AppLockService';
import { PINSetupScreen } from '@/components/PINSetupScreen';
import { PINKeypad } from '@/components/PINKeypad';

type PinVerificationConfig = {
  title: string;
  instructions: string;
  onSuccess?: (() => Promise<void> | void) | null;
};

export default function SettingsScreen() {
  const router = useRouter();
  const { resetApp } = useDatabaseContext();
  const nostrService = useNostrService();
  const { themeMode, setThemeMode } = useTheme();
  const {
    preferredCurrency,
    setPreferredCurrency,
    getCurrentCurrencyDisplayName,
    getCurrentCurrencySymbol,
  } = useCurrency();
  const { mnemonic, nsec } = useKey();
  const {
    isLockEnabled,
    lockTimerDuration,
    timerOptions,
    setLockEnabled,
    setLockTimerDuration,
    setAuthMethodPreference,
    setupPIN,
    clearPIN,
    isFingerprintSupported,
    authMethod,
    verifyPIN,
    hasPIN,
    isBiometricAvailable,
  } = useAppLock();
  const [refreshing, setRefreshing] = useState(false);
  const [isCurrencyModalVisible, setIsCurrencyModalVisible] = useState(false);
  const [isTimerModalVisible, setIsTimerModalVisible] = useState(false);
  const [isPINSetupVisible, setIsPINSetupVisible] = useState(false);
  const [isPINVerifyVisible, setIsPINVerifyVisible] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [walletUrl, setWalletUrl] = useState('');
  const [pinSetupPurpose, setPinSetupPurpose] = useState<'change' | 'global'>('global');
  const [pinVerificationConfig, setPinVerificationConfig] = useState<PinVerificationConfig>({
    title: 'Verify PIN',
    instructions: 'Enter your PIN',
    onSuccess: null,
  });
  const [pendingLockEnable, setPendingLockEnable] = useState(false);
  const [pendingPinEnable, setPendingPinEnable] = useState(false);
  const [pendingBiometricEnable, setPendingBiometricEnable] = useState(false);

  // Unified wallet status
  const { hasLightningWallet, isLightningConnected } = useWalletStatus();

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
  const biometricLabel = Platform.OS === 'ios' ? 'Face ID' : 'Fingerprint';
  const isBiometricPreferred = authMethod === 'biometric' && isFingerprintSupported;

  // Get event-driven NWC connection status
  const { nwcConnectionStatus, nwcConnectionError, nwcConnecting } = nostrService;

  // Subscribe to wallet URL changes for display purposes
  useEffect(() => {
    const loadWalletUrl = async () => {
      try {
        const url = await getWalletUrl();
        setWalletUrl(url);
      } catch (error) {
        console.error('Error loading wallet URL:', error);
      }
    };

    loadWalletUrl();

    const subscription = walletUrlEvents.addListener('walletUrlChanged', async newUrl => {
      setWalletUrl(newUrl || '');
    });

    return () => subscription.remove();
  }, []);

  const handleWalletCardPress = () => {
    router.push({
      pathname: '/wallet',
      params: {
        source: 'settings',
      },
    });
  };

  const handleNostrCardPress = () => {
    router.push('/relays');
  };

  const handleRecoverTicketsPress = () => {
    router.push('/recoverTickets');
  };

  const resetPinVerificationConfig = () => {
    setPinVerificationConfig({
      title: 'Verify PIN',
      instructions: 'Enter your PIN',
      onSuccess: null,
    });
  };

  const closePinVerification = () => {
    setIsPINVerifyVisible(false);
    setPinError(false);
    resetPinVerificationConfig();
  };

  const showPinVerification = (config: PinVerificationConfig) => {
    setPinError(false);
    setPinVerificationConfig(config);
    setIsPINVerifyVisible(true);
  };

  const executeProtectedAction = async (
    action: () => Promise<void> | void,
    {
      reason,
      pinTitle,
      pinMessage,
    }: { reason: string; pinTitle: string; pinMessage: string }
  ) => {
    try {
      if (authMethod === 'biometric' && isFingerprintSupported) {
        const biometricAvailable = await isBiometricAvailable();
        if (biometricAvailable) {
          await authenticateForSensitiveAction(action, reason);
          return;
        }
      }

      if (hasPIN) {
        showPinVerification({
          title: pinTitle,
          instructions: pinMessage,
          onSuccess: action,
        });
        return;
      }

      await action();
    } catch (error) {
      console.error('Error executing protected action:', error);
      showToast('Failed to complete action', 'error');
    }
  };

  const handleExportMnemonic = () => {
    executeProtectedAction(
      async () => {
        console.log('Exporting mnemonic...');
        try {
          const mnemonicValue = await getMnemonic();
          console.log('Mnemonic:', mnemonicValue);
          if (mnemonicValue) {
            Clipboard.setString(mnemonicValue);
            showToast('Mnemonic copied to clipboard', 'success');
          } else {
            showToast('No mnemonic found', 'error');
          }
        } catch (error) {
          console.error('Error exporting mnemonic:', error);
          showToast('Failed to export mnemonic', 'error');
        }
      },
      {
        reason: 'Authenticate to export your seed phrase',
        pinTitle: 'Enter PIN to Export Mnemonic',
        pinMessage: 'Enter your PIN to export your seed phrase',
      }
    );
  };

  const handleExportNsec = () => {
    executeProtectedAction(
      async () => {
        const nsecStr = getNsecStringFromKey({ mnemonic, nsec });
        if (nsecStr) {
          Clipboard.setString(nsecStr);
          showToast('Nsec copied to clipboard', 'success');
        } else {
          showToast('No nsec found', 'error');
        }
      },
      {
        reason: 'Authenticate to export your nsec',
        pinTitle: 'Enter PIN to Export Nsec',
        pinMessage: 'Enter your PIN to export your nsec',
      }
    );
  };

  const handleExportAppData = () => {
    executeProtectedAction(
      async () => {
        console.log('Exporting app data...');
        // TODO: Implement app data export logic
        showToast('App data export not yet implemented', 'success');
      },
      {
        reason: 'Authenticate to export app data',
        pinTitle: 'Enter PIN to Export App Data',
        pinMessage: 'Enter your PIN to export your app data',
      }
    );
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

  const handleCurrencyChange = () => {
    setIsCurrencyModalVisible(true);
  };

  const handleCurrencySelect = (currency: Currency) => {
    setPreferredCurrency(currency);
    setIsCurrencyModalVisible(false);
  };

  const handleAppLockToggle = async (enabled: boolean) => {
    try {
      if (enabled) {
        if (!hasPIN) {
          setPendingLockEnable(true);
          setPinSetupPurpose('global');
          setIsPINSetupVisible(true);
          return;
        }

        await setLockEnabled(true);
        showToast('App lock enabled', 'success');
        return;
      }

      await executeProtectedAction(
        async () => {
          await setLockEnabled(false);
          showToast('App lock disabled', 'success');
        },
        {
          reason: 'Authenticate to disable app lock',
          pinTitle: 'Verify PIN to Disable App Lock',
          pinMessage: 'Enter your PIN to disable app lock',
        }
      );
    } catch (error) {
      console.error('Error toggling app lock:', error);
      showToast('Failed to update app lock setting', 'error');
    }
  };

  const handlePINSetupComplete = async (pin: string) => {
    try {
      await setupPIN(pin);
      setIsPINSetupVisible(false);

      if (pendingLockEnable) {
        await setLockEnabled(true);
        showToast('App lock enabled', 'success');
      } else if (pinSetupPurpose === 'change') {
        showToast('PIN updated successfully', 'success');
      } else {
        showToast('PIN saved successfully', 'success');
      }

      if (pendingBiometricEnable) {
        const biometricAvailable = await isBiometricAvailable();
        if (!biometricAvailable) {
          showToast('Biometric authentication unavailable', 'error');
        } else {
          await setAuthMethodPreference('biometric');
          showToast(`${biometricLabel} enabled`, 'success');
        }
      }
    } catch (error) {
      console.error('Error setting up PIN:', error);
      showToast('Failed to set up PIN', 'error');
    } finally {
      setPendingLockEnable(false);
      setPendingPinEnable(false);
      setPendingBiometricEnable(false);
    }
  };

  const handlePINVerifyComplete = async (pin: string) => {
    try {
      const isValid = await verifyPIN(pin);
      if (isValid) {
        setPinError(false);
        if (pinVerificationConfig.onSuccess) {
          await pinVerificationConfig.onSuccess();
        }
        closePinVerification();
      } else {
        setPinError(true);
        setTimeout(() => setPinError(false), 2000);
      }
    } catch (error) {
      console.error('Error verifying PIN:', error);
      setPinError(true);
      setTimeout(() => setPinError(false), 2000);
    }
  };

  const handleGlobalPinToggle = async (enabled: boolean) => {
    if (enabled) {
      if (hasPIN) {
        return;
      }
      setPendingPinEnable(true);
      setPinSetupPurpose('global');
      setIsPINSetupVisible(true);
      return;
    }

    if (!hasPIN) {
      return;
    }

    await executeProtectedAction(
      async () => {
        await clearPIN();
        if (isLockEnabled) {
          await setLockEnabled(false);
        }
        await setAuthMethodPreference(null);
        showToast('PIN disabled', 'success');
      },
      {
        reason: 'Authenticate to disable PIN',
        pinTitle: 'Verify PIN to Disable',
        pinMessage: 'Enter your PIN to disable it',
      }
    );
  };

  const handleChangePinPress = () => {
    executeProtectedAction(
      () => {
        setPinSetupPurpose('change');
        setIsPINSetupVisible(true);
      },
      {
        reason: 'Authenticate to change your PIN',
        pinTitle: 'Verify PIN to Continue',
        pinMessage: 'Enter your current PIN to change it',
      }
    );
  };

  const handleBiometricToggle = async (enabled: boolean) => {
    if (!isFingerprintSupported) {
      showToast(`${biometricLabel} not available`, 'error');
      return;
    }

    if (enabled && !hasPIN) {
      setPendingBiometricEnable(true);
      setPinSetupPurpose('global');
      setIsPINSetupVisible(true);
      return;
    }

    try {
      if (enabled) {
        const biometricAvailable = await isBiometricAvailable();
        if (!biometricAvailable) {
          showToast('Biometric authentication unavailable', 'error');
          return;
        }
        await setAuthMethodPreference('biometric');
        showToast(`${biometricLabel} enabled`, 'success');
      } else {
        await setAuthMethodPreference('pin');
        showToast(`${biometricLabel} disabled`, 'success');
      }
      setPendingBiometricEnable(false);
    } catch (error) {
      console.error('Error toggling biometrics:', error);
      showToast('Failed to update biometric preference', 'error');
    }
  };

  const pinSetupTitle = pinSetupPurpose === 'change' ? 'Update PIN' : 'Set PIN';
  const pinSetupEnterMessage =
    pinSetupPurpose === 'change'
      ? 'Enter a new PIN to replace your current one'
      : 'Enter a PIN to secure sensitive actions';
  const pinSetupConfirmMessage =
    pinSetupPurpose === 'change' ? 'Confirm your new PIN' : 'Confirm your PIN';

  const handleTimerSelect = (duration: LockTimerDuration) => {
    setLockTimerDuration(duration);
    setIsTimerModalVisible(false);
    const option = timerOptions.find(opt => opt.value === duration);
    showToast(`Lock timer set to ${option?.label || 'Immediate'}`, 'success');
  };

  const getTimerLabel = (): string => {
    if (!isLockEnabled) return 'Not configured';
    const option = timerOptions.find(opt => opt.value === lockTimerDuration);
    return option?.label || 'Immediate';
  };

  const currencies = Object.values(Currency).filter(currency => currency !== Currency.MSATS);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Refresh wallet info
      await nostrService.refreshWalletInfo();
    } catch (error) {
      console.error('Error refreshing wallet info:', error);
    }
    setRefreshing(false);
  };

  const handleClearAppData = () => {
    Alert.alert(
      'Reset App',
      'This will completely reset all app data including:\n• Private keys and wallet\n• Profile information\n• All activities and subscriptions\n• App settings\n\nAre you sure?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: () => {
            executeProtectedAction(
              async () => {
                try {
                  // Show progress to user
                  showToast('Resetting app data...');

                  // Use comprehensive reset service
                  await resetApp();

                  // Reset completed successfully
                  showToast('App reset successful!', 'success');

                  // Navigation to onboarding is handled by AppResetService
                } catch (error) {
                  console.error('Error during comprehensive app reset:', error);

                  // Even if there's an error, try to navigate to onboarding
                  // as the reset likely succeeded partially
                  try {
                    router.replace('/onboarding');
                    showToast('Reset completed with errors - please check app state', 'error');
                  } catch (navError) {
                    Alert.alert(
                      'Reset Error',
                      'Failed to reset app completely. Please restart the app manually.',
                      [{ text: 'OK' }]
                    );
                  }
                }
              },
              {
                reason: 'Authenticate to reset all app data',
                pinTitle: 'Enter PIN to Reset App',
                pinMessage: 'Enter your PIN to reset all app data',
              }
            );
          },
        },
      ]
    );
  };

  function getWalletStatusText() {
    if (!walletUrl || !walletUrl.trim()) return 'Not configured';
    if (nwcConnectionStatus === true) return 'Connected';
    if (nwcConnectionStatus === false) {
      return nwcConnectionError ? `Error: ${nwcConnectionError}` : 'Disconnected';
    }
    if (nwcConnecting) return 'Connecting...';
    if (nwcConnectionStatus === null && hasLightningWallet) return 'Connecting...';
    return 'Not configured';
  }

  const renderCurrencyItem = ({ item }: { item: Currency }) => (
    <TouchableOpacity
      style={[styles.currencyItem, { backgroundColor: cardBackgroundColor }]}
      onPress={() => handleCurrencySelect(item)}
      activeOpacity={0.7}
    >
      <View style={styles.currencyItemContent}>
        <View style={styles.currencyItemLeft}>
          <View style={[styles.currencyItemSymbol, { backgroundColor: buttonPrimaryColor }]}>
            <ThemedText style={[styles.currencyItemSymbolText, { color: buttonPrimaryTextColor }]}>
              {CurrencyHelpers.getSymbol(item)}
            </ThemedText>
          </View>
          <View style={styles.currencyItemText}>
            <ThemedText style={[styles.currencyItemName, { color: primaryTextColor }]}>
              {CurrencyHelpers.getName(item)}
            </ThemedText>
            <ThemedText style={[styles.currencyItemDisplayName, { color: secondaryTextColor }]}>
              {CurrencyHelpers.getDisplayName(item)}
            </ThemedText>
          </View>
        </View>
        {preferredCurrency === item && <Check size={20} color={statusConnectedColor} />}
      </View>
    </TouchableOpacity>
  );

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
              colors={[buttonPrimaryColor]}
              tintColor={buttonPrimaryColor}
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
                    <View style={styles.cardHeader}>
                      <View style={[styles.iconContainer]}>
                        <Wallet size={20} color={buttonPrimaryColor} />
                      </View>
                      <View style={styles.cardText}>
                        <ThemedText style={[styles.cardTitle, { color: primaryTextColor }]}>
                          Wallet Connect
                        </ThemedText>
                        <View style={styles.cardStatusRow}>
                          <ThemedText style={[styles.cardStatus, { color: secondaryTextColor }]}>
                            {getWalletStatusText()}
                          </ThemedText>
                          <View
                            style={[
                              styles.statusIndicator,
                              {
                                backgroundColor: isLightningConnected
                                  ? statusConnectedColor
                                  : secondaryTextColor,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    </View>
                  </View>
                  <ChevronRight size={24} color={secondaryTextColor} />
                </View>
              </TouchableOpacity>
            </ThemedView>
            <ThemedView style={styles.walletSection}>
              <TouchableOpacity
                style={[styles.card, { backgroundColor: cardBackgroundColor }]}
                onPress={handleCurrencyChange}
                activeOpacity={0.7}
              >
                <View style={styles.cardContent}>
                  <View style={styles.cardLeft}>
                    <ThemedText style={[styles.cardTitle, { color: primaryTextColor }]}>
                      Preferred Currency
                    </ThemedText>
                    <ThemedText style={[styles.cardStatus, { color: secondaryTextColor }]}>
                      {getCurrentCurrencyDisplayName()}
                    </ThemedText>
                  </View>
                  <View style={[styles.currencyIndicator, { backgroundColor: buttonPrimaryColor }]}>
                    <ThemedText style={[styles.currencySymbol, { color: buttonPrimaryTextColor }]}>
                      {getCurrentCurrencySymbol()}
                    </ThemedText>
                  </View>
                </View>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>

          {/* Nostr Section */}
          <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>Relays</ThemedText>
          <TouchableOpacity
            style={[styles.card, { backgroundColor: cardBackgroundColor }]}
            onPress={handleNostrCardPress}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              <View style={styles.cardLeft}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconContainer]}>
                    <Wifi size={20} color={buttonPrimaryColor} />
                  </View>
                  <View style={styles.cardText}>
                    <ThemedText style={[styles.cardTitle, { color: primaryTextColor }]}>
                      Nostr relays
                    </ThemedText>
                    <ThemedText style={[styles.cardStatus, { color: secondaryTextColor }]}>
                      Manage the Nostr relays your app connects to
                    </ThemedText>
                  </View>
                </View>
              </View>
              <ChevronRight size={24} color={secondaryTextColor} />
            </View>
          </TouchableOpacity>

          {/* Theme Section */}
          <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
            Appearance
          </ThemedText>
          <ThemedView style={[styles.themeCard, { backgroundColor: cardBackgroundColor }]}>
            <TouchableOpacity
              onPress={handleThemeChange}
              activeOpacity={0.7}
              style={styles.themeCardTouchable}
            >
              <View style={styles.themeCardContent}>
                <View style={styles.themeCardLeft}>
                  <View style={styles.iconContainer}>
                    {themeMode === 'auto' ? (
                      <Smartphone size={24} color={buttonPrimaryColor} />
                    ) : themeMode === 'light' ? (
                      <Sun size={24} color={buttonPrimaryColor} />
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

          {/* Security Section */}
          <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
            Security
          </ThemedText>
          <View style={[styles.card, { backgroundColor: cardBackgroundColor }]}>
            <View style={styles.cardContent}>
              <View style={styles.cardLeft}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconContainer]}>
                    <KeyRound size={20} color={buttonPrimaryColor} />
                  </View>
                  <View style={styles.cardText}>
                    <ThemedText style={[styles.cardTitle, { color: primaryTextColor }]}>
                      Global PIN
                    </ThemedText>
                    <ThemedText style={[styles.cardStatus, { color: secondaryTextColor }]}>
                      {hasPIN ? 'Configured' : 'Not set'}
                    </ThemedText>
                  </View>
                </View>
              </View>
              <Switch
                value={hasPIN}
                onValueChange={handleGlobalPinToggle}
                trackColor={{
                  false: inputBorderColor,
                  true: buttonPrimaryColor,
                }}
                thumbColor={hasPIN ? buttonPrimaryTextColor : '#ffffff'}
                ios_backgroundColor={inputBorderColor}
              />
            </View>
          </View>

          {hasPIN && (
            <TouchableOpacity
              style={[styles.subActionButton, { backgroundColor: cardBackgroundColor }]}
              onPress={handleChangePinPress}
              activeOpacity={0.7}
            >
              <ThemedText style={[styles.subActionText, { color: primaryTextColor }]}>
                Change PIN
              </ThemedText>
              <ChevronRight size={20} color={secondaryTextColor} />
            </TouchableOpacity>
          )}

          <View
            style={[
              styles.card,
              { backgroundColor: cardBackgroundColor },
              !isFingerprintSupported && styles.cardDisabled,
            ]}
          >
            <View style={styles.cardContent}>
              <View style={styles.cardLeft}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconContainer]}>
                    <Fingerprint size={20} color={buttonPrimaryColor} />
                  </View>
                  <View style={styles.cardText}>
                    <ThemedText style={[styles.cardTitle, { color: primaryTextColor }]}>
                      Use {biometricLabel}
                    </ThemedText>
                    <ThemedText style={[styles.cardStatus, { color: secondaryTextColor }]}>
                      {isFingerprintSupported
                        ? isBiometricPreferred
                          ? `${biometricLabel} enabled`
                          : `${biometricLabel} disabled`
                        : `${biometricLabel} not available`}
                    </ThemedText>
                  </View>
                </View>
              </View>
              <Switch
                value={isBiometricPreferred}
                onValueChange={handleBiometricToggle}
                disabled={!isFingerprintSupported}
                trackColor={{
                  false: inputBorderColor,
                  true: buttonPrimaryColor,
                }}
                thumbColor={isBiometricPreferred ? buttonPrimaryTextColor : '#ffffff'}
                ios_backgroundColor={inputBorderColor}
              />
            </View>
          </View>

          <View style={[styles.appLockOption, { backgroundColor: cardBackgroundColor }]}>
            <View style={styles.appLockLeft}>
              <View style={styles.appLockIconContainer}>
                <Shield size={24} color={buttonPrimaryColor} />
              </View>
              <View style={styles.appLockTextContainer}>
                <ThemedText style={[styles.appLockTitle, { color: primaryTextColor }]}>
                  App Lock
                </ThemedText>
                <ThemedText style={[styles.appLockDescription, { color: secondaryTextColor }]}>
                  Lock your app with biometric or PIN
                </ThemedText>
              </View>
            </View>
            <Switch
              value={isLockEnabled}
              onValueChange={handleAppLockToggle}
              trackColor={{
                false: inputBorderColor,
                true: buttonPrimaryColor,
              }}
              thumbColor={isLockEnabled ? buttonPrimaryTextColor : '#ffffff'}
              ios_backgroundColor={inputBorderColor}
            />
          </View>

          {isLockEnabled && (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: cardBackgroundColor }]}
              onPress={() => setIsTimerModalVisible(true)}
              activeOpacity={0.7}
            >
              <View style={styles.cardContent}>
                <View style={styles.cardLeft}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.iconContainer]}>
                      <Clock size={20} color={buttonPrimaryColor} />
                    </View>
                    <View style={styles.cardText}>
                      <ThemedText style={[styles.cardTitle, { color: primaryTextColor }]}>
                        Lock Timer
                      </ThemedText>
                      <ThemedText style={[styles.cardStatus, { color: secondaryTextColor }]}>
                        {getTimerLabel()}
                      </ThemedText>
                    </View>
                  </View>
                </View>
                <ChevronRight size={24} color={secondaryTextColor} />
              </View>
            </TouchableOpacity>
          )}

          {/* Recover Tickets Section */}
          <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
            Recovery
          </ThemedText>
          <TouchableOpacity
            style={[styles.card, { backgroundColor: cardBackgroundColor }]}
            onPress={handleRecoverTicketsPress}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              <View style={styles.cardLeft}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconContainer]}>
                    <RotateCcw size={20} color={buttonPrimaryColor} />
                  </View>
                  <View style={styles.cardText}>
                    <ThemedText style={[styles.cardTitle, { color: primaryTextColor }]}>
                      Recover Tickets
                    </ThemedText>
                    <ThemedText style={[styles.cardStatus, { color: secondaryTextColor }]}>
                      Restore lost or missing tickets
                    </ThemedText>
                  </View>
                </View>
              </View>
              <ChevronRight size={24} color={secondaryTextColor} />
            </View>
          </TouchableOpacity>

          {/* Export Section */}
          <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>Export</ThemedText>
          {mnemonic && (
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
          )}
          <TouchableOpacity
            style={[styles.exportButton, { backgroundColor: buttonPrimaryColor }]}
            onPress={handleExportNsec}
          >
            <View style={styles.exportButtonContent}>
              <ThemedText style={[styles.exportButtonText, { color: buttonPrimaryTextColor }]}>
                Export Nsec
              </ThemedText>
              <View style={styles.fingerprintIcon}>
                <Fingerprint size={20} color={buttonPrimaryTextColor} />
              </View>
            </View>
          </TouchableOpacity>
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

          {/* Extra Section */}
          <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>Extra</ThemedText>
          <TouchableOpacity
            style={[styles.clearDataButton, { backgroundColor: buttonDangerColor }]}
            onPress={handleClearAppData}
          >
            <View style={styles.clearDataButtonContent}>
              <ThemedText style={[styles.clearDataButtonText, { color: buttonDangerTextColor }]}>
                Reset App
              </ThemedText>
              <View style={styles.fingerprintIcon}>
                <Fingerprint size={20} color={buttonDangerTextColor} />
              </View>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </ThemedView>

      {/* Currency Selector Modal */}
      <Modal
        visible={isCurrencyModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsCurrencyModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsCurrencyModalVisible(false)}
        >
          <TouchableOpacity
            style={[styles.modalContent, { backgroundColor: backgroundColor }]}
            activeOpacity={1}
            onPress={e => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <ThemedText style={[styles.modalTitle, { color: primaryTextColor }]}>
                Select Currency
              </ThemedText>
              <TouchableOpacity
                onPress={() => setIsCurrencyModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <X size={24} color={secondaryTextColor} />
              </TouchableOpacity>
            </View>
            {currencies.length > 0 ? (
              <FlatList
                data={currencies}
                renderItem={renderCurrencyItem}
                keyExtractor={item => item}
                style={styles.currencyList}
                showsVerticalScrollIndicator={false}
              />
            ) : (
              <ThemedText style={[{ color: primaryTextColor, textAlign: 'center', padding: 20 }]}>
                No currencies available
              </ThemedText>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Timer Selector Modal */}
      <Modal
        visible={isTimerModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsTimerModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsTimerModalVisible(false)}
        >
          <TouchableOpacity
            style={[styles.modalContent, { backgroundColor: backgroundColor }]}
            activeOpacity={1}
            onPress={e => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <ThemedText style={[styles.modalTitle, { color: primaryTextColor }]}>
                Select Lock Timer
              </ThemedText>
              <TouchableOpacity
                onPress={() => setIsTimerModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <X size={24} color={secondaryTextColor} />
              </TouchableOpacity>
            </View>
            {timerOptions.length > 0 ? (
              <FlatList
                data={timerOptions}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.currencyItem, { backgroundColor: cardBackgroundColor }]}
                    onPress={() => handleTimerSelect(item.value)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.currencyItemContent}>
                      <View style={styles.currencyItemLeft}>
                        <ThemedText style={[styles.currencyItemName, { color: primaryTextColor }]}>
                          {item.label}
                        </ThemedText>
                      </View>
                      {lockTimerDuration === item.value && (
                        <Check size={20} color={statusConnectedColor} />
                      )}
                    </View>
                  </TouchableOpacity>
                )}
                keyExtractor={item => item.value?.toString() || 'never'}
                style={styles.currencyList}
                showsVerticalScrollIndicator={false}
              />
            ) : (
              <ThemedText style={[{ color: primaryTextColor, textAlign: 'center', padding: 20 }]}>
                No timer options available
              </ThemedText>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* PIN Setup Modal */}
      <PINSetupScreen
        visible={isPINSetupVisible}
        onComplete={handlePINSetupComplete}
        onCancel={() => {
          setIsPINSetupVisible(false);
          setPendingLockEnable(false);
          setPendingPinEnable(false);
          setPendingBiometricEnable(false);
        }}
        title={pinSetupTitle}
        enterMessage={pinSetupEnterMessage}
        confirmMessage={pinSetupConfirmMessage}
      />

      {/* PIN Verification Modal */}
      <Modal
        visible={isPINVerifyVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={closePinVerification}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closePinVerification}>
          <TouchableOpacity
            style={[styles.modalContent, { backgroundColor: cardBackgroundColor }]}
            activeOpacity={1}
            onPress={e => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <ThemedText style={[styles.modalTitle, { color: primaryTextColor }]}>
                {pinVerificationConfig.title}
              </ThemedText>
              <TouchableOpacity onPress={closePinVerification}>
                <X size={24} color={secondaryTextColor} />
              </TouchableOpacity>
            </View>
            <View style={styles.pinContainer}>
              <ThemedText style={[styles.pinInstruction, { color: secondaryTextColor }]}>
                {pinVerificationConfig.instructions}
              </ThemedText>
              <PINKeypad
                onPINComplete={handlePINVerifyComplete}
                minLength={PIN_MIN_LENGTH}
                maxLength={PIN_MAX_LENGTH}
                showDots={true}
                error={pinError}
                onError={() => setPinError(false)}
              />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
    paddingTop: 16,
    paddingBottom: 16,
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
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  subActionButton: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subActionText: {
    fontSize: 15,
    fontWeight: '500',
  },
  cardDisabled: {
    opacity: 0.6,
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardStatus: {
    fontSize: 14,
  },
  cardStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  exportButton: {
    padding: 16,
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 12,
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
  appLockOption: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
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
    marginBottom: 12,
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
  iconContainer: {
    marginRight: 12,
  },
  themeTextContainer: {
    flex: 1,
  },
  themeTitle: {
    fontSize: 16,
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
  clearDataButton: {
    padding: 16,
    borderRadius: 12,
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
  currencyIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
    height: '80%',
    minHeight: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    padding: 4,
  },
  currencyList: {
    flex: 1,
    paddingBottom: 20,
    minHeight: 200,
  },
  // Currency item styles
  currencyItem: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  currencyItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  currencyItemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyItemSymbol: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  currencyItemSymbolText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  currencyItemText: {
    flex: 1,
  },
  currencyItemName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  currencyItemDisplayName: {
    fontSize: 14,
  },
  section: {
    marginBottom: 24,
  },
  walletSection: {
    marginBottom: 12,
  },
  pinContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  pinInstruction: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
});
