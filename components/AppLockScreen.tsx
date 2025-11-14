import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Modal, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { PINKeypad } from './PINKeypad';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useAppLock } from '@/context/AppLockContext';
import { authenticateAsync } from '@/services/BiometricAuthService';
import { Fingerprint, Shield } from 'lucide-react-native';

export function AppLockScreen() {
  const { isLocked, authMethod, unlockApp, verifyPIN, isFingerprintSupported } = useAppLock();
  const [pinError, setPinError] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const hasAutoTriggeredRef = React.useRef(false);

  const backgroundColor = useThemeColor({}, 'background');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');

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
    if (isAuthenticating) return;

    setIsAuthenticating(true);
    setPinError(false);

    try {
      const isValid = await verifyPIN(pin);
      if (isValid) {
        unlockApp();
        setPinError(false);
      } else {
        setPinError(true);
        // Clear error after a delay
        setTimeout(() => setPinError(false), 2000);
      }
    } catch (error) {
      console.error('PIN verification error:', error);
      setPinError(true);
    } finally {
      setIsAuthenticating(false);
    }
  };

  if (!isLocked) {
    return null;
  }

  // Determine UI based on fingerprint support
  const showBiometric = isFingerprintSupported && authMethod === 'biometric';
  const showPIN = !isFingerprintSupported || authMethod === 'pin';

  return (
    <Modal visible={isLocked} animationType="fade" transparent={false}>
      <SafeAreaView style={[styles.container, { backgroundColor }]} edges={['top', 'bottom']}>
        <View style={styles.content}>
          {/* Icon and Title */}
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: buttonPrimaryColor + '20' }]}>
              {showBiometric ? (
                <Fingerprint size={48} color={buttonPrimaryColor} />
              ) : (
                <Shield size={48} color={buttonPrimaryColor} />
              )}
            </View>
            <ThemedText style={[styles.title, { color: primaryTextColor }]}>
              App Locked
            </ThemedText>
            <ThemedText style={[styles.subtitle, { color: secondaryTextColor }]}>
              {showBiometric
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
                <ThemedText
                  style={[styles.biometricButtonText, { color: primaryTextColor }]}
                >
                  {isAuthenticating ? 'Authenticating...' : 'Unlock with Biometric'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}

          {/* PIN Keypad */}
          {showPIN && (
            <View style={styles.pinContainer}>
              {pinError && (
                <ThemedText style={[styles.errorText, { color: useThemeColor({}, 'buttonDanger') }]}>
                  Incorrect PIN. Please try again.
                </ThemedText>
              )}
              <PINKeypad
                onPINComplete={handlePINComplete}
                maxLength={5}
                showDots={true}
                error={pinError}
                onError={() => setPinError(false)}
              />
            </View>
          )}

          {/* Loading indicator */}
          {isAuthenticating && (
            <ThemedText style={[styles.loadingText, { color: secondaryTextColor }]}>
              Authenticating...
            </ThemedText>
          )}
        </View>
      </SafeAreaView>
    </Modal>
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
    fontSize: 28,
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
  },
  errorText: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 14,
    marginTop: 24,
    textAlign: 'center',
  },
});

