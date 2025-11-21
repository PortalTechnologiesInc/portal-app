import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SECURE_STORE_KEYS } from './StorageRegistry';
import { isBiometricAuthAvailable } from './BiometricAuthService';

const FINGERPRINT_SUPPORTED_KEY = 'isFingerprintSupported';
export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 8;

export type AuthMethod = 'biometric' | 'pin' | null;
export type LockTimerDuration = 0 | 30000 | 60000 | 300000 | 900000 | 1800000 | 3600000 | null;

// Timer duration options in milliseconds
export const TIMER_OPTIONS: Array<{ label: string; value: LockTimerDuration }> = [
  { label: 'Immediate', value: 0 },
  { label: '30 seconds', value: 30000 },
  { label: '1 minute', value: 60000 },
  { label: '5 minutes', value: 300000 },
  { label: '15 minutes', value: 900000 },
  { label: '30 minutes', value: 1800000 },
  { label: '1 hour', value: 3600000 },
];

// In-memory storage for background timestamp (not persisted)
let backgroundTimestamp: number | null = null;
let lastUnlockTimestamp: number | null = null;

/**
 * Simple hash function for PIN
 * Note: In production, this should use a proper crypto library like expo-crypto
 */
function hashPIN(pin: string): string {
  // Simple hash using built-in operations
  // For production, replace with expo-crypto or similar
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    const char = pin.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * App Lock Service
 * Manages app lock state, timer logic, and authentication methods
 */
export class AppLockService {
  /**
   * Check if app lock is enabled
   */
  static async isAppLockEnabled(): Promise<boolean> {
    try {
      const enabled = await SecureStore.getItemAsync(SECURE_STORE_KEYS.APP_LOCK_ENABLED);
      return enabled === 'true';
    } catch (error) {
      console.error('Error checking app lock enabled status:', error);
      return false;
    }
  }

  /**
   * Get configured timer duration in milliseconds
   */
  static async getLockTimerDuration(): Promise<LockTimerDuration> {
    try {
      const duration = await SecureStore.getItemAsync(SECURE_STORE_KEYS.APP_LOCK_TIMER_DURATION);
      if (duration === null) {
        return null;
      }
      const parsed = parseInt(duration, 10);
      return isNaN(parsed) ? null : (parsed as LockTimerDuration);
    } catch (error) {
      console.error('Error getting lock timer duration:', error);
      return null;
    }
  }

  /**
   * Get authentication method ('biometric' | 'pin' | null)
   */
  static async getAuthMethod(): Promise<AuthMethod> {
    try {
      const method = await SecureStore.getItemAsync(SECURE_STORE_KEYS.APP_LOCK_AUTH_METHOD);
      return (method as AuthMethod) || null;
    } catch (error) {
      console.error('Error getting auth method:', error);
      return null;
    }
  }

  /**
   * Set app lock enabled state
   */
  static async setAppLockEnabled(enabled: boolean): Promise<void> {
    try {
      if (enabled) {
        await SecureStore.setItemAsync(SECURE_STORE_KEYS.APP_LOCK_ENABLED, 'true');
        // Ensure a default lock timer is set (Immediate) so the app actually locks
        const existingTimer = await SecureStore.getItemAsync(
          SECURE_STORE_KEYS.APP_LOCK_TIMER_DURATION,
        );
        if (existingTimer === null) {
          await this.setLockTimerDuration(0);
        }
        // Don't mark as authenticated when enabling - let the app lock on next check
        // This ensures the lock actually works when first enabled
      } else {
        await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.APP_LOCK_ENABLED);
        // Retain auth method and PIN so global security preferences remain available
        this.resetSessionState();
      }
    } catch (error) {
      console.error('Error setting app lock enabled:', error);
      throw error;
    }
  }

  /**
   * Set lock timer duration
   */
  static async setLockTimerDuration(duration: LockTimerDuration): Promise<void> {
    try {
      if (duration === null) {
        await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.APP_LOCK_TIMER_DURATION);
      } else {
        await SecureStore.setItemAsync(
          SECURE_STORE_KEYS.APP_LOCK_TIMER_DURATION,
          duration.toString()
        );
      }
    } catch (error) {
      console.error('Error setting lock timer duration:', error);
      throw error;
    }
  }

  /**
   * Set authentication method
   */
  static async setAuthMethod(method: AuthMethod): Promise<void> {
    try {
      if (method === null) {
        await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.APP_LOCK_AUTH_METHOD);
      } else {
        await SecureStore.setItemAsync(SECURE_STORE_KEYS.APP_LOCK_AUTH_METHOD, method);
      }
    } catch (error) {
      console.error('Error setting auth method:', error);
      throw error;
    }
  }

  /**
   * Setup PIN for non-biometric devices
   */
  static async setupPIN(pin: string): Promise<void> {
    try {
      if (pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH) {
        throw new Error(
          `PIN must be between ${PIN_MIN_LENGTH} and ${PIN_MAX_LENGTH} digits`,
        );
      }
      const hashedPIN = hashPIN(pin);
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.APP_LOCK_PIN_HASH, hashedPIN);
    } catch (error) {
      console.error('Error setting up PIN:', error);
      throw error;
    }
  }

  /**
   * Verify entered PIN against stored hash
   */
  static async verifyPIN(pin: string): Promise<boolean> {
    try {
      const storedHash = await SecureStore.getItemAsync(SECURE_STORE_KEYS.APP_LOCK_PIN_HASH);
      if (!storedHash) {
        return false;
      }

      const enteredHash = hashPIN(pin);
      return storedHash === enteredHash;
    } catch (error) {
      console.error('Error verifying PIN:', error);
      return false;
    }
  }

  static async hasPIN(): Promise<boolean> {
    try {
      const storedHash = await SecureStore.getItemAsync(SECURE_STORE_KEYS.APP_LOCK_PIN_HASH);
      return !!storedHash;
    } catch (error) {
      console.error('Error checking PIN presence:', error);
      return false;
    }
  }

  static async clearPIN(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.APP_LOCK_PIN_HASH);
    } catch (error) {
      console.error('Error clearing PIN:', error);
      throw error;
    }
  }

  /**
   * Check if app should be locked based on background time
   */
  static async shouldLockApp(): Promise<boolean> {
    try {
      const isEnabled = await this.isAppLockEnabled();
      if (!isEnabled) {
        return false;
      }

      const timerDuration = await this.getLockTimerDuration();
      if (timerDuration === null) {
        // "Never" option - don't lock
        return false;
      }

      if (backgroundTimestamp === null) {
        // No background event recorded yet - lock only if we haven't authenticated this session
        return lastUnlockTimestamp === null;
      }

      if (lastUnlockTimestamp !== null && lastUnlockTimestamp >= backgroundTimestamp) {
        // We've authenticated after the last background event - no need to lock
        return false;
      }

      const timeSinceBackground = Date.now() - backgroundTimestamp;
      return timeSinceBackground >= timerDuration;
    } catch (error) {
      console.error('Error checking if app should lock:', error);
      // On error, err on the side of security - lock the app
      return true;
    }
  }

  /**
   * Record timestamp when app goes to background
   */
  static recordBackgroundTime(): void {
    backgroundTimestamp = Date.now();
    // Reset unlock timestamp when going to background so timer check applies on return
    lastUnlockTimestamp = null;
  }

  /**
   * Clear background timestamp (called after successful unlock)
   */
  static clearBackgroundTime(): void {
    backgroundTimestamp = null;
  }

  /**
   * Unlock app (clear lock state)
   */
  static unlockApp(): void {
    this.markSessionAuthenticated();
  }

  private static markSessionAuthenticated(): void {
    lastUnlockTimestamp = Date.now();
    this.clearBackgroundTime();
  }

  private static resetSessionState(): void {
    backgroundTimestamp = null;
    lastUnlockTimestamp = null;
  }

  /**
   * Check if biometric authentication is available
   */
  static async isBiometricAvailable(): Promise<boolean> {
    return await isBiometricAuthAvailable();
  }

  /**
   * Get fingerprint support status from storage or check and store it
   */
  static async getFingerprintSupported(): Promise<boolean> {
    try {
      const stored = await AsyncStorage.getItem(FINGERPRINT_SUPPORTED_KEY);
      if (stored !== null) {
        return stored === 'true';
      }

      // Key not present - check biometric support and store it
      const isSupported = await isBiometricAuthAvailable();
      await AsyncStorage.setItem(FINGERPRINT_SUPPORTED_KEY, isSupported ? 'true' : 'false');
      return isSupported;
    } catch (error) {
      console.error('Error getting fingerprint support status:', error);
      // On error, check directly and return
      return await isBiometricAuthAvailable();
    }
  }

  /**
   * Force-refresh fingerprint support status by re-checking the device
   */
  static async refreshFingerprintSupport(): Promise<boolean> {
    try {
      const isSupported = await isBiometricAuthAvailable();
      await AsyncStorage.setItem(FINGERPRINT_SUPPORTED_KEY, isSupported ? 'true' : 'false');
      return isSupported;
    } catch (error) {
      console.error('Error refreshing fingerprint support status:', error);
      return await isBiometricAuthAvailable();
    }
  }

  /**
   * Set fingerprint support status (for testing/manual override)
   */
  static async setFingerprintSupported(supported: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(FINGERPRINT_SUPPORTED_KEY, supported ? 'true' : 'false');
    } catch (error) {
      console.error('Error setting fingerprint support status:', error);
      throw error;
    }
  }
}

