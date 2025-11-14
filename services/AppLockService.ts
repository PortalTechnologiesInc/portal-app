import * as SecureStore from 'expo-secure-store';
import { SECURE_STORE_KEYS } from './StorageRegistry';
import { isBiometricAuthAvailable } from './BiometricAuthService';

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
      } else {
        await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.APP_LOCK_ENABLED);
        // Also clear auth method and PIN when disabling
        await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.APP_LOCK_AUTH_METHOD);
        await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.APP_LOCK_PIN_HASH);
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
      const hashedPIN = hashPIN(pin);
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.APP_LOCK_PIN_HASH, hashedPIN);
      await this.setAuthMethod('pin');
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
        // No background timestamp recorded - lock immediately
        return true;
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
    this.clearBackgroundTime();
  }

  /**
   * Check if biometric authentication is available
   */
  static async isBiometricAvailable(): Promise<boolean> {
    return await isBiometricAuthAvailable();
  }
}

