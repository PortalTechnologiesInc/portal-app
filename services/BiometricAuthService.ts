import * as LocalAuthentication from 'expo-local-authentication';
import { Alert } from 'react-native';
import type { BiometricAuthResult } from '@/utils/types';

export type { BiometricAuthResult };

let biometricPromptDepth = 0;

const beginBiometricPrompt = () => {
  biometricPromptDepth += 1;
};

const endBiometricPrompt = () => {
  biometricPromptDepth = Math.max(0, biometricPromptDepth - 1);
};

export const isBiometricPromptInProgress = (): boolean => biometricPromptDepth > 0;

/**
 * Check if biometric authentication is available on the device
 */
export const isBiometricAuthAvailable = async (): Promise<boolean> => {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  } catch (error) {
    console.error('Error checking biometric availability:', error);
    return false;
  }
};

/**
 * Get available authentication types
 */
export const getAvailableAuthTypes = async (): Promise<
  LocalAuthentication.AuthenticationType[]
> => {
  try {
    return await LocalAuthentication.supportedAuthenticationTypesAsync();
  } catch (error) {
    console.error('Error getting auth types:', error);
    return [];
  }
};

/**
 * Authenticate user with biometric or device passcode
 */
export const authenticateAsync = async (
  reason: string = 'Please authenticate to continue'
): Promise<BiometricAuthResult> => {
  try {
    // Check if biometric auth is available
    const isAvailable = await isBiometricAuthAvailable();

    if (!isAvailable) {
      return {
        success: false,
        error: 'Biometric authentication is not available on this device',
      };
    }

    beginBiometricPrompt();
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      disableDeviceFallback: true,
    });

    if (result.success) {
      return { success: true };
    } else {
      const errorCode = result.error ?? 'unknown';
      let errorMessage = 'Authentication failed';
      if (errorCode === 'user_cancel' || errorCode === 'system_cancel' || errorCode === 'app_cancel') {
        errorMessage = 'Authentication was cancelled';
      }
      return {
        success: false,
        error: errorMessage,
        code: errorCode,
      };
    }
  } catch (error) {
    console.error('Biometric authentication error:', error);
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? 'unknown')
        : 'unknown';
    return {
      success: false,
      error: 'Authentication failed due to an error',
      code: errorCode,
    };
  } finally {
    endBiometricPrompt();
  }
};

/**
 * Wrapper function for sensitive actions that require authentication
 */
export const authenticateForSensitiveAction = async (
  action: () => Promise<void> | void,
  reason: string = 'Please authenticate to perform this action'
): Promise<void> => {
  try {
    const isAvailable = await isBiometricAuthAvailable();

    if (!isAvailable) {
      // If biometric auth is not available, show a warning and proceed
      Alert.alert(
        'Authentication Not Available',
        'Biometric authentication is not set up on this device. The action will proceed without authentication.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Continue',
            onPress: () => action(),
          },
        ]
      );
      return;
    }

    const authResult = await authenticateAsync(reason);

    if (authResult.success) {
      await action();
    } else {
      Alert.alert('Authentication Failed', authResult.error || 'Please try again', [
        { text: 'OK' },
      ]);
    }
  } catch (error) {
    console.error('Error in authenticateForSensitiveAction:', error);
    Alert.alert('Error', 'An error occurred during authentication');
  }
};
