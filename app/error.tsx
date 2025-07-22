import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, AppState } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCircle, AlertTriangle, XCircle } from 'lucide-react-native';
import { useThemeColor } from '@/hooks/useThemeColor';
import * as Linking from 'expo-linking';
import * as Constants from 'expo-constants';
import { useNostrService } from '@/context/NostrServiceContext';
import * as Clipboard from 'expo-clipboard';

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
  const nostrService = useNostrService();

  // Gather diagnostic info
  const appVersion = Constants?.default?.expoConfig?.version || 'unknown';
  const timestamp = new Date().toISOString();
  const relayStatuses = JSON.stringify(nostrService.relayStatuses, null, 2);
  const nwcConnectionStatus = String(nostrService.nwcConnectionStatus);
  const nwcConnectionError = nostrService.nwcConnectionError || 'N/A';
  const walletInfoLastUpdated = nostrService.walletInfo?.lastUpdated
    ? nostrService.walletInfo.lastUpdated.toISOString()
    : 'N/A';
  const isInitialized = String(nostrService.isInitialized);
  const isWalletConnected = String(nostrService.isWalletConnected);
  const appIsActive = String(AppState.currentState);
  const pendingRequestsCount = Object.keys(nostrService.pendingRequests || {}).length;
  const connectedCount = String(nostrService.connectedCount);
  const allRelaysConnected = String(nostrService.allRelaysConnected);

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
  const expoVersion = safe(deviceInfo.expoVersion);
  const rnVersion = deviceInfo.reactNativeVersion
    ? JSON.stringify(deviceInfo.reactNativeVersion)
    : 'N/A';
  const platform = deviceInfo.platform ? JSON.stringify(deviceInfo.platform) : 'N/A';

  // App uptime: always show a value
  const displayUptime = uptime || '0h 0m 0s';

  // Pending requests summary
  const pendingRequestsSummary =
    Object.values(nostrService.pendingRequests || {})
      .map(
        (req: any) =>
          `  - type: ${req.type}, timestamp: ${req.timestamp?.toISOString?.() || req.timestamp}`
      )
      .join('\n') || 'None';

  // Support email from env variable
  const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'support@yourdomain.com';

  const emailBody =
    `Error message: ${errorMessage}\n` +
    `App version: ${safe(appVersion)}\n` +
    // Expo/React Native version removed
    `OS: ${osName} ${osVersion}\n` +
    `Device: ${deviceModel}\n` +
    `Platform: ${platform}\n` +
    `Timestamp: ${timestamp}\n` +
    `App uptime: ${displayUptime}\n` +
    `Current AppState: ${appIsActive}\n` +
    `\n--- App State ---\n` +
    `isInitialized: ${isInitialized}\n` +
    `isWalletConnected: ${isWalletConnected}\n` +
    `pendingRequestsCount: ${pendingRequestsCount}\n` +
    `connectedCount: ${connectedCount}\n` +
    `allRelaysConnected: ${allRelaysConnected}\n` +
    `\n--- Pending Requests ---\n${pendingRequestsSummary}\n` +
    `\n--- Relay Statuses ---\n${relayStatuses}\n` +
    `\n--- NWC Connection ---\n` +
    `nwcConnectionStatus: ${nwcConnectionStatus}\n` +
    `nwcConnectionError: ${nwcConnectionError}\n` +
    `\n--- Wallet Info ---\n` +
    `alias: ${nostrService.walletInfo?.data?.alias || 'N/A'}\n` +
    `lastUpdated: ${walletInfoLastUpdated}\n`;

  const mailto = `mailto:${supportEmail}?subject=Portal App - Unrecoverable Error&body=${encodeURIComponent(emailBody)}`;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <ThemedView style={styles.container}>
        <View style={styles.iconContainer}>{iconMap[iconKey] || iconMap['error']}</View>
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
            } catch (e) {
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
