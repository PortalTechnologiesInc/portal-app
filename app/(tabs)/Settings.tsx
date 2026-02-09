import Clipboard from '@react-native-clipboard/clipboard';
import { useRouter } from 'expo-router';
import {
  Check,
  ChevronRight,
  Clock,
  Fingerprint,
  HandCoins,
  KeyRound,
  Languages,
  Moon,
  RotateCcw,
  Shield,
  Smartphone,
  Sun,
  Wallet,
  Wifi,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PINKeypad } from '@/components/PINKeypad';
import { PINSetupScreen } from '@/components/PINSetupScreen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAppLock, useOnAppLock } from '@/context/AppLockContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { useKey } from '@/context/KeyContext';
import { useNostrService } from '@/context/NostrServiceContext';
import { type ThemeMode, useTheme } from '@/context/ThemeContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { type LockTimerDuration, PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '@/services/AppLockService';
import { authenticateAsync } from '@/services/BiometricAuthService';
import { getMnemonic } from '@/services/SecureStorageService';
import { Currency, CurrencyHelpers } from '@/utils/currency';
import { getNsecStringFromKey } from '@/utils/keyHelpers';
import { showToast } from '@/utils/Toast';

type PinVerificationConfig = {
  title: string;
  instructions: string;
  onSuccess?: (() => Promise<void> | void) | null;
};

export default function SettingsScreen() {
  const router = useRouter();
  const { resetApp } = useDatabaseContext();
  const _nostrService = useNostrService();
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
  const [_refreshing, _setRefreshing] = useState(false);
  const [isCurrencyModalVisible, setIsCurrencyModalVisible] = useState(false);
  const [isTimerModalVisible, setIsTimerModalVisible] = useState(false);
  const [isPINSetupVisible, setIsPINSetupVisible] = useState(false);
  const [isPINVerifyVisible, setIsPINVerifyVisible] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [_walletUrl, _setWalletUrl] = useState('');
  const [pinSetupPurpose, setPinSetupPurpose] = useState<'change' | 'global'>('global');
  const [pinVerificationConfig, setPinVerificationConfig] = useState<PinVerificationConfig>({
    title: 'Verify PIN',
    instructions: 'Enter your PIN',
    onSuccess: null,
  });
  const [pendingLockEnable, setPendingLockEnable] = useState(false);
  const [_pendingPinEnable, setPendingPinEnable] = useState(false);
  const [pendingBiometricEnable, setPendingBiometricEnable] = useState(false);
  const { width, height } = useWindowDimensions();

  // Animated values for drawer slide animations
  const currencyDrawerSlide = useRef(new Animated.Value(height)).current;
  const timerDrawerSlide = useRef(new Animated.Value(height)).current;
  const pinVerifyDrawerSlide = useRef(new Animated.Value(height)).current;
  const insets = useSafeAreaInsets();
  const rem = Math.min(Math.max(width / 390, 0.9), 1);
  const modalMaxHeight = Math.min(height * 0.85, 560);
  const modalPadding = 20 * rem;
  const modalRadius = 20 * rem;
  const isStandardScreen = height >= 760;
  const modalBottomPadding = isStandardScreen
    ? Math.max(24, insets.bottom + 12)
    : Math.max(16, insets.bottom + 8);
  const sheetMinHeight = Math.min(height * 0.7, modalMaxHeight);

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
  const modalSheetStyle = useMemo(
    () => [
      styles.modalContent,
      {
        backgroundColor: cardBackgroundColor,
        maxHeight: modalMaxHeight,
        minHeight: sheetMinHeight,
        paddingHorizontal: modalPadding,
        paddingTop: modalPadding,
        paddingBottom: modalBottomPadding,
        borderTopLeftRadius: modalRadius,
        borderTopRightRadius: modalRadius,
      },
    ],
    [
      cardBackgroundColor,
      modalMaxHeight,
      modalPadding,
      modalBottomPadding,
      modalRadius,
      sheetMinHeight,
    ]
  );

  const modalListStyle = useMemo(
    () => [
      styles.currencyList,
      {
        maxHeight: Math.max(160, modalMaxHeight - sheetMinHeight * 0.1 - modalPadding * 2),
      },
    ],
    [modalMaxHeight, modalPadding, sheetMinHeight]
  );

  const handleWalletCardPress = () => {
    router.push({
      pathname: '/walletSettings',
      params: {
        source: 'settings',
      },
    });
  };

  const handleNostrCardPress = () => {
    router.push('/relays');
  };

  const handleRemoteSigningPress = () => {
    router.push('/remoteSigning');
  };

  const handleRecoverTicketsPress = () => {
    router.push('/recoverTickets');
  };

  const resetPinVerificationConfig = useCallback(() => {
    setPinVerificationConfig({
      title: 'Verify PIN',
      instructions: 'Enter your PIN',
      onSuccess: null,
    });
  }, []);

  const closePinVerification = useCallback(() => {
    setIsPINVerifyVisible(false);
    setPinError(false);
    resetPinVerificationConfig();
  }, [resetPinVerificationConfig]);

  const handleLockEngaged = useCallback(() => {
    setIsCurrencyModalVisible(false);
    setIsTimerModalVisible(false);
    setIsPINSetupVisible(false);
    closePinVerification();
  }, [closePinVerification]);

  useOnAppLock(handleLockEngaged);

  const showPinVerification = (config: PinVerificationConfig) => {
    setPinError(false);
    setPinVerificationConfig(config);
    setIsPINVerifyVisible(true);
  };

  const CANCELABLE_BIOMETRIC_ERRORS = new Set(['user_cancel', 'system_cancel', 'app_cancel']);

  const executeProtectedAction = async (
    action: () => Promise<void> | void,
    { reason, pinTitle, pinMessage }: { reason: string; pinTitle: string; pinMessage: string }
  ) => {
    try {
      if (authMethod === 'biometric' && isFingerprintSupported) {
        const biometricAvailable = await isBiometricAvailable();
        if (biometricAvailable) {
          const result = await authenticateAsync(reason);
          if (result.success) {
            await action();
            return;
          }

          if (!result.code || !CANCELABLE_BIOMETRIC_ERRORS.has(result.code)) {
            showToast(result.error || 'Biometric authentication failed', 'error');
          }
          // fall through to PIN verification when available
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
    } catch (_error) {
      showToast('Failed to complete action', 'error');
    }
  };

  const handleExportMnemonic = () => {
    executeProtectedAction(
      async () => {
        try {
          const mnemonicValue = await getMnemonic();
          if (mnemonicValue) {
            Clipboard.setString(mnemonicValue);
            showToast('Mnemonic copied to clipboard', 'success');
          } else {
            showToast('No mnemonic found', 'error');
          }
        } catch (_error) {
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

  // Animate currency drawer when modal opens/closes
  useEffect(() => {
    if (isCurrencyModalVisible) {
      Animated.spring(currencyDrawerSlide, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(currencyDrawerSlide, {
        toValue: height,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [isCurrencyModalVisible, height, currencyDrawerSlide]);

  // Animate timer drawer when modal opens/closes
  useEffect(() => {
    if (isTimerModalVisible) {
      Animated.spring(timerDrawerSlide, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(timerDrawerSlide, {
        toValue: height,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [isTimerModalVisible, height, timerDrawerSlide]);

  // Animate PIN verification drawer when modal opens/closes
  useEffect(() => {
    if (isPINVerifyVisible) {
      Animated.spring(pinVerifyDrawerSlide, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(pinVerifyDrawerSlide, {
        toValue: height,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [isPINVerifyVisible, height, pinVerifyDrawerSlide]);

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
    } catch (_error) {
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
    } catch (_error) {
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
    } catch (_error) {
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

    showPinVerification({
      title: ' Disable',
      instructions: 'Enter your PIN to disable it',
      onSuccess: async () => {
        await clearPIN();
        if (isLockEnabled) {
          await setLockEnabled(false);
        }
        await setAuthMethodPreference(null);
        showToast('PIN disabled', 'success');
      },
    });
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

    const performToggle = async () => {
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
      } catch (_error) {
        showToast('Failed to update biometric preference', 'error');
      }
    };

    const promptForPIN = () => {
      if (!hasPIN) return;
      showPinVerification({
        title: enabled ? `Enable ${biometricLabel}` : `Disable ${biometricLabel}`,
        instructions: `Enter your PIN to ${enabled ? 'enable' : 'disable'} ${biometricLabel}`,
        onSuccess: performToggle,
      });
    };

    try {
      const biometricAvailable = await isBiometricAvailable();
      if (biometricAvailable) {
        const authResult = await authenticateAsync(
          `Authenticate to ${enabled ? 'enable' : 'disable'} ${biometricLabel}`
        );
        if (authResult.success) {
          await performToggle();
          return;
        }
        if (!authResult.code || !CANCELABLE_BIOMETRIC_ERRORS.has(authResult.code)) {
          showToast(authResult.error || 'Biometric authentication failed', 'error');
        }
        if (authResult.code && CANCELABLE_BIOMETRIC_ERRORS.has(authResult.code)) {
          return;
        }
      }
    } catch (_error) {}

    if (hasPIN) {
      promptForPIN();
      return;
    }

    await performToggle();
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
                  // Use comprehensive reset service
                  await resetApp();

                  // Navigation to onboarding is handled by AppResetService
                  // Toast will be shown in onboarding screen after reset completes
                } catch (_error) {
                  // Even if there's an error, try to navigate to onboarding
                  // as the reset likely succeeded partially
                  try {
                    router.replace('/(onboarding)/welcome');
                  } catch (_navError) {
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
        {preferredCurrency === item && (
          <Check testID="currency-checkmark" size={20} color={statusConnectedColor} />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.header}>
          <ThemedText type="title" style={{ color: primaryTextColor }}>
            Settings
          </ThemedText>
        </ThemedView>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* Wallet Section */}
          <ThemedText style={[styles.sectionTitle, { color: primaryTextColor, marginTop: 0 }]}>
            Wallet
          </ThemedText>
          <TouchableOpacity
            style={[styles.card, { backgroundColor: cardBackgroundColor }]}
            onPress={handleWalletCardPress}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              <View style={styles.cardLeft}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconContainer]}>
                    <Wallet size={22} color={buttonPrimaryColor} />
                  </View>
                  <View style={styles.cardText}>
                    <ThemedText style={[styles.cardTitle, { color: primaryTextColor }]}>
                      Wallet Configuration
                    </ThemedText>
                    <View style={styles.cardStatusRow}>
                      <ThemedText style={[styles.cardStatus, { color: secondaryTextColor }]}>
                        Manage your wallet configurations
                      </ThemedText>
                    </View>
                  </View>
                </View>
              </View>
              <ChevronRight size={22} color={secondaryTextColor} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.card, { backgroundColor: cardBackgroundColor }]}
            onPress={handleCurrencyChange}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              <View style={styles.cardLeft}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconContainer]}>
                    <HandCoins size={22} color={buttonPrimaryColor} />
                  </View>
                  <View style={styles.cardText}>
                    <ThemedText style={[styles.cardTitle, { color: primaryTextColor }]}>
                      Preferred Currency
                    </ThemedText>
                    <ThemedText style={[styles.cardStatus, { color: secondaryTextColor }]}>
                      {getCurrentCurrencyDisplayName()}
                    </ThemedText>
                  </View>
                </View>
              </View>
              <View style={[styles.currencyIndicator, { backgroundColor: buttonPrimaryColor }]}>
                <ThemedText style={[styles.currencySymbol, { color: buttonPrimaryTextColor }]}>
                  {getCurrentCurrencySymbol()}
                </ThemedText>
              </View>
            </View>
          </TouchableOpacity>

          {/* Network Section */}
          <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
            Network
          </ThemedText>
          <TouchableOpacity
            style={[styles.card, { backgroundColor: cardBackgroundColor }]}
            onPress={handleNostrCardPress}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              <View style={styles.cardLeft}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconContainer]}>
                    <Wifi size={22} color={buttonPrimaryColor} />
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
              <ChevronRight size={22} color={secondaryTextColor} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.card, { backgroundColor: cardBackgroundColor }]}
            onPress={handleRemoteSigningPress}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              <View style={styles.cardLeft}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconContainer]}>
                    <Fingerprint size={22} color={buttonPrimaryColor} />
                  </View>
                  <View style={styles.cardText}>
                    <ThemedText style={[styles.cardTitle, { color: primaryTextColor }]}>
                      Remote signer setup
                    </ThemedText>
                    <ThemedText style={[styles.cardStatus, { color: secondaryTextColor }]}>
                      Configure bunker URLs or respond to nostrconnect requests
                    </ThemedText>
                  </View>
                </View>
              </View>
              <ChevronRight size={22} color={secondaryTextColor} />
            </View>
          </TouchableOpacity>
          <View style={[styles.card, { backgroundColor: cardBackgroundColor }, { opacity: 0.5 }]}>
            <View style={styles.cardContent}>
              <View style={styles.cardLeft}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconContainer]}>
                    <Shield size={22} color={secondaryTextColor} />
                  </View>
                  <View style={styles.cardText}>
                    <ThemedText style={[styles.cardTitle, { color: secondaryTextColor }]}>
                      Enable Tor
                    </ThemedText>
                    <ThemedText style={[styles.cardStatus, { color: secondaryTextColor }]}>
                      Route traffic through Tor network
                    </ThemedText>
                  </View>
                </View>
              </View>
              <Switch
                value={false}
                onValueChange={() => {}}
                disabled={true}
                trackColor={{
                  false: inputBorderColor,
                  true: inputBorderColor,
                }}
                thumbColor="#ffffff"
                ios_backgroundColor={inputBorderColor}
              />
            </View>
          </View>

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
                      <Smartphone size={22} color={buttonPrimaryColor} />
                    ) : themeMode === 'light' ? (
                      <Sun size={22} color={buttonPrimaryColor} />
                    ) : (
                      <Moon size={22} color={buttonPrimaryColor} />
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
          <View style={[styles.card, { backgroundColor: cardBackgroundColor }, { opacity: 0.5 }]}>
            <View style={styles.cardContent}>
              <View style={styles.cardLeft}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconContainer]}>
                    <Languages size={22} color={secondaryTextColor} />
                  </View>
                  <View style={styles.cardText}>
                    <ThemedText style={[styles.cardTitle, { color: secondaryTextColor }]}>
                      Preferred Language
                    </ThemedText>
                    <ThemedText style={[styles.cardStatus, { color: secondaryTextColor }]}>
                      Select your preferred language
                    </ThemedText>
                  </View>
                </View>
              </View>
              <View style={[styles.currencyIndicator, { backgroundColor: inputBorderColor }]}>
                <ThemedText style={[styles.currencySymbol, { color: secondaryTextColor }]}>
                  ENG
                </ThemedText>
              </View>
            </View>
          </View>

          {/* Security Section */}
          <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
            Security
          </ThemedText>
          <View style={[styles.appLockOption, { backgroundColor: cardBackgroundColor }]}>
            <View style={styles.appLockLeft}>
              <View style={styles.appLockIconContainer}>
                <Shield size={22} color={buttonPrimaryColor} />
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
                      <Clock size={22} color={buttonPrimaryColor} />
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
                <ChevronRight size={22} color={secondaryTextColor} />
              </View>
            </TouchableOpacity>
          )}

          <View style={[styles.card, { backgroundColor: cardBackgroundColor }]}>
            <View style={styles.cardContent}>
              <View style={styles.cardLeft}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconContainer]}>
                    <KeyRound size={22} color={buttonPrimaryColor} />
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

          {isFingerprintSupported && (
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
                      <Fingerprint size={22} color={buttonPrimaryColor} />
                    </View>
                    <View style={styles.cardText}>
                      <ThemedText style={[styles.cardTitle, { color: primaryTextColor }]}>
                        Use {biometricLabel}
                      </ThemedText>
                      {isFingerprintSupported && (
                        <ThemedText style={[styles.cardStatus, { color: secondaryTextColor }]}>
                          {isFingerprintSupported
                            ? isBiometricPreferred
                              ? `${biometricLabel} enabled`
                              : `${biometricLabel} disabled`
                            : `${biometricLabel} not available`}
                        </ThemedText>
                      )}
                    </View>
                  </View>
                </View>
                <Switch
                  value={isBiometricPreferred}
                  onValueChange={handleBiometricToggle}
                  trackColor={{
                    false: inputBorderColor,
                    true: buttonPrimaryColor,
                  }}
                  thumbColor={isBiometricPreferred ? buttonPrimaryTextColor : '#ffffff'}
                  ios_backgroundColor={inputBorderColor}
                />
              </View>
            </View>
          )}

          {/* Backup & Recovery Section */}
          <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
            Backup & Recovery
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
                    <RotateCcw size={22} color={buttonPrimaryColor} />
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
              <ChevronRight size={22} color={secondaryTextColor} />
            </View>
          </TouchableOpacity>
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
            style={[
              styles.exportButton,
              {
                backgroundColor: inputBorderColor,
                opacity: 0.5,
              },
            ]}
            onPress={handleExportAppData}
            disabled={true}
          >
            <View style={styles.exportButtonContent}>
              <ThemedText style={[styles.exportButtonText, { color: secondaryTextColor }]}>
                Export App Data
              </ThemedText>
              <View style={styles.fingerprintIcon}>
                <Fingerprint size={20} color={secondaryTextColor} />
              </View>
            </View>
          </TouchableOpacity>

          {/* Advanced Section */}
          <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
            Advanced
          </ThemedText>
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
        transparent
        animationType="fade"
        onRequestClose={() => setIsCurrencyModalVisible(false)}
      >
        <View style={[styles.modalOverlay, { paddingTop: Math.max(insets.top, 12) }]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setIsCurrencyModalVisible(false)}
          />
          <Animated.View
            style={[
              modalSheetStyle,
              {
                transform: [{ translateY: currencyDrawerSlide }],
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <ThemedText style={[styles.modalTitle, { color: primaryTextColor }]}>
                Select Currency
              </ThemedText>
              <TouchableOpacity
                onPress={() => setIsCurrencyModalVisible(false)}
                style={styles.modalCloseButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={22} color={secondaryTextColor} />
              </TouchableOpacity>
            </View>
            {currencies.length > 0 ? (
              <FlatList
                data={currencies}
                renderItem={renderCurrencyItem}
                keyExtractor={item => item}
                style={modalListStyle}
                contentContainerStyle={styles.currencyListContent}
                showsVerticalScrollIndicator={false}
                scrollEnabled={true}
                bounces={true}
              />
            ) : (
              <ThemedText style={[styles.modalEmptyState, { color: primaryTextColor }]}>
                No currencies available
              </ThemedText>
            )}
          </Animated.View>
        </View>
      </Modal>

      {/* Timer Selector Modal */}
      <Modal
        visible={isTimerModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsTimerModalVisible(false)}
      >
        <TouchableOpacity
          style={[styles.modalOverlay, { paddingTop: Math.max(insets.top, 12) }]}
          activeOpacity={1}
          onPress={() => setIsTimerModalVisible(false)}
        >
          <Animated.View
            style={[
              modalSheetStyle,
              {
                transform: [{ translateY: timerDrawerSlide }],
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={{ flex: 1 }}>
              <View style={styles.modalHeader}>
                <ThemedText style={[styles.modalTitle, { color: primaryTextColor }]}>
                  Select Lock Timer
                </ThemedText>
                <TouchableOpacity
                  onPress={() => setIsTimerModalVisible(false)}
                  style={styles.modalCloseButton}
                >
                  <X size={22} color={secondaryTextColor} />
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
                          <ThemedText
                            style={[styles.currencyItemName, { color: primaryTextColor }]}
                          >
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
                  style={modalListStyle}
                  contentContainerStyle={styles.currencyListContent}
                  showsVerticalScrollIndicator={false}
                />
              ) : (
                <ThemedText style={[styles.modalEmptyState, { color: primaryTextColor }]}>
                  No timer options available
                </ThemedText>
              )}
            </View>
          </Animated.View>
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
        animationType="fade"
        onRequestClose={closePinVerification}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={closePinVerification}
        >
          <Animated.View
            style={[
              modalSheetStyle,
              {
                transform: [{ translateY: pinVerifyDrawerSlide }],
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={e => e.stopPropagation()}
              style={{ flex: 1 }}
            >
              <View style={styles.modalHeader}>
                <ThemedText
                  style={[styles.modalTitle, { color: primaryTextColor, fontSize: 20 * rem }]}
                >
                  {pinVerificationConfig.title}
                </ThemedText>
                <TouchableOpacity onPress={closePinVerification}>
                  <X size={22} color={secondaryTextColor} />
                </TouchableOpacity>
              </View>
              <View
                style={[
                  styles.pinContainer,
                  { paddingTop: 16 * rem, paddingBottom: Math.max(32, 40 * rem) },
                ]}
              >
                <ThemedText
                  style={[
                    styles.pinInstruction,
                    { color: secondaryTextColor, fontSize: 16 * rem, marginBottom: 24 * rem },
                  ]}
                >
                  {pinVerificationConfig.instructions}
                </ThemedText>
                <View style={styles.pinKeypadWrapper}>
                  {pinError && (
                    <View style={styles.pinErrorContainer}>
                      <ThemedText
                        style={[
                          styles.pinErrorText,
                          { color: buttonDangerColor, fontSize: 14 * rem },
                        ]}
                      >
                        Incorrect PIN. Please try again.
                      </ThemedText>
                    </View>
                  )}
                  <PINKeypad
                    onPINComplete={handlePINVerifyComplete}
                    minLength={PIN_MIN_LENGTH}
                    maxLength={PIN_MAX_LENGTH}
                    showDots={true}
                    error={pinError}
                    onError={() => setPinError(false)}
                  />
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>
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
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
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
    marginTop: 10,
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
    width: '100%',
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
  currencyListContent: {
    paddingBottom: 8,
  },
  modalEmptyState: {
    textAlign: 'center',
    padding: 20,
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
  pinKeypadWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  pinErrorContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  pinErrorText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
