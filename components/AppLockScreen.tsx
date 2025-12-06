import React, { useEffect, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
  Keyboard,
  StyleSheet,
  View,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from './ThemedText';
import { PINKeypad } from './PINKeypad';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useAppLock } from '@/context/AppLockContext';
import { authenticateAsync } from '@/services/BiometricAuthService';
import { PIN_MIN_LENGTH, PIN_MAX_LENGTH } from '@/services/AppLockService';
import { Fingerprint } from 'lucide-react-native';

const CANCELABLE_BIOMETRIC_ERRORS = new Set(['user_cancel', 'system_cancel', 'app_cancel']);

export function AppLockScreen() {
  const {
    isLocked,
    authMethod,
    unlockApp,
    verifyPIN,
    isFingerprintSupported,
    hasPIN,
    isInitialized,
  } = useAppLock();
  const [pinError, setPinError] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isKeypadLocked, setIsKeypadLocked] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [biometricFailureCount, setBiometricFailureCount] = useState(0);
  const MAX_BIOMETRIC_ATTEMPTS = 1;
  const isBiometricLockedOut = biometricFailureCount >= MAX_BIOMETRIC_ATTEMPTS;
  const hasAutoTriggeredRef = React.useRef(false);
  const errorResetTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width, height } = useWindowDimensions();
  const rem = Math.min(Math.max(width / 390, 0.9), 1);
  const verticalRem = Math.min(Math.max(height / 844, 0.85), 1);
  const contentPadding = 32 * rem;
  const headerMargin = 28 * verticalRem;
  const buttonPaddingVertical = 32 * verticalRem;
  const buttonPaddingHorizontal = 24 * rem;
  const pinPaddingTop = 16 * verticalRem;
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        Keyboard.dismiss();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);


  const backgroundColor = useThemeColor({}, 'background');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const errorColor = useThemeColor({}, 'buttonDanger');

  const handleBiometricAuth = React.useCallback(async () => {
    if (isAuthenticating || isBiometricLockedOut) return;

    setIsAuthenticating(true);
    setBiometricError(null);
    try {
      const result = await authenticateAsync('Unlock Portal to continue');
      if (result.success) {
        unlockApp();
        setBiometricFailureCount(0);
        setPinError(false);
        setBiometricError(null);
      } else {
        if (result.code && CANCELABLE_BIOMETRIC_ERRORS.has(result.code)) {
          setBiometricError(result.error || 'Biometric authentication cancelled.');
        } else {
          setBiometricFailureCount(MAX_BIOMETRIC_ATTEMPTS);
          setBiometricError('Biometric attempts exceeded. Enter your PIN to continue.');
        }
      }
      // If user cancels, just reset authenticating state - don't retry
    } catch (error) {
      console.error('Biometric authentication error:', error);
      setBiometricFailureCount(MAX_BIOMETRIC_ATTEMPTS);
      setBiometricError('Biometric attempts exceeded. Enter your PIN to continue.');
    } finally {
      setIsAuthenticating(false);
    }
  }, [isAuthenticating, isBiometricLockedOut, unlockApp]);

  // Reset auto-trigger flag when unlocked
  useEffect(() => {
    if (!isLocked) {
      hasAutoTriggeredRef.current = false;
      setBiometricError(null);
      setIsKeypadLocked(false);
      setBiometricFailureCount(0);
    }
  }, [isLocked]);

  React.useEffect(() => {
    return () => {
      if (errorResetTimeoutRef.current) {
        clearTimeout(errorResetTimeoutRef.current);
        errorResetTimeoutRef.current = null;
      }
    };
  }, []);

  // Auto-trigger biometric authentication on first lock (only if fingerprint supported)
  useEffect(() => {
    if (
      isLocked &&
      isFingerprintSupported &&
      authMethod === 'biometric' &&
      !hasAutoTriggeredRef.current &&
      !isAuthenticating &&
      !isBiometricLockedOut
    ) {
      hasAutoTriggeredRef.current = true;
      // Small delay to ensure modal is fully rendered
      const timeoutId = setTimeout(() => {
        handleBiometricAuth();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [
    isLocked,
    authMethod,
    isAuthenticating,
    isFingerprintSupported,
    handleBiometricAuth,
    isBiometricLockedOut,
  ]);

  const handlePINComplete = async (pin: string) => {
    if (isAuthenticating || isKeypadLocked) return;

    setIsAuthenticating(true);
    setIsKeypadLocked(true);
    setPinError(false);

    try {
      const isValid = await verifyPIN(pin);
      if (isValid) {
        unlockApp();
        setPinError(false);
        setIsKeypadLocked(false);
      } else {
        setPinError(true);
        // Clear error after a delay
        if (errorResetTimeoutRef.current) {
          clearTimeout(errorResetTimeoutRef.current);
        }
        errorResetTimeoutRef.current = setTimeout(() => {
          setPinError(false);
          setIsKeypadLocked(false);
          errorResetTimeoutRef.current = null;
        }, 2000);
      }
    } catch (error) {
      console.error('PIN verification error:', error);
      setPinError(true);
      if (errorResetTimeoutRef.current) {
        clearTimeout(errorResetTimeoutRef.current);
      }
      errorResetTimeoutRef.current = setTimeout(() => {
        setPinError(false);
        setIsKeypadLocked(false);
        errorResetTimeoutRef.current = null;
      }, 2000);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const shouldTint = isLocked;

  // Don't show overlay during initialization or when not locked - let app render normally
  if (!isInitialized || !isLocked) {
    return null;
  }

  const renderContent = () => {
    const showBiometric =
      isFingerprintSupported && authMethod === 'biometric' && !isBiometricLockedOut;
    const showPIN = hasPIN || !isFingerprintSupported || authMethod === 'pin';

    return (
      <SafeAreaView style={[styles.container, { backgroundColor }]} edges={['top', 'bottom']}>
        <View style={[styles.content, { paddingHorizontal: contentPadding }]}>
          <View style={[styles.header, { marginBottom: headerMargin }]}>
            <ThemedText style={[styles.title, { color: primaryTextColor, fontSize: 24 * rem }]}>
              App Locked
            </ThemedText>
            <ThemedText style={[styles.subtitle, { color: secondaryTextColor, fontSize: 16 * rem }]}>
              {showBiometric && showPIN
                ? 'Use biometric or enter your PIN to unlock'
                : showBiometric
                  ? 'Use your fingerprint or face to unlock'
                  : showPIN
                    ? 'Enter your PIN to unlock'
                    : 'Authentication required'}
            </ThemedText>
          </View>

          {showBiometric && (
            <View style={styles.biometricContainer}>
              <TouchableOpacity
                style={[
                  styles.biometricButton,
                  {
                    backgroundColor: isAuthenticating ? secondaryTextColor : buttonPrimaryColor,
                    opacity: isAuthenticating ? 0.6 : 1,
                    paddingVertical: buttonPaddingVertical,
                    paddingHorizontal: buttonPaddingHorizontal,
                  },
                ]}
                onPress={handleBiometricAuth}
                activeOpacity={0.7}
                disabled={isAuthenticating}
              >
                <Fingerprint size={24} color={primaryTextColor} />
                <ThemedText
                  style={[
                    styles.biometricButtonText,
                    { color: primaryTextColor, fontSize: 16 * rem },
                  ]}
                >
                  {isAuthenticating ? 'Authenticating...' : 'Unlock with Biometric'}
                </ThemedText>
              </TouchableOpacity>
              {biometricError && (
                <ThemedText
                  style={[styles.biometricHint, styles.biometricHintOverlay, { color: errorColor }]}
                >
                  {biometricError}
                </ThemedText>
              )}
            </View>
          )}

          {showPIN && (
            <View style={[styles.pinContainer, { paddingTop: pinPaddingTop }]}>
              {pinError && (
                <View style={styles.errorWrapper} pointerEvents="none">
                  <ThemedText style={[styles.errorText, { color: errorColor, fontSize: 14 * rem }]}>
                    Incorrect PIN. Please try again.
                  </ThemedText>
                </View>
              )}
              <PINKeypad
                onPINComplete={handlePINComplete}
                minLength={PIN_MIN_LENGTH}
                maxLength={PIN_MAX_LENGTH}
                showDots={true}
                error={pinError}
                onError={() => setPinError(false)}
                disabled={isKeypadLocked || isAuthenticating}
              />
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  };

  return (
    <View
      style={styles.overlayContainer}
      pointerEvents="auto"
    >
      {shouldTint && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.tintOverlay]} />
      )}
      <View pointerEvents="box-none" style={styles.overlayContent}>
        {renderContent()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  overlayContent: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    zIndex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  biometricContainer: {
    width: '100%',
    maxWidth: 300,
    marginTop: 24,
    paddingBottom: 32,
    position: 'relative',
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 12,
  },
  biometricButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  biometricHint: {
    marginTop: 12,
    textAlign: 'center',
  },
  biometricHintOverlay: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
  },
  pinContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 32,
  },
  errorWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 14,
    marginTop: 24,
    textAlign: 'center',
  },
  tintOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
});

