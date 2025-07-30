import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Dimensions,
  Alert,
  Platform,
  ActivityIndicator,
  AppState,
  Animated,
  BackHandler,
} from 'react-native';
import NfcManager, { NfcEvents, NfcTech, Ndef } from 'react-native-nfc-manager';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Nfc, CheckCircle, XCircle, Settings } from 'lucide-react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { showToast } from '@/utils/Toast';
import * as Linking from 'expo-linking';
import { useDeeplink } from '@/context/DeeplinkContext';

export default function NFCScanScreen() {
  const router = useRouter();
  const [isNFCEnabled, setIsNFCEnabled] = useState<boolean | null>(null);
  const [isCheckingNFC, setIsCheckingNFC] = useState(false);
  const [scanState, setScanState] = useState<'ready' | 'scanning' | 'success' | 'error'>('ready');
  const [isPageFocused, setIsPageFocused] = useState(false);
  // Use ref for immediate synchronous access to focus state
  const isPageFocusedRef = useRef(false);
  // Track if we're intentionally leaving the page to avoid error toasts
  const isLeavingPageRef = useRef(false);

  // Animation for glowing NFC icon
  const glowAnimation = useRef(new Animated.Value(1)).current;
  
  // Animation for scan line
  const scanLineAnimation = useRef(new Animated.Value(0)).current;
  
  // Timeout ID tracking to ensure proper cleanup
  const scanTimeouts = useRef<number[]>([]);

  // Helper function to manage timeouts
  const addTimeout = (callback: () => void, delay: number) => {
    const timeoutId = setTimeout(() => {
      // Remove this timeout from tracking array when it executes
      scanTimeouts.current = scanTimeouts.current.filter(id => id !== timeoutId);
      // Double-check page is still focused before executing callback
      if (isPageFocusedRef.current) {
        callback();
      }
    }, delay) as unknown as number;
    
    // Track the timeout ID for cleanup
    scanTimeouts.current.push(timeoutId);
    return timeoutId;
  };

  // Helper function to clear all timeouts
  const clearAllTimeouts = () => {
    scanTimeouts.current.forEach(timeoutId => clearTimeout(timeoutId as any));
    scanTimeouts.current = [];
  };

  const scanMessage = isNFCEnabled === null
    ? 'Checking NFC status...'
    : isNFCEnabled
      ? scanState === 'scanning'
        ? 'Hold your device near an NFC tag to scan'
        : scanState === 'success'
        ? 'NFC tag detected successfully!'
        : scanState === 'error'
        ? 'Scan failed. Use retry button below to scan again.'
        : 'Ready to scan NFC tags automatically'
      : 'Please enable NFC to use this feature';

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');
  const statusConnectedColor = useThemeColor({}, 'statusConnected');
  const statusErrorColor = useThemeColor({}, 'statusError');
  const statusWarningColor = useThemeColor({}, 'statusWarning');
  const borderPrimaryColor = useThemeColor({}, 'borderPrimary');
  const surfaceSecondaryColor = useThemeColor({}, 'surfaceSecondary');
  const { handleDeepLink } = useDeeplink();

  // Screen dimensions
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const scanAreaSize = Math.min(screenWidth * 0.7, 280);

  // Real NFC Status Checking using react-native-nfc-manager
  const checkNFCStatus = async (): Promise<boolean> => {
    try {
      // Initialize NFC Manager if not already done
      const isStarted = await NfcManager.isSupported();
      if (!isStarted) {
        console.log('NFC not supported on this device');
        return false;
      }

      // Check if NFC is enabled
      const isEnabled = await NfcManager.isEnabled();
      return isEnabled;
    } catch (error) {
      console.log('NFC check error:', error);
      return false;
    }
  };

  const openNFCSettings = async () => {
    try {
      if (Platform.OS === 'android') {
        // Try to open NFC settings directly
        const nfcSettingsUrl = 'android.settings.NFC_SETTINGS';
        const canOpen = await Linking.canOpenURL(nfcSettingsUrl);

        if (canOpen) {
          await Linking.openURL(nfcSettingsUrl);
        } else {
          // Fallback to general wireless settings
          await Linking.openSettings();
        }
      } else {
        // For iOS, open general settings (NFC can't be controlled by user)
        await Linking.openSettings();
      }
    } catch (error) {
      console.error('Error opening settings:', error);
      // Only show toast if page is focused
      if (isPageFocusedRef.current && !isLeavingPageRef.current) {
        showToast('Unable to open settings. Please enable NFC manually.', 'error');
      }
    }
  };

  const showNFCEnableDialog = () => {
    Alert.alert(
      'Enable NFC',
      Platform.OS === 'android'
        ? 'NFC is required for contactless scanning. Would you like to open settings to enable it?'
        : 'NFC may be required for this feature. Would you like to open settings?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: openNFCSettings,
          style: 'default'
        },
      ]
    );
  };

  // Start glowing animation
  const startGlowAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnimation, {
          toValue: 1.3,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnimation, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  // Start scan line animation
  const startScanLineAnimation = () => {
    // Reset position
    scanLineAnimation.setValue(0);
    
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnimation, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnimation, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  // Stop glowing animation
  const stopGlowAnimation = () => {
    glowAnimation.stopAnimation();
    Animated.timing(glowAnimation, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  // Stop scan line animation
  const stopScanLineAnimation = () => {
    scanLineAnimation.stopAnimation();
    Animated.timing(scanLineAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  // NFC Status Change Handler
  const handleNFCStatusChange = useCallback(async (newStatus?: boolean) => {
    const enabled = newStatus !== undefined ? newStatus : await checkNFCStatus();

    if (enabled !== isNFCEnabled) {
      setIsNFCEnabled(enabled);
      setIsCheckingNFC(false);

      if (enabled) {
        // Only show toast if page is focused to prevent navigation issues
        // if (isPageFocusedRef.current && !isLeavingPageRef.current) {
        //   showToast('NFC enabled! Starting scan...', 'success');
        // }
        setScanState('ready');
        // Auto-start scanning when NFC becomes enabled
        addTimeout(() => {
          startScan();
        }, 100); // Start almost immediately
      } else {
        // Only show toast if page is focused to prevent navigation issues
        if (isPageFocusedRef.current && !isLeavingPageRef.current) {
          showToast('NFC disabled', 'error');
        }
        setScanState('ready');
        stopGlowAnimation();
      }
    }
  }, [isNFCEnabled]);

    // NFC page focus management - only active when page is visible
  useFocusEffect(
    useCallback(() => {
      let isListenerActive = false;
      let appStateListener: any = null;
      let scanningActive = false;

      const initializeNFC = async () => {
        try {
          console.log('Initializing NFC on page focus...');

          // Initialize NFC Manager
          await NfcManager.start();

          // Initial status check
          const enabled = await checkNFCStatus();
          setIsNFCEnabled(enabled);

          // Auto-start scanning if NFC is already enabled
          if (enabled) {
            scanningActive = true;
            addTimeout(() => {
              startScan();
            }, 100); // Start almost immediately
          }

          // Set up real-time NFC state change listener
          isListenerActive = true;
          NfcManager.setEventListener(NfcEvents.StateChanged, (event: any) => {
            console.log('NFC state changed:', event);
            const isEnabled = event.state === 'on' || event.state === 'turning_on';
            handleNFCStatusChange(isEnabled);
          });

        } catch (error) {
          console.log('NFC initialization error:', error);
          // Fallback to basic status check
          const enabled = await checkNFCStatus();
          setIsNFCEnabled(enabled);

          // Auto-start scanning if NFC is already enabled (fallback)
          if (enabled) {
            scanningActive = true;
            addTimeout(() => {
              startScan();
            }, 100); // Start almost immediately
          }
        }
      };

      // App state listener for returning from settings
      const handleAppStateChange = (nextAppState: string) => {
        if (nextAppState === 'active') {
          // Check NFC status when returning to app (e.g., from settings)
          addTimeout(() => handleNFCStatusChange(), 300);
        }
      };

      appStateListener = AppState.addEventListener('change', handleAppStateChange);

      // Set page as focused and initialize NFC
      console.log('NFC page focused - starting NFC operations');
      setIsPageFocused(true);
      isPageFocusedRef.current = true;  // Set ref immediately for synchronous access
      isLeavingPageRef.current = false; // Reset leaving page flag
      initializeNFC();

      // Cleanup when page loses focus
      return () => {
        console.log('NFC page unfocused - stopping all NFC operations');
        console.log('Cleaning up NFC on page unfocus...');

        // Mark that we're intentionally leaving the page
        isLeavingPageRef.current = true;

        // Stop any ongoing scanning
        if (scanningActive) {
          NfcManager.cancelTechnologyRequest().catch(e =>
            console.log('Error canceling NFC request during cleanup:', e)
          );
          scanningActive = false;
        }

        // Stop glow animation
        stopGlowAnimation();

        // Remove NFC state listener
        if (isListenerActive) {
          NfcManager.setEventListener(NfcEvents.StateChanged, null);
          isListenerActive = false;
        }

        // Remove app state listener
        appStateListener?.remove();

        // Reset states
        setScanState('ready');
        setIsCheckingNFC(false);
        setIsPageFocused(false);
        isPageFocusedRef.current = false;  // Reset ref immediately
        isLeavingPageRef.current = false;  // Reset leaving page flag

        // Clear all timeouts
        clearAllTimeouts();

        console.log('NFC cleanup completed');
      };
    }, [handleNFCStatusChange])
  );

  // Real-time monitoring effect (lighter polling as backup) - only when page is focused
  useEffect(() => {
    if (isNFCEnabled === false && isPageFocused) {
      setIsCheckingNFC(true);

      // Reduced polling frequency since we have listeners
      const interval = setInterval(() => {
        if (isPageFocused) {
          handleNFCStatusChange();
        }
      }, 5000); // Check every 5 seconds as backup

      return () => {
        clearInterval(interval);
        setIsCheckingNFC(false);
      };
    } else {
      setIsCheckingNFC(false);
    }
  }, [isNFCEnabled, isPageFocused, handleNFCStatusChange]);

  // Handle Android hardware back button
  useEffect(() => {
    const handleBackPress = () => {
      isLeavingPageRef.current = true;
      return false; // Let the default behavior handle navigation
    };

    if (Platform.OS === 'android') {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
      return () => backHandler.remove();
    }
  }, []);

  // Validate NDEF records for portal protocol
  const validatePortalProtocol = (ndefRecords: any[]): { isValid: boolean; portalUrl?: string } => {
    try {
      for (const record of ndefRecords) {
        if (record.tnf === Ndef.TNF_WELL_KNOWN && record.type) {
          // Check if it's a URI record
          const typeArray = new Uint8Array(record.type);
          const typeString = String.fromCharCode.apply(null, Array.from(typeArray));

          if (typeString === 'U') { // URI record type
            const payload = new Uint8Array(record.payload);
            const identifierCode = payload[0];

            // Decode the URI based on identifier code
            let uri = '';
            if (identifierCode === 0x00) {
              // No prepending - full URI in payload
              uri = String.fromCharCode.apply(null, Array.from(payload.slice(1)));
            } else {
              // Other identifier codes would need different handling
              uri = String.fromCharCode.apply(null, Array.from(payload.slice(1)));
            }

            console.log('Found URI record:', uri);

            // Check if URI starts with portal://
            if (uri.startsWith('portal://')) {
              return { isValid: true, portalUrl: uri };
            }
          }
        }

        // Also check for text records that might contain portal URLs
        if (record.tnf === Ndef.TNF_WELL_KNOWN && record.type) {
          const typeArray = new Uint8Array(record.type);
          const typeString = String.fromCharCode.apply(null, Array.from(typeArray));

          if (typeString === 'T') { // Text record type
            const payload = new Uint8Array(record.payload);
            const languageCodeLength = payload[0] & 0x3F;
            const text = String.fromCharCode.apply(null, Array.from(payload.slice(1 + languageCodeLength)));

            console.log('Found text record:', text);

            // Check if text contains portal:// URL
            if (text.includes('portal://')) {
              const match = text.match(/portal:\/\/[^\s]+/);
              if (match) {
                return { isValid: true, portalUrl: match[0] };
              }
            }
          }
        }
      }

      return { isValid: false };
    } catch (error) {
      console.error('Error validating NDEF records:', error);
      return { isValid: false };
    }
  };

  // NFC scanning using requestTechnology - Android manifest handles system chooser prevention
  const startScan = async () => {
    if (!isNFCEnabled || !isPageFocusedRef.current) {
      console.log('Skipping scan - NFC disabled or page not focused');
      return;
    }

    try {
      setScanState('scanning');
      startGlowAnimation();
      startScanLineAnimation();
      // Remove scanning toast to prevent loops

      // Start NFC tag reading
      await NfcManager.requestTechnology([NfcTech.Ndef]);

      // Read NFC tag
      const tag = await NfcManager.getTag();
      console.log('NFC Tag detected:', tag);

      if (!tag) {
        setScanState('error');
        stopGlowAnimation();
        stopScanLineAnimation();
        // Only show toast if page is focused
        if (isPageFocusedRef.current && !isLeavingPageRef.current) {
          showToast('Failed to read NFC tag', 'error');
        }
        await NfcManager.cancelTechnologyRequest();
        return;
      }

      // Get NDEF records from tag
      const ndefRecords = tag.ndefMessage || [];
      console.log('NDEF records:', ndefRecords);

      if (!ndefRecords || ndefRecords.length === 0) {
        setScanState('error');
        stopGlowAnimation();
        stopScanLineAnimation();
        // Only show toast if page is focused
        if (isPageFocusedRef.current && !isLeavingPageRef.current) {
          showToast('NFC tag has no readable data', 'error');
        }
        await NfcManager.cancelTechnologyRequest();
        return;
      }

      // Validate portal protocol
      const validation = validatePortalProtocol(ndefRecords);

      if (validation.isValid && validation.portalUrl) {
        setScanState('success');
        stopGlowAnimation();
        stopScanLineAnimation();
        // Only show toast if page is focused
        // if (isPageFocusedRef.current && !isLeavingPageRef.current) {
        //   showToast(`Portal URL found: ${validation.portalUrl}`, 'success');
        // }
        console.log('Valid portal URL detected:', validation.portalUrl);

        // Stop scanning
        await NfcManager.cancelTechnologyRequest();

        handleDeepLink(validation.portalUrl);

        // Navigate to homepage immediately so user sees the skeleton loader
        addTimeout(() => {
          router.replace('/(tabs)');
        }, 100);
      } else {
        setScanState('error');
        stopGlowAnimation();
        stopScanLineAnimation();
        // Only show toast if page is focused
        if (isPageFocusedRef.current && !isLeavingPageRef.current) {
          showToast('NFC tag does not contain a valid portal:// URL', 'error');
        }

        // Stop scanning
        await NfcManager.cancelTechnologyRequest();
      }

    } catch (error) {
      console.log('NFC scan error:', error);
      
      // Don't show error toast if we're intentionally leaving the page or page is not focused
      if (isLeavingPageRef.current || !isPageFocusedRef.current) {
        console.log('Scan cancelled due to page navigation or unfocus - skipping error toast');
        try {
          await NfcManager.cancelTechnologyRequest();
        } catch (e) {
          console.log('Error canceling NFC request:', e);
        }
        return;
      }

      setScanState('error');
      stopGlowAnimation();
      stopScanLineAnimation();

      // Provide more specific error messages
      const errorString = error instanceof Error ? error.message : String(error);
      const errorMessage = errorString.includes('cancelled')
        ? 'Scan was cancelled'
        : errorString.includes('timeout')
        ? 'Scan timed out - please try again'
        : 'NFC scan failed - please try again';

      showToast(errorMessage, 'error');

      // Stop scanning and reset state
      try {
        await NfcManager.cancelTechnologyRequest();
      } catch (e) {
        console.log('Error canceling NFC request:', e);
      }

      // Don't auto-retry - let user manually retry
    }
  };

  const getScanAreaColor = () => {
    if (isNFCEnabled === null) return borderPrimaryColor;
    if (!isNFCEnabled) return statusWarningColor;

    switch (scanState) {
      case 'scanning':
        return buttonPrimaryColor;
      case 'success':
        return statusConnectedColor;
      case 'error':
        return statusErrorColor;
      default:
        return buttonPrimaryColor;
    }
  };

  const getScanIcon = () => {
    if (isNFCEnabled === null) {
      return <ActivityIndicator size="large" color={borderPrimaryColor} />;
    }

    if (!isNFCEnabled) {
      return <Settings size={60} color={statusWarningColor} />;
    }

    switch (scanState) {
      case 'scanning':
        return (
          <Animated.View style={{ transform: [{ scale: glowAnimation }] }}>
            <Nfc size={60} color={buttonPrimaryColor} />
          </Animated.View>
        );
      case 'success':
        return <CheckCircle size={60} color={statusConnectedColor} />;
      case 'error':
        return <XCircle size={60} color={statusErrorColor} />;
      default:
        return <Nfc size={60} color={buttonPrimaryColor} />;
    }
  };

  const getActionButton = () => {
    if (isNFCEnabled === null) {
      return (
        <View style={[styles.actionButton, { backgroundColor: surfaceSecondaryColor }]}>
          <ActivityIndicator size="small" color={primaryTextColor} style={{ marginRight: 8 }} />
          <ThemedText style={[styles.actionButtonText, { color: primaryTextColor }]}>
            Checking NFC...
          </ThemedText>
        </View>
      );
    }

    if (!isNFCEnabled) {
      return (
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: buttonPrimaryColor }]}
          onPress={showNFCEnableDialog}
        >
          <Settings size={20} color={buttonPrimaryTextColor} style={{ marginRight: 8 }} />
          <ThemedText style={[styles.actionButtonText, { color: buttonPrimaryTextColor }]}>
            Open NFC Settings
          </ThemedText>
        </TouchableOpacity>
      );
    }

    // NFC is enabled - show retry button only when scan failed or errored
    if (scanState === 'error') {
      return (
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: buttonPrimaryColor }]}
          onPress={startScan}
        >
          <Nfc size={20} color={buttonPrimaryTextColor} style={{ marginRight: 8 }} />
          <ThemedText style={[styles.actionButtonText, { color: buttonPrimaryTextColor }]}>
            Retry Scan
          </ThemedText>
        </TouchableOpacity>
      );
    }

    // No button needed for scanning, success, or initial ready state
    return null;
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      {/* Header */}
      <ThemedView style={styles.header}>
        <TouchableOpacity onPress={() => {
          isLeavingPageRef.current = true;
          router.replace('/(tabs)');
        }} style={styles.backButton}>
          <ArrowLeft size={24} color={primaryTextColor} />
        </TouchableOpacity>
        <ThemedText style={[styles.headerText, { color: primaryTextColor }]}>
          NFC Scanner
        </ThemedText>
      </ThemedView>

      {/* Main Content */}
      <ThemedView style={styles.container}>
        {/* Status Card */}
        <ThemedView style={[styles.statusCard, { backgroundColor: cardBackgroundColor }]}>
          <ThemedText type="subtitle" style={[styles.statusTitle, { color: primaryTextColor }]}>
            {isNFCEnabled === null
              ? 'Checking NFC...'
              : isNFCEnabled
                ? scanState === 'scanning'
                  ? 'Scanning...'
                  : scanState === 'success'
                  ? 'Scan Successful'
                  : scanState === 'error'
                  ? 'Scan Failed'
                  : 'NFC Ready'
                : 'NFC Required'
            }
          </ThemedText>
          <ThemedText style={[styles.statusMessage, { color: secondaryTextColor }]}>
            {scanMessage}
          </ThemedText>
        </ThemedView>

        {/* Scan Area */}
        <View style={styles.scanContainer}>
          <View
            style={[
              styles.scanArea,
              {
                width: scanAreaSize,
                height: scanAreaSize,
                borderColor: getScanAreaColor(),
                backgroundColor: surfaceSecondaryColor,
              },
            ]}
          >
            {/* Corner Indicators */}
            <View style={[styles.corner, styles.topLeft, { borderColor: getScanAreaColor() }]} />
            <View style={[styles.corner, styles.topRight, { borderColor: getScanAreaColor() }]} />
            <View style={[styles.corner, styles.bottomLeft, { borderColor: getScanAreaColor() }]} />
            <View style={[styles.corner, styles.bottomRight, { borderColor: getScanAreaColor() }]} />

            {/* Scan Line Animation - only show during scanning */}
            {scanState === 'scanning' && isNFCEnabled && (
              <Animated.View
                style={[
                  styles.scanLine,
                  {
                    backgroundColor: getScanAreaColor(),
                    transform: [
                      {
                        translateX: scanLineAnimation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-scanAreaSize / 2 + 10, scanAreaSize / 2 - 10], // Move from left to right within bounds
                        }),
                      },
                    ],
                  },
                ]}
              />
            )}

            {/* Center Icon */}
            <View style={styles.centerIcon}>
              {getScanIcon()}
            </View>
          </View>
        </View>

        {/* Instructions */}
        <ThemedView style={[styles.instructionsCard, { backgroundColor: cardBackgroundColor }]}>
          <ThemedText type="defaultSemiBold" style={[styles.instructionsTitle, { color: primaryTextColor }]}>
            {isNFCEnabled
              ? scanState === 'error'
                ? 'Scan Failed - Try Again:'
                : 'How to Scan Portal NFC Tags:'
              : 'How to Enable NFC:'
            }
          </ThemedText>
          {isNFCEnabled ? (
            <>
              <ThemedText style={[styles.instructionItem, { color: secondaryTextColor }]}>
                • NFC scanning starts automatically once when enabled
              </ThemedText>
              <ThemedText style={[styles.instructionItem, { color: secondaryTextColor }]}>
                • Hold your device close to an NFC tag (within 4cm)
              </ThemedText>
              <ThemedText style={[styles.instructionItem, { color: secondaryTextColor }]}>
                • Keep the device steady until scan completes
              </ThemedText>
            </>
          ) : (
            <>
              <ThemedText style={[styles.instructionItem, { color: secondaryTextColor }]}>
                • Tap "Open NFC Settings" below to access device settings
              </ThemedText>
              <ThemedText style={[styles.instructionItem, { color: secondaryTextColor }]}>
                • Enable NFC in your device settings
              </ThemedText>
              <ThemedText style={[styles.instructionItem, { color: secondaryTextColor }]}>
                • Make sure NFC is turned on for contactless features
              </ThemedText>
            </>
          )}
        </ThemedView>

        {/* Action Button */}
        {getActionButton() && (
          <View style={styles.actionContainer}>
            {getActionButton()}
          </View>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
    padding: 16,
  },
  statusCard: {
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: 'center',
  },
  statusTitle: {
    marginBottom: 8,
    textAlign: 'center',
  },
  statusMessage: {
    textAlign: 'center',
    lineHeight: 22,
  },
  monitoringIndicator: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 12,
    fontStyle: 'italic',
  },
  scanContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  scanArea: {
    borderWidth: 3,
    borderRadius: 20,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderWidth: 3,
  },
  topLeft: {
    top: -3,
    left: -3,
    borderBottomWidth: 0,
    borderRightWidth: 0,
    borderTopLeftRadius: 20,
  },
  topRight: {
    top: -3,
    right: -3,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderTopRightRadius: 20,
  },
  bottomLeft: {
    bottom: -3,
    left: -3,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomLeftRadius: 20,
  },
  bottomRight: {
    bottom: -3,
    right: -3,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomRightRadius: 20,
  },
  centerIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionsCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  instructionsTitle: {
    marginBottom: 12,
  },
  instructionItem: {
    marginBottom: 6,
    lineHeight: 20,
  },
  actionContainer: {
    marginBottom: 16,
  },
  actionButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  scanLine: {
    position: 'absolute',
    width: 3,
    height: '100%',
    opacity: 0.8,
    shadowColor: '#000',
    shadowOffset: {
      width: 1,
      height: 0,
    },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
});
