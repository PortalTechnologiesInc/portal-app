import * as Clipboard from 'expo-clipboard';
import * as Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { keyToHex } from 'portal-app-lib';
import { AlertCircle, AlertTriangle, XCircle } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef } from 'react';
import { Alert, AppState, StyleSheet, TouchableOpacity, View } from 'react-native';
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
import { useUserProfile } from '@/context/UserProfileContext';
import { useWalletManager } from '@/context/WalletManagerContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { WALLET_CONNECTION_STATUS, WALLET_TYPE } from '@/models/WalletType';
import { useTheme } from '@/context/ThemeContext';

const iconMap: Record<string, React.ReactNode> = {
  alert: <AlertTriangle size={48} color="#FFB300" />,
  error: <AlertCircle size={48} color="#FF3333" />,
  x: <XCircle size={48} color="#FF3333" />,
};

export default function ErrorScreen() {
  const params = useLocalSearchParams();
  const errorMessage =
    typeof params.message === 'string' ? params.message : 'An unexpected error occurred.';
  const iconKey = typeof params.icon === 'string' ? params.icon : 'error';
  const backgroundColor = useThemeColor({}, 'background');
  const statusErrorColor = useThemeColor({}, 'statusError');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');

  // Helper to sanitize objects by converting BigInt to strings (prevents React serialization errors)
  const sanitizeForReact = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return obj.toString() + 'n';
    if (Array.isArray(obj)) return obj.map(sanitizeForReact);
    if (obj instanceof Map) {
      const sanitized = new Map();
      obj.forEach((value, key) => {
        sanitized.set(key, sanitizeForReact(value));
      });
      return sanitized;
    }
    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeForReact(value);
      }
      return sanitized;
    }
    return obj;
  };

  // Gather data from all contexts
  // Note: If a context provider is missing, hooks will throw - this is expected and helps diagnose the issue
  const { mnemonic, nsec, isLoading: keyLoading, isWalletConnected } = useKey();
  const {
    isInitialized: nostrInitialized,
    publicKey,
    allRelaysConnected,
    connectedCount,
    relayStatuses,
    walletInfo: nostrWalletInfoRaw,
    pendingRequests: nostrPendingRequestsRaw,
  } = useNostrService();
  const { username, displayName, syncStatus, isProfileEditable } = useUserProfile();
  const {
    activities,
    subscriptions,
    isLoadingMore,
    hasMoreActivities,
    totalActivities,
  } = useActivities();
  const { isLoadingRequest, pendingUrl, requestFailed } = usePendingRequests();
  const {
    activeWallet: activeWalletRaw,
    walletStatus: walletStatusRaw,
    isWalletManagerInitialized,
    preferredWallet,
    walletInfo: walletManagerInfoRaw,
  } = useWalletManager();
  const { isOnboardingComplete, isLoading: onboardingLoading } = useOnboarding();
  const { isLocked, isLockEnabled, authMethod, hasPIN, isFingerprintSupported } = useAppLock();
  const { preferredCurrency } = useCurrency();
  const { themeMode } = useTheme();

  // Sanitize objects containing BigInt immediately to prevent React serialization errors
  // Note: walletStatus remains a Map for .get() access, but values are sanitized
  const nostrWalletInfo = useMemo(() => sanitizeForReact(nostrWalletInfoRaw), [nostrWalletInfoRaw]);
  const nostrPendingRequests = useMemo(
    () => sanitizeForReact(nostrPendingRequestsRaw),
    [nostrPendingRequestsRaw]
  );
  const walletManagerInfo = useMemo(() => sanitizeForReact(walletManagerInfoRaw), [walletManagerInfoRaw]);
  const activeWallet = useMemo(() => sanitizeForReact(activeWalletRaw), [activeWalletRaw]);
  
  // walletStatus needs to remain a Map, but sanitize its values
  const walletStatus = useMemo(() => {
    if (!walletStatusRaw || !(walletStatusRaw instanceof Map)) return walletStatusRaw;
    const sanitized = new Map();
    walletStatusRaw.forEach((value, key) => {
      sanitized.set(key, sanitizeForReact(value));
    });
    return sanitized;
  }, [walletStatusRaw]);

  // Gather diagnostic info
  const appVersion = Constants?.default?.expoConfig?.version || 'unknown';
  const timestamp = new Date().toISOString();
  const appIsActive = String(AppState.currentState);

  // App uptime tracking
  const launchTimeRef = useRef(Date.now());
  const [uptime, setUptime] = React.useState('');
  useEffect(() => {
    const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - launchTimeRef.current) / 1000);
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      setUptime(`${h}h ${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Device info with better missing data handling
  const safe = (val: any) => (val && val !== 'unknown' ? val : 'N/A');
  const deviceInfo = Constants.default;
  const deviceModel = safe(deviceInfo.deviceName || deviceInfo.deviceId);
  const osName = deviceInfo.platform?.ios
    ? 'iOS'
    : deviceInfo.platform?.android
      ? 'Android'
      : 'N/A';
  const osVersion = safe(deviceInfo.osVersion || deviceInfo.systemVersion);
  const platform = deviceInfo.platform ? JSON.stringify(deviceInfo.platform) : 'N/A';

  // App uptime: always show a value
  const displayUptime = uptime || '0h 0m 0s';

  // Public key hex conversion
  const publicKeyHex = useMemo(() => {
    if (!publicKey) return null;
    try {
      return keyToHex(publicKey);
    } catch {
      return null;
    }
  }, [publicKey]);

  // Format values for report
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'string') return value || '(empty)';
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'bigint') return value.toString() + 'n';
    if (Array.isArray(value)) return `[${value.length} items]`;
    if (value instanceof Map) {
      const entries = Array.from(value.entries())
        .map(([k, v]) => `${k}: ${formatValue(v)}`)
        .join(', ');
      return `Map(${value.size}) {${entries}}`;
    }
    if (typeof value === 'object') {
      try {
        // Handle BigInt in objects by converting to string
        return JSON.stringify(
          value,
          (key, val) => (typeof val === 'bigint' ? val.toString() + 'n' : val),
          2
        );
      } catch {
        return '[Object]';
      }
    }
    return String(value);
  };

  // Pending requests summary
  const pendingRequestsSummary =
    Object.values(nostrPendingRequests || {})
      .map(
        (req: any) =>
          `  - type: ${req.type}, timestamp: ${req.timestamp?.toISOString?.() || req.timestamp}`
      )
      .join('\n') || 'None';

  // Wallet status summary (with safe access)
  const breezStatus =
    walletStatus?.get?.(WALLET_TYPE.BREEZ) || WALLET_CONNECTION_STATUS.NOT_CONFIGURED;
  const nwcStatus =
    walletStatus?.get?.(WALLET_TYPE.NWC) || WALLET_CONNECTION_STATUS.NOT_CONFIGURED;

  // Support email from env variable
  const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'support@yourdomain.com';

  // Build comprehensive error report
  const emailBody =
    `=== PORTAL APP ERROR REPORT ===\n\n` +
    `Error message: ${errorMessage}\n` +
    `Timestamp: ${timestamp}\n` +
    `App uptime: ${displayUptime}\n` +
    `\n--- Device & Environment ---\n` +
    `App version: ${safe(appVersion)}\n` +
    `OS: ${osName} ${osVersion}\n` +
    `Device: ${deviceModel}\n` +
    `Platform: ${platform}\n` +
    `Current AppState: ${appIsActive}\n` +
    `\n--- Key Context ---\n` +
    `Loading: ${formatValue(keyLoading)}\n` +
    `Has Mnemonic: ${formatValue(!!mnemonic)}\n` +
    `Has Nsec: ${formatValue(!!nsec)}\n` +
    `Has Wallet URL: ${formatValue(isWalletConnected)}\n` +
    `\n--- Nostr Service ---\n` +
    `Initialized: ${formatValue(nostrInitialized)}\n` +
    `Public Key (npub): ${publicKey ? `${publicKey.substring(0, 20)}...${publicKey.substring(publicKey.length - 10)}` : 'N/A'}\n` +
    `Public Key (hex): ${publicKeyHex ? `${publicKeyHex.substring(0, 20)}...${publicKeyHex.substring(publicKeyHex.length - 10)}` : 'N/A'}\n` +
    `All Relays Connected: ${formatValue(allRelaysConnected)}\n` +
    `Connected Count: ${connectedCount}/${relayStatuses?.length || 0}\n` +
    `Total Relays: ${relayStatuses?.length || 0}\n` +
    `Relay Statuses:\n${relayStatuses ? JSON.stringify(relayStatuses, null, 2) : 'N/A'}\n` +
    `Wallet Info Alias: ${nostrWalletInfo?.data?.alias || 'N/A'}\n` +
    `Wallet Info Last Updated: ${nostrWalletInfo?.lastUpdated?.toISOString() || 'N/A'}\n` +
    `\n--- User Profile ---\n` +
    `Username: ${formatValue(username)}\n` +
    `Display Name: ${formatValue(displayName)}\n` +
    `Sync Status: ${formatValue(syncStatus)}\n` +
    `Profile Editable: ${formatValue(isProfileEditable)}\n` +
    `\n--- Activities ---\n` +
    `Total Activities: ${formatValue(totalActivities)}\n` +
    `Loaded Activities: ${formatValue(activities?.length || 0)}\n` +
    `Subscriptions: ${formatValue(subscriptions?.length || 0)}\n` +
    `Loading More: ${formatValue(isLoadingMore)}\n` +
    `Has More: ${formatValue(hasMoreActivities)}\n` +
    `\n--- Pending Requests ---\n` +
    `Loading Request: ${formatValue(isLoadingRequest)}\n` +
    `Has Pending URL: ${formatValue(!!pendingUrl)}\n` +
    `Pending URL: ${pendingUrl || 'N/A'}\n` +
    `Request Failed: ${formatValue(requestFailed)}\n` +
    `Pending Requests Count: ${Object.keys(nostrPendingRequests || {}).length}\n` +
    `Pending Requests Details:\n${pendingRequestsSummary}\n` +
    `\n--- Wallet Manager ---\n` +
    `Initialized: ${formatValue(isWalletManagerInitialized)}\n` +
    `Preferred Wallet: ${formatValue(preferredWallet || 'none')}\n` +
    `Has Active Wallet: ${formatValue(!!activeWallet)}\n` +
    `Breez Status: ${formatValue(breezStatus)}\n` +
    `NWC Status: ${formatValue(nwcStatus)}\n` +
    `Wallet Info: ${walletManagerInfo ? JSON.stringify(walletManagerInfo, null, 2) : 'N/A'}\n` +
    `\n--- Onboarding ---\n` +
    `Loading: ${formatValue(onboardingLoading)}\n` +
    `Complete: ${formatValue(isOnboardingComplete)}\n` +
    `\n--- App Lock ---\n` +
    `Locked: ${formatValue(isLocked)}\n` +
    `Lock Enabled: ${formatValue(isLockEnabled)}\n` +
    `Auth Method: ${formatValue(authMethod)}\n` +
    `Has PIN: ${formatValue(hasPIN)}\n` +
    `Fingerprint Supported: ${formatValue(isFingerprintSupported)}\n` +
    `\n--- Theme & Currency ---\n` +
    `Theme Mode: ${formatValue(themeMode)}\n` +
    `Preferred Currency: ${formatValue(preferredCurrency)}\n`;

  const mailto = `mailto:${supportEmail}?subject=Portal App - Unrecoverable Error&body=${encodeURIComponent(emailBody)}`;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <ThemedView style={styles.container}>
        <View style={styles.iconContainer}>{iconMap[iconKey] || iconMap.error}</View>
        <ThemedText style={[styles.errorText, { color: statusErrorColor }]}>Error</ThemedText>
        <ThemedText style={styles.messageText}>{errorMessage}</ThemedText>
        <ThemedText style={styles.instructionText}>
          This is an unrecoverable error. Please send a report email to help us debug the issue. All
          relevant diagnostic information will be included automatically.
        </ThemedText>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: buttonPrimaryColor }]}
          onPress={async () => {
            try {
              const canOpen = await Linking.canOpenURL(mailto);
              if (canOpen) {
                await Linking.openURL(mailto);
              } else {
                Alert.alert(
                  'No email app found',
                  'Please configure an email app to send the report.'
                );
              }
            } catch (_e) {
              Alert.alert(
                'Failed to open email',
                'Please copy the error details and send them to support manually.'
              );
            }
          }}
        >
          <ThemedText style={[styles.buttonText, { color: buttonPrimaryTextColor }]}>
            Send Report Email
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: buttonPrimaryColor, marginTop: 12 }]}
          onPress={async () => {
            await Clipboard.setStringAsync(emailBody);
            Alert.alert(
              'Copied',
              'Report details copied to clipboard. You can now paste them into an email to support.'
            );
          }}
        >
          <ThemedText style={[styles.buttonText, { color: buttonPrimaryTextColor }]}>
            Copy Report to Clipboard
          </ThemedText>
        </TouchableOpacity>
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  iconContainer: {
    marginBottom: 24,
  },
  errorText: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  messageText: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 32,
  },
  instructionText: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 18,
    color: '#888',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});
