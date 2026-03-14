import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle, Nfc, Settings, XCircle } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import NfcManager, { NfcEvents } from 'react-native-nfc-manager';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import {
  type PassportData,
  passportNfcService,
  type ReadError,
} from '@/services/PassportNfcService';
import type { MrzData } from '@/utils/mrz';

/**
 * Standalone passport NFC scan screen for use outside the (onboarding) layout.
 * Navigated to from app/passport-scan/index.tsx after MRZ detection.
 */
export default function PassportNfcScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mrzData: string }>();
  const mrzData = params.mrzData ? (JSON.parse(params.mrzData) as MrzData) : null;

  const [isNFCEnabled, setIsNFCEnabled] = useState<boolean | null>(null);
  const [scanState, setScanState] = useState<'ready' | 'scanning' | 'success' | 'error'>('ready');
  const [errorType, setErrorType] = useState<string | null>(null);
  const [isPageFocused, setIsPageFocused] = useState(false);
  const isPageFocusedRef = useRef(false);
  const isLeavingPageRef = useRef(false);

  const [passportData, setPassportData] = useState<PassportData | null>(null);
  const [scanningActive, setScanningActive] = useState(false);
  const scanningActiveRef = useRef(false);

  const glowAnimation = useRef(new Animated.Value(1)).current;
  const scanLineAnimation = useRef(new Animated.Value(0)).current;

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

  const timeoutIds = useRef<number[]>([]);

  const addTimeout = useCallback((callback: () => void, delay: number) => {
    const timeoutId = setTimeout(() => {
      timeoutIds.current = timeoutIds.current.filter(id => id !== timeoutId);
      if (isPageFocusedRef.current) {
        callback();
      }
    }, delay) as unknown as number;
    timeoutIds.current.push(timeoutId);
    return timeoutId;
  }, []);

  const clearAllTimeouts = useCallback(() => {
    for (const id of timeoutIds.current) {
      clearTimeout(id);
    }
    timeoutIds.current = [];
  }, []);

  const startGlowAnimation = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnimation, { toValue: 1.3, duration: 1000, useNativeDriver: true }),
        Animated.timing(glowAnimation, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const stopGlowAnimation = useCallback(() => {
    glowAnimation.stopAnimation();
    Animated.timing(glowAnimation, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, []);

  const startScanLineAnimation = useCallback(() => {
    scanLineAnimation.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnimation, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(scanLineAnimation, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const stopScanLineAnimation = useCallback(() => {
    scanLineAnimation.stopAnimation();
    Animated.timing(scanLineAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  const checkNFCStatus = useCallback(async (): Promise<boolean> => {
    try {
      const isSupported = await NfcManager.isSupported();
      if (!isSupported) return false;
      return await NfcManager.isEnabled();
    } catch {
      return false;
    }
  }, []);

  const startScan = useCallback(async () => {
    if (!isNFCEnabled || !isPageFocusedRef.current || !mrzData) {
      return;
    }

    // Prevent concurrent NFC requests
    if (scanningActiveRef.current) {
      return;
    }

    try {
      scanningActiveRef.current = true;
      setScanningActive(true);
      setScanState('scanning');
      setErrorType(null);
      startGlowAnimation();
      startScanLineAnimation();

      const data = await passportNfcService.startReading(mrzData);
      setPassportData(data);

      setScanState('success');
      stopGlowAnimation();
      stopScanLineAnimation();
      scanningActiveRef.current = false;
      setScanningActive(false);

      // Log the data
      console.log('[PassportNFC] Passport data:', JSON.stringify(data, null, 2));

      // Navigate back to tabs after success (standalone flow, not onboarding)
      addTimeout(() => {
        router.replace('/(tabs)');
      }, 1500);
    } catch (error) {
      const err = error as ReadError;
      console.error('[PassportNFC] Error:', err);

      setScanState('error');
      setErrorType(err.code);
      stopGlowAnimation();
      stopScanLineAnimation();
      scanningActiveRef.current = false;
      setScanningActive(false);
    }
  }, [
    isNFCEnabled,
    mrzData,
    startGlowAnimation,
    startScanLineAnimation,
    stopGlowAnimation,
    stopScanLineAnimation,
    addTimeout,
    router,
  ]);

  // Keep a ref to the latest startScan so the mount effect can call it
  // without having startScan in its dependency array (which would cause re-runs).
  const startScanRef = useRef(startScan);
  useEffect(() => {
    startScanRef.current = startScan;
  }, [startScan]);

  useEffect(() => {
    const initializeNFC = async () => {
      try {
        await NfcManager.start();
        const enabled = await checkNFCStatus();
        setIsNFCEnabled(enabled);

        if (enabled) {
          addTimeout(() => {
            startScanRef.current();
          }, 500);
        }

        // Set up NFC state listener
        NfcManager.setEventListener(NfcEvents.StateChanged, async (event: { state: string }) => {
          const isEnabled = event.state === 'on' || event.state === 'turning_on';
          setIsNFCEnabled(isEnabled);
          if (isEnabled) {
            addTimeout(() => {
              startScanRef.current();
            }, 200);
          }
        });
      } catch (error) {
        console.error('[PassportNFC] Init error:', error);
        const enabled = await checkNFCStatus();
        setIsNFCEnabled(enabled);
      }
    };

    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        addTimeout(() => {
          checkNFCStatus().then(enabled => {
            if (enabled) {
              setIsNFCEnabled(enabled);
              addTimeout(() => {
                startScanRef.current();
              }, 500);
            }
          });
        }, 500);
      }
    };

    setIsPageFocused(true);
    isPageFocusedRef.current = true;
    isLeavingPageRef.current = false;

    initializeNFC();

    const appStateListener = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      isLeavingPageRef.current = true;
      if (scanningActiveRef.current) {
        NfcManager.cancelTechnologyRequest().catch(() => {});
        scanningActiveRef.current = false;
        setScanningActive(false);
      }
      stopGlowAnimation();
      NfcManager.setEventListener(NfcEvents.StateChanged, null);
      appStateListener.remove();
      setIsPageFocused(false);
      isPageFocusedRef.current = false;
      isLeavingPageRef.current = false;
      clearAllTimeouts();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getErrorMessage = (): string => {
    switch (errorType) {
      case 'TAG_NOT_FOUND':
        return 'No NFC tag detected. Hold your device close to the passport chip.';
      case 'BAC_AUTH_FAILED':
        return 'Authentication failed. Make sure the passport is valid and not damaged.';
      case 'SELECT_FAILED':
        return 'Could not communicate with passport chip. Try again.';
      case 'NFC_NOT_INITIALIZED':
        return 'NFC not available. Please check device settings.';
      default:
        return 'Scan failed. Please try again.';
    }
  };

  const scanMessage =
    isNFCEnabled === null
      ? 'Checking NFC status...'
      : isNFCEnabled
        ? scanState === 'scanning'
          ? 'Hold your device near the passport chip'
          : scanState === 'success'
            ? 'Passport data read successfully!'
            : getErrorMessage()
        : 'Please enable NFC to use this feature';

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

  const screenWidth = useMemo(() => {
    return Dimensions.get('window').width;
  }, []);

  const scanAreaSize = Math.max(200, Math.min(screenWidth * 0.7, 280, screenWidth - 40));

  if (!mrzData) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
        <ThemedView style={styles.container}>
          <ThemedText>Error: No MRZ data available</ThemedText>
          <TouchableOpacity onPress={() => router.back()}>
            <ThemedText>Go back</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      {/* Header */}
      <ThemedView style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            isLeavingPageRef.current = true;
            router.back();
          }}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={primaryTextColor} />
        </TouchableOpacity>
        <ThemedText style={[styles.headerText, { color: primaryTextColor }]}>
          Scan Passport Chip
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
                : 'NFC Required'}
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
            <View
              style={[styles.corner, styles.bottomRight, { borderColor: getScanAreaColor() }]}
            />

            {/* Scan Line Animation */}
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
                          outputRange: [-scanAreaSize / 2 + 10, scanAreaSize / 2 - 10],
                        }),
                      },
                    ],
                  },
                ]}
              />
            )}

            {/* Center Icon */}
            <View style={styles.centerIcon}>{getScanIcon()}</View>
          </View>
        </View>

        {/* Instructions */}
        <ThemedView style={[styles.instructionsCard, { backgroundColor: cardBackgroundColor }]}>
          <ThemedText
            type="defaultSemiBold"
            style={[styles.instructionsTitle, { color: primaryTextColor }]}
          >
            How to Scan Passport Chip:
          </ThemedText>
          <ThemedText style={[styles.instructionItem, { color: secondaryTextColor }]}>
            • Place the passport back side (chip side) against the back of your phone
          </ThemedText>
          <ThemedText style={[styles.instructionItem, { color: secondaryTextColor }]}>
            • Hold it steady for 5-10 seconds until scan completes
          </ThemedText>
          <ThemedText style={[styles.instructionItem, { color: secondaryTextColor }]}>
            • The chip is typically located in the center of the passport cover
          </ThemedText>
        </ThemedView>

        {/* Retry button — shown on error */}
        {scanState === 'error' && (
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: buttonPrimaryColor }]}
            onPress={() => {
              setScanState('ready');
              setErrorType(null);
              startScanRef.current();
            }}
          >
            <ThemedText style={[styles.retryButtonText, { color: buttonPrimaryTextColor }]}>
              Try Again
            </ThemedText>
          </TouchableOpacity>
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
    aspectRatio: 1,
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
  retryButton: {
    marginTop: 16,
    marginHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  scanLine: {
    position: 'absolute',
    width: 3,
    height: '100%',
    opacity: 0.8,
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
});
