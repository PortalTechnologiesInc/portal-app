import Clipboard from '@react-native-clipboard/clipboard';
import { router } from 'expo-router';
import { Copy } from 'lucide-react-native';
import { keyToHex, parseKeyHandshakeUrl } from 'portal-app-lib';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useActivities } from '@/context/ActivitiesContext';
import { useAppLock } from '@/context/AppLockContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useKey } from '@/context/KeyContext';
import { useNostrService } from '@/context/NostrServiceContext';
import { useOnboarding } from '@/context/OnboardingContext';
import { usePendingRequests } from '@/context/PendingRequestsContext';
import { useTheme } from '@/context/ThemeContext';
import { useUserProfile } from '@/context/UserProfileContext';
import { useWalletManager } from '@/context/WalletManagerContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { WALLET_CONNECTION_STATUS, WALLET_TYPE } from '@/models/WalletType';
import { AppLockService } from '@/services/AppLockService';
import { CurrencyConversionService } from '@/services/CurrencyConversionService';
import { showToast } from '@/utils/Toast';

// React State Monitor Component
function ReactStateMonitor({
  cardBackgroundColor,
  surfaceSecondaryColor,
  primaryTextColor,
  secondaryTextColor,
}: {
  cardBackgroundColor: string;
  surfaceSecondaryColor: string;
  primaryTextColor: string;
  secondaryTextColor: string;
}) {
  const { mnemonic, nsec, isLoading: keyLoading, isWalletConnected } = useKey();
  const {
    isInitialized: nostrInitialized,
    publicKey,
    allRelaysConnected,
    connectedCount,
    relayStatuses,
  } = useNostrService();
  const { username, displayName, syncStatus, isProfileEditable } = useUserProfile();
  const { activities, subscriptions, isLoadingMore, hasMoreActivities, totalActivities } =
    useActivities();
  const { isLoadingRequest, pendingUrl, requestFailed } = usePendingRequests();
  const { activeWallet, walletStatus, isWalletManagerInitialized, preferredWallet } =
    useWalletManager();
  const { isOnboardingComplete, isLoading: onboardingLoading } = useOnboarding();
  const { isLocked, isLockEnabled, authMethod, hasPIN, isFingerprintSupported } = useAppLock();
  const { preferredCurrency } = useCurrency();
  const { themeMode, currentTheme } = useTheme();

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return value ? '✓' : '✗';
    if (typeof value === 'string') {
      if (value.length > 20) return `${value.substring(0, 20)}...`;
      return value || '(empty)';
    }
    if (typeof value === 'number') return value.toString();
    if (Array.isArray(value)) return `[${value.length}]`;
    if (value instanceof Map) return `Map(${value.size})`;
    if (value instanceof Set) return `Set(${value.size})`;
    if (typeof value === 'object') return `${JSON.stringify(value).substring(0, 30)}...`;
    return String(value);
  };

  const InfoRow = ({ label, value }: { label: string; value: unknown }) => (
    <View style={styles.infoRow}>
      <ThemedText style={[styles.infoLabel, { color: secondaryTextColor }]}>{label}:</ThemedText>
      <ThemedText style={[styles.infoValue, { color: primaryTextColor }]}>
        {formatValue(value)}
      </ThemedText>
    </View>
  );

  const publicKeyHex = useMemo(() => {
    if (!publicKey) return null;
    try {
      return keyToHex(publicKey);
    } catch {
      return null;
    }
  }, [publicKey]);

  const inputBorderColor = useThemeColor({}, 'inputBorder');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');

  const ScrollableKeyRow = ({ label, value }: { label: string; value: string | null }) => {
    if (!value) {
      return (
        <View style={styles.scrollableKeyRow}>
          <ThemedText style={[styles.scrollableKeyLabel, { color: secondaryTextColor }]}>
            {label}:
          </ThemedText>
          <ThemedText style={[styles.scrollableKeyValue, { color: secondaryTextColor }]}>
            (not available)
          </ThemedText>
        </View>
      );
    }

    return (
      <View style={styles.scrollableKeyRow}>
        <ThemedText style={[styles.scrollableKeyLabel, { color: secondaryTextColor }]}>
          {label}:
        </ThemedText>
        <View
          style={[
            styles.scrollableKeyBox,
            {
              borderColor: inputBorderColor,
              backgroundColor: surfaceSecondaryColor,
            },
          ]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.scrollableKeyScrollView}
          >
            <ThemedText style={[styles.scrollableKeyText, { color: primaryTextColor }]} selectable>
              {value}
            </ThemedText>
          </ScrollView>
          <TouchableOpacity
            onPress={() => {
              Clipboard.setString(value);
              showToast(`${label} copied to clipboard`, 'success');
            }}
            style={styles.scrollableKeyCopyButton}
            activeOpacity={0.7}
          >
            <Copy size={16} color={buttonPrimary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <ThemedView style={[styles.section, { backgroundColor: cardBackgroundColor }]}>
      <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
        📊 React State Monitor
      </ThemedText>
      <ThemedText style={[styles.description, { color: secondaryTextColor }]}>
        Real-time monitoring of React context values and component state
      </ThemedText>

      <View style={[styles.infoGroup, { backgroundColor: surfaceSecondaryColor }]}>
        <ThemedText style={[styles.infoGroupTitle, { color: primaryTextColor }]}>
          🔑 Key Context
        </ThemedText>
        <InfoRow label="Loading" value={keyLoading} />
        <InfoRow label="Has Mnemonic" value={!!mnemonic} />
        <InfoRow label="Has Nsec" value={!!nsec} />
        <InfoRow label="Has Wallet URL" value={isWalletConnected} />
      </View>

      <View style={[styles.infoGroup, { backgroundColor: surfaceSecondaryColor }]}>
        <ThemedText style={[styles.infoGroupTitle, { color: primaryTextColor }]}>
          🌐 Nostr Service
        </ThemedText>
        <InfoRow label="Initialized" value={nostrInitialized} />
        <ScrollableKeyRow label="Public Key" value={publicKey} />
        <ScrollableKeyRow label="Public Key (hex)" value={publicKeyHex} />
        <InfoRow label="All Relays Connected" value={allRelaysConnected} />
        <InfoRow label="Connected Count" value={`${connectedCount}/${relayStatuses.length}`} />
        <InfoRow label="Total Relays" value={relayStatuses.length} />
      </View>

      <View style={[styles.infoGroup, { backgroundColor: surfaceSecondaryColor }]}>
        <ThemedText style={[styles.infoGroupTitle, { color: primaryTextColor }]}>
          👤 User Profile
        </ThemedText>
        <InfoRow label="Username" value={username} />
        <InfoRow label="Display Name" value={displayName} />
        <InfoRow label="Sync Status" value={syncStatus} />
        <InfoRow label="Profile Editable" value={isProfileEditable} />
      </View>

      <View style={[styles.infoGroup, { backgroundColor: surfaceSecondaryColor }]}>
        <ThemedText style={[styles.infoGroupTitle, { color: primaryTextColor }]}>
          📋 Activities
        </ThemedText>
        <InfoRow label="Total Activities" value={totalActivities} />
        <InfoRow label="Loaded Activities" value={activities.length} />
        <InfoRow label="Subscriptions" value={subscriptions.length} />
        <InfoRow label="Loading More" value={isLoadingMore} />
        <InfoRow label="Has More" value={hasMoreActivities} />
      </View>

      <View style={[styles.infoGroup, { backgroundColor: surfaceSecondaryColor }]}>
        <ThemedText style={[styles.infoGroupTitle, { color: primaryTextColor }]}>
          ⏳ Pending Requests
        </ThemedText>
        <InfoRow label="Loading Request" value={isLoadingRequest} />
        <InfoRow label="Has Pending URL" value={!!pendingUrl} />
        <InfoRow label="Request Failed" value={requestFailed} />
      </View>

      <View style={[styles.infoGroup, { backgroundColor: surfaceSecondaryColor }]}>
        <ThemedText style={[styles.infoGroupTitle, { color: primaryTextColor }]}>
          💰 Wallet Manager
        </ThemedText>
        <InfoRow label="Initialized" value={isWalletManagerInitialized} />
        <InfoRow label="Preferred Wallet" value={preferredWallet || 'none'} />
        <InfoRow label="Has Active Wallet" value={!!activeWallet} />
        <InfoRow
          label="Breez Status"
          value={walletStatus.get(WALLET_TYPE.BREEZ) || WALLET_CONNECTION_STATUS.NOT_CONFIGURED}
        />
        <InfoRow
          label="NWC Status"
          value={walletStatus.get(WALLET_TYPE.NWC) || WALLET_CONNECTION_STATUS.NOT_CONFIGURED}
        />
      </View>

      <View style={[styles.infoGroup, { backgroundColor: surfaceSecondaryColor }]}>
        <ThemedText style={[styles.infoGroupTitle, { color: primaryTextColor }]}>
          🚀 Onboarding
        </ThemedText>
        <InfoRow label="Loading" value={onboardingLoading} />
        <InfoRow label="Complete" value={isOnboardingComplete} />
      </View>

      <View style={[styles.infoGroup, { backgroundColor: surfaceSecondaryColor }]}>
        <ThemedText style={[styles.infoGroupTitle, { color: primaryTextColor }]}>
          🔒 App Lock
        </ThemedText>
        <InfoRow label="Locked" value={isLocked} />
        <InfoRow label="Lock Enabled" value={isLockEnabled} />
        <InfoRow label="Auth Method" value={authMethod || 'none'} />
        <InfoRow label="Has PIN" value={hasPIN} />
        <InfoRow label="Fingerprint Supported" value={isFingerprintSupported} />
      </View>

      <View style={[styles.infoGroup, { backgroundColor: surfaceSecondaryColor }]}>
        <ThemedText style={[styles.infoGroupTitle, { color: primaryTextColor }]}>
          🎨 Theme & Currency
        </ThemedText>
        <InfoRow label="Theme Mode" value={themeMode} />
        <InfoRow label="Current Theme" value={currentTheme} />
        <InfoRow label="Preferred Currency" value={preferredCurrency} />
      </View>
    </ThemedView>
  );
}

// QR Code Tester Component
function QRCodeTester({
  cardBackgroundColor,
  surfaceSecondaryColor,
  primaryTextColor,
  secondaryTextColor,
  buttonColor,
  buttonTextColor,
}: {
  cardBackgroundColor: string;
  surfaceSecondaryColor: string;
  primaryTextColor: string;
  secondaryTextColor: string;
  buttonColor: string;
  buttonTextColor: string;
}) {
  const [qrCodeInput, setQrCodeInput] = useState('');
  const [isNWCMode, setIsNWCMode] = useState(false);
  const nostrService = useNostrService();
  const { showSkeletonLoader } = usePendingRequests();

  const validateQRCode = (data: string): { isValid: boolean; error?: string } => {
    if (isNWCMode) {
      if (!data.startsWith('nostr+walletconnect://')) {
        return {
          isValid: false,
          error: 'Invalid NWC QR code. Please enter a valid Nostr Wallet Connect URL.',
        };
      }
    } else {
      try {
        parseKeyHandshakeUrl(data);
      } catch (_error) {
        return {
          isValid: false,
          error: 'Invalid QR code. Please enter a valid Portal authentication QR code.',
        };
      }
    }
    return { isValid: true };
  };

  const handleProcessQRCode = () => {
    if (!qrCodeInput.trim()) {
      Alert.alert('Empty Input', 'Please enter a QR code payload to test.');
      return;
    }

    const validation = validateQRCode(qrCodeInput);
    if (!validation.isValid) {
      Alert.alert('Invalid QR Code', validation.error || 'Invalid QR code');
      return;
    }

    if (isNWCMode) {
      const timestamp = Date.now();
      router.replace({
        pathname: '/wallet',
        params: {
          scannedUrl: qrCodeInput,
          source: 'debug',
          returnToWallet: 'false',
          timestamp: timestamp.toString(),
        },
      });
      Alert.alert('Success', 'Navigating to wallet with the provided NWC URL.');
    } else {
      try {
        const parsedUrl = parseKeyHandshakeUrl(qrCodeInput);
        showSkeletonLoader(parsedUrl);
        nostrService.sendKeyHandshake(parsedUrl);
        Alert.alert('Success', 'QR code processed successfully. Check for pending requests.');
      } catch (_error) {
        Alert.alert('Processing Error', 'Failed to process QR code. Please try again.');
      }
    }
  };

  return (
    <ThemedView style={[styles.section, { backgroundColor: cardBackgroundColor }]}>
      <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
        📱 QR Code Testing
      </ThemedText>
      <ThemedText style={[styles.description, { color: secondaryTextColor }]}>
        Test QR code payloads without needing a camera. Useful for Android emulator testing.
      </ThemedText>

      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <ThemedText style={[styles.settingLabel, { color: primaryTextColor }]}>
            NWC Mode
          </ThemedText>
          <ThemedText style={[styles.settingSubtext, { color: secondaryTextColor }]}>
            {isNWCMode ? 'Test Nostr Wallet Connect (NWC) URLs' : 'Test Portal authentication URLs'}
          </ThemedText>
        </View>
        <Switch
          value={isNWCMode}
          onValueChange={setIsNWCMode}
          trackColor={{ false: '#767577', true: buttonColor }}
          thumbColor={isNWCMode ? '#ffffff' : '#f4f3f4'}
        />
      </View>

      <View style={styles.settingColumn}>
        <ThemedText style={[styles.settingLabel, { color: primaryTextColor }]}>
          QR Code Payload
        </ThemedText>
        <ThemedText style={[styles.settingSubtext, { color: secondaryTextColor }]}>
          {isNWCMode ? 'Enter a nostr+walletconnect:// URL' : 'Enter a portal:// URL'}
        </ThemedText>

        <TextInput
          style={[
            styles.qrInput,
            {
              backgroundColor: surfaceSecondaryColor,
              color: primaryTextColor,
              borderColor: surfaceSecondaryColor,
            },
          ]}
          value={qrCodeInput}
          onChangeText={setQrCodeInput}
          placeholder={isNWCMode ? 'nostr+walletconnect://...' : 'portal://...'}
          placeholderTextColor={secondaryTextColor}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: buttonColor }]}
        onPress={handleProcessQRCode}
      >
        <ThemedText style={[styles.actionButtonText, { color: buttonTextColor }]}>
          🚀 Process QR Code
        </ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.actionButton,
          {
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: buttonColor,
          },
        ]}
        onPress={() => setQrCodeInput('')}
      >
        <ThemedText style={[styles.actionButtonText, { color: buttonColor }]}>
          🧹 Clear Input
        </ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

// Currency Conversion Tester Component
function CurrencyConverter({
  cardBackgroundColor,
  surfaceSecondaryColor,
  primaryTextColor,
  secondaryTextColor,
  buttonColor,
  buttonTextColor,
}: {
  cardBackgroundColor: string;
  surfaceSecondaryColor: string;
  primaryTextColor: string;
  secondaryTextColor: string;
  buttonColor: string;
  buttonTextColor: string;
}) {
  const [conversionAmount, setConversionAmount] = useState('');
  const [sourceCurrency, setSourceCurrency] = useState('');
  const [destinationCurrency, setDestinationCurrency] = useState('');
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  const handleCurrencyConversion = async () => {
    if (!conversionAmount.trim() || !sourceCurrency.trim() || !destinationCurrency.trim()) {
      Alert.alert(
        'Missing Fields',
        'Please enter amount, source currency, and destination currency.'
      );
      return;
    }

    const amount = Number.parseFloat(conversionAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid positive number.');
      return;
    }

    setIsConverting(true);
    setConvertedAmount(null);

    try {
      const result = await CurrencyConversionService.convertAmount(
        amount,
        sourceCurrency.trim(),
        destinationCurrency.trim()
      );
      setConvertedAmount(result);
    } catch (_error) {
      Alert.alert(
        'Conversion Failed',
        'Unable to convert currencies. Please check your inputs and try again.'
      );
    } finally {
      setIsConverting(false);
    }
  };

  const handleClear = () => {
    setConversionAmount('');
    setSourceCurrency('');
    setDestinationCurrency('');
    setConvertedAmount(null);
  };

  return (
    <ThemedView style={[styles.section, { backgroundColor: cardBackgroundColor }]}>
      <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
        💱 Currency Conversion Testing
      </ThemedText>
      <ThemedText style={[styles.description, { color: secondaryTextColor }]}>
        Test currency conversion between different currencies. Supports BTC, SATS, MSATS, and fiat
        currencies.
      </ThemedText>

      <View style={styles.settingColumn}>
        <ThemedText style={[styles.settingLabel, { color: primaryTextColor }]}>Amount</ThemedText>
        <ThemedText style={[styles.settingSubtext, { color: secondaryTextColor }]}>
          Enter the amount to convert (positive number)
        </ThemedText>
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: surfaceSecondaryColor,
              color: primaryTextColor,
              borderColor: surfaceSecondaryColor,
            },
          ]}
          value={conversionAmount}
          onChangeText={setConversionAmount}
          placeholder="e.g., 100"
          placeholderTextColor={secondaryTextColor}
          keyboardType="numeric"
        />
      </View>

      <View style={styles.settingColumn}>
        <ThemedText style={[styles.settingLabel, { color: primaryTextColor }]}>
          Source Currency
        </ThemedText>
        <ThemedText style={[styles.settingSubtext, { color: secondaryTextColor }]}>
          Currency to convert from (e.g., BTC, SATS, USD, EUR)
        </ThemedText>
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: surfaceSecondaryColor,
              color: primaryTextColor,
              borderColor: surfaceSecondaryColor,
            },
          ]}
          value={sourceCurrency}
          onChangeText={setSourceCurrency}
          placeholder="e.g., BTC"
          placeholderTextColor={secondaryTextColor}
          autoCapitalize="characters"
        />
      </View>

      <View style={styles.settingColumn}>
        <ThemedText style={[styles.settingLabel, { color: primaryTextColor }]}>
          Destination Currency
        </ThemedText>
        <ThemedText style={[styles.settingSubtext, { color: secondaryTextColor }]}>
          Currency to convert to (e.g., SATS, USD, EUR, BTC)
        </ThemedText>
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: surfaceSecondaryColor,
              color: primaryTextColor,
              borderColor: surfaceSecondaryColor,
            },
          ]}
          value={destinationCurrency}
          onChangeText={setDestinationCurrency}
          placeholder="e.g., SATS"
          placeholderTextColor={secondaryTextColor}
          autoCapitalize="characters"
        />
      </View>

      <TouchableOpacity
        style={[
          styles.actionButton,
          {
            backgroundColor: isConverting ? '#ccc' : buttonColor,
          },
        ]}
        onPress={handleCurrencyConversion}
        disabled={isConverting}
      >
        <ThemedText style={[styles.actionButtonText, { color: buttonTextColor }]}>
          {isConverting ? '⏳ Converting...' : '🔄 Convert Currency'}
        </ThemedText>
      </TouchableOpacity>

      {convertedAmount !== null && (
        <ThemedView style={[styles.resultContainer, { backgroundColor: surfaceSecondaryColor }]}>
          <ThemedText style={[styles.resultLabel, { color: primaryTextColor }]}>Result:</ThemedText>
          <ThemedText style={[styles.resultValue, { color: primaryTextColor }]}>
            {convertedAmount.toFixed(8).replace(/\.?0+$/, '')}
          </ThemedText>
        </ThemedView>
      )}

      <TouchableOpacity
        style={[
          styles.actionButton,
          {
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: buttonColor,
          },
        ]}
        onPress={handleClear}
      >
        <ThemedText style={[styles.actionButtonText, { color: buttonColor }]}>
          🧹 Clear All
        </ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

// App Lock Tester Component
function AppLockTester({
  cardBackgroundColor,
  primaryTextColor,
  secondaryTextColor,
  buttonColor,
}: {
  cardBackgroundColor: string;
  primaryTextColor: string;
  secondaryTextColor: string;
  buttonColor: string;
}) {
  const [isFingerprintSupported, setIsFingerprintSupported] = useState<boolean | null>(null);

  useEffect(() => {
    const loadFingerprintStatus = async () => {
      try {
        const fingerprintSupported = await AppLockService.getFingerprintSupported();
        setIsFingerprintSupported(fingerprintSupported);
      } catch (_error) {
        // Ignore errors
      }
    };

    loadFingerprintStatus();
  }, []);

  const handleInvertFingerprintSupport = async () => {
    if (isFingerprintSupported === null) return;

    try {
      const newValue = !isFingerprintSupported;
      await AppLockService.setFingerprintSupported(newValue);
      setIsFingerprintSupported(newValue);
    } catch (_error) {
      Alert.alert('Error', 'Failed to invert fingerprint support value.');
    }
  };

  return (
    <ThemedView style={[styles.section, { backgroundColor: cardBackgroundColor }]}>
      <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
        🔒 App Lock Testing
      </ThemedText>
      <ThemedText style={[styles.description, { color: secondaryTextColor }]}>
        Test biometric authentication support detection and inversion.
      </ThemedText>

      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <ThemedText style={[styles.settingLabel, { color: primaryTextColor }]}>
            Invert Fingerprint Support
          </ThemedText>
          <ThemedText style={[styles.settingSubtext, { color: secondaryTextColor }]}>
            Current:{' '}
            {isFingerprintSupported === null
              ? 'Loading...'
              : isFingerprintSupported
                ? 'Supported'
                : 'Not Supported'}
          </ThemedText>
        </View>
        <Switch
          value={isFingerprintSupported === null ? false : isFingerprintSupported}
          onValueChange={handleInvertFingerprintSupport}
          trackColor={{ false: '#767577', true: buttonColor }}
          thumbColor={
            isFingerprintSupported === null
              ? '#f4f3f4'
              : isFingerprintSupported
                ? '#ffffff'
                : '#f4f3f4'
          }
          disabled={isFingerprintSupported === null}
        />
      </View>
    </ThemedView>
  );
}

// Debug Actions Component
function DebugActions({
  cardBackgroundColor,
  primaryTextColor,
  buttonColor,
  buttonTextColor,
}: {
  cardBackgroundColor: string;
  primaryTextColor: string;
  buttonColor: string;
  buttonTextColor: string;
}) {
  return (
    <ThemedView style={[styles.section, { backgroundColor: cardBackgroundColor }]}>
      <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
        🔧 Debug Actions
      </ThemedText>

      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: buttonColor }]}
        onPress={() => {
          router.push('/(onboarding)/profile-setup-error');
        }}
      >
        <ThemedText style={[styles.actionButtonText, { color: buttonTextColor }]}>
          🚨 View Onboarding Error Page
        </ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: buttonColor }]}
        onPress={() => {
          const testMessage = encodeURIComponent(
            'This is a test error message from the debug page. All diagnostic information will be included in the error report.'
          );
          router.push(`/error?message=${testMessage}&icon=error`);
        }}
      >
        <ThemedText style={[styles.actionButtonText, { color: buttonTextColor }]}>
          🐛 View Error Page
        </ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

export default function DebugScreen() {
  const [isInitialized, setIsInitialized] = useState(false);

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const surfaceSecondaryColor = useThemeColor({}, 'surfaceSecondary');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonColor = useThemeColor({}, 'buttonSecondary');
  const buttonTextColor = useThemeColor({}, 'buttonSecondaryText');
  const inputBorderColor = useThemeColor({}, 'inputBorder');

  useEffect(() => {
    setIsInitialized(true);
  }, []);

  if (!isInitialized) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
        <ThemedView style={styles.container}>
          <ThemedText style={[styles.title, { color: primaryTextColor }]}>Loading...</ThemedText>
        </ThemedView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <View style={[styles.header, { backgroundColor, borderBottomColor: inputBorderColor }]}>
          <View style={styles.headerContent}>
            <View style={styles.headerTextContainer}>
              <ThemedText style={[styles.title, { color: primaryTextColor }]}>
                Debug Playground
              </ThemedText>
              <ThemedText style={[styles.subtitle, { color: secondaryTextColor }]}>
                Development tools and testing utilities
              </ThemedText>
            </View>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ReactStateMonitor
            cardBackgroundColor={cardBackgroundColor}
            surfaceSecondaryColor={surfaceSecondaryColor}
            primaryTextColor={primaryTextColor}
            secondaryTextColor={secondaryTextColor}
          />

          <QRCodeTester
            cardBackgroundColor={cardBackgroundColor}
            surfaceSecondaryColor={surfaceSecondaryColor}
            primaryTextColor={primaryTextColor}
            secondaryTextColor={secondaryTextColor}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
          />

          <CurrencyConverter
            cardBackgroundColor={cardBackgroundColor}
            surfaceSecondaryColor={surfaceSecondaryColor}
            primaryTextColor={primaryTextColor}
            secondaryTextColor={secondaryTextColor}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
          />

          <AppLockTester
            cardBackgroundColor={cardBackgroundColor}
            primaryTextColor={primaryTextColor}
            secondaryTextColor={secondaryTextColor}
            buttonColor={buttonColor}
          />

          <DebugActions
            cardBackgroundColor={cardBackgroundColor}
            primaryTextColor={primaryTextColor}
            buttonColor={buttonColor}
            buttonTextColor={buttonTextColor}
          />
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTextContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    lineHeight: 32,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.7,
  },
  section: {
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 8,
  },
  settingColumn: {
    marginTop: 16,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  settingSubtext: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  actionButton: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  qrInput: {
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  textInput: {
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  resultContainer: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  resultLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  resultValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoGroup: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
  },
  infoGroupTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 12,
    flex: 1,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    fontFamily: 'monospace',
  },
  scrollableKeyRow: {
    marginTop: 12,
  },
  scrollableKeyLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  scrollableKeyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
  },
  scrollableKeyScrollView: {
    flex: 1,
  },
  scrollableKeyText: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  scrollableKeyCopyButton: {
    marginLeft: 8,
    padding: 4,
  },
  scrollableKeyValue: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});
