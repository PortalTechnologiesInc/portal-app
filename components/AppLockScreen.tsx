import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Modal, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { PINKeypad } from './PINKeypad';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useAppLock } from '@/context/AppLockContext';
import { authenticateAsync } from '@/services/BiometricAuthService';
import { PIN_MIN_LENGTH, PIN_MAX_LENGTH } from '@/services/AppLockService';
import { Fingerprint, Shield } from 'lucide-react-native';

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
  const hasAutoTriggeredRef = React.useRef(false);
  const errorResetTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const backgroundColor = useThemeColor({}, 'background');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const errorColor = useThemeColor({}, 'buttonDanger');

  const handleBiometricAuth = React.useCallback(async () => {
    if (isAuthenticating) return;

    setIsAuthenticating(true);
    try {
      const result = await authenticateAsync('Unlock Portal to continue');
      if (result.success) {
        unlockApp();
        setPinError(false);
      }
      // If user cancels, just reset authenticating state - don't retry
    } catch (error) {
      console.error('Biometric authentication error:', error);
    } finally {
      setIsAuthenticating(false);
    }
  }, [isAuthenticating, unlockApp]);

  // Reset auto-trigger flag when unlocked
  useEffect(() => {
    if (!isLocked) {
      hasAutoTriggeredRef.current = false;
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
      !isAuthenticating
    ) {
      hasAutoTriggeredRef.current = true;
      // Small delay to ensure modal is fully rendered
      setTimeout(() => {
        handleBiometricAuth();
      }, 100);
    }
  }, [isLocked, authMethod, isAuthenticating, isFingerprintSupported, handleBiometricAuth]);

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

  const shouldTint = !isInitialized || isLocked;

  let modalContent: React.ReactNode = null;

  if (!isInitialized) {
    modalContent = (
      <Modal visible animationType="fade" transparent={false}>
        <SafeAreaView style={[styles.container, { backgroundColor }]} edges={['top', 'bottom']}>
          <View style={styles.content}>
            <ThemedText style={{ color: primaryTextColor }}>Preparing security...</ThemedText>
          </View>
        </SafeAreaView>
      </Modal>
    );
  } else if (isLocked) {
    // Determine UI based on fingerprint support
    const showBiometric = isFingerprintSupported && authMethod === 'biometric';
    const showPIN = hasPIN || !isFingerprintSupported || authMethod === 'pin';

    modalContent = (
      <Modal visible animationType="fade" transparent={false}>
        <SafeAreaView style={[styles.container, { backgroundColor }]} edges={['top', 'bottom']}>
          <View style={styles.content}>
            {/* Icon and Title */}
            <View style={styles.header}>
              {/* <View style={[styles.iconContainer, { backgroundColor: buttonPrimaryColor + '20' }]}>
                {showBiometric ? (
                  <Fingerprint size={48} color={buttonPrimaryColor} />
                ) : (
                  <Shield size={48} color={buttonPrimaryColor} />
                )}
              </View> */}
              <ThemedText style={[styles.title, { color: primaryTextColor }]}>App Locked</ThemedText>
              <ThemedText style={[styles.subtitle, { color: secondaryTextColor }]}>
                {showBiometric && showPIN
                  ? 'Use biometric or enter your PIN to unlock'
                  : showBiometric
                    ? 'Use your fingerprint or face to unlock'
                    : showPIN
                      ? 'Enter your PIN to unlock'
                      : 'Authentication required'}
              </ThemedText>
            </View>

            {/* Biometric Button - Always visible when biometric is available */}
            {showBiometric && (
              <View style={styles.biometricContainer}>
                <TouchableOpacity
                  style={[
                    styles.biometricButton,
                    {
                      backgroundColor: isAuthenticating ? secondaryTextColor : buttonPrimaryColor,
                      opacity: isAuthenticating ? 0.6 : 1,
                    },
                  ]}
                  onPress={handleBiometricAuth}
                  activeOpacity={0.7}
                  disabled={isAuthenticating}
                >
                  <Fingerprint size={24} color={primaryTextColor} />
                  <ThemedText style={[styles.biometricButtonText, { color: primaryTextColor }]}>
                    {isAuthenticating ? 'Authenticating...' : 'Unlock with Biometric'}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            )}

            {/* PIN Keypad */}
            {showPIN && (
              <View style={styles.pinContainer}>
                {pinError && (
                  <View style={styles.errorWrapper} pointerEvents="none">
                    <ThemedText style={[styles.errorText, { color: errorColor }]}>
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
      </Modal>
    );
  }

  if (!shouldTint && !modalContent) {
    return null;
  }

  return (
    <>
      {shouldTint && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.tintOverlay]} />
      )}
      {modalContent}
    </>
  );
}

const styles = StyleSheet.create({
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
    zIndex: 9999,
  },
});

