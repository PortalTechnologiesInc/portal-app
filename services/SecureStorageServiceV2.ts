import * as SecureStore from 'expo-secure-store';
import { SECURE_STORE_KEYS, getAllSecureStoreKeys } from './StorageRegistry';

// Type for mnemonic data
type MnemonicData = string | null;
// Type for wallet URL data
type WalletUrlData = string | null;
// Type for any event data
type EventData = MnemonicData | WalletUrlData;

// Create a simple event system using a class since we're in React Native
class EventEmitter {
  private listeners: Record<string, Array<(data: EventData) => void>> = {};

  addListener(event: string, callback: (data: EventData) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return {
      remove: () => {
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
      },
    };
  }

  emit(event: string, data: EventData) {
    if (this.listeners[event]) {
      for (const callback of this.listeners[event]) {
        callback(data);
      }
    }
  }
}

// Create event emitters to broadcast changes
export const mnemonicEvents = new EventEmitter();
export const walletUrlEvents = new EventEmitter();

/**
 * Enhanced SecureStorageService with comprehensive reset capabilities
 */
export class SecureStorageService {
  /**
   * Reset all secure storage data
   * This clears ALL SecureStore items used by the app
   */
  static async resetAll(): Promise<void> {
    const allKeys = getAllSecureStoreKeys();
    const errors: Array<{ key: string; error: any }> = [];

    for (const key of allKeys) {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch (error) {
        // Some keys might not exist, which is fine
        errors.push({ key, error });
      }
    }

    // Emit events for the critical keys that other components listen to
    mnemonicEvents.emit('mnemonicChanged', null);
    walletUrlEvents.emit('walletUrlChanged', null);
  }

  /**
   * Get a comprehensive status of all stored keys (for debugging)
   */
  static async getStorageStatus(): Promise<Record<string, boolean>> {
    const allKeys = getAllSecureStoreKeys();
    const status: Record<string, boolean> = {};

    for (const key of allKeys) {
      try {
        const value = await SecureStore.getItemAsync(key);
        status[key] = value !== null;
      } catch {
        status[key] = false;
      }
    }

    return status;
  }

  // ===== Legacy Methods (maintaining compatibility) =====

  /**
   * Save mnemonic phrase to secure storage
   */
  static async saveMnemonic(mnemonic: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.MNEMONIC, mnemonic);
      mnemonicEvents.emit('mnemonicChanged', mnemonic);
    } catch (error) {
      console.error('Failed to save mnemonic:', error);
      throw error;
    }
  }

  /**
   * Get mnemonic phrase from secure storage
   */
  static async getMnemonic(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(SECURE_STORE_KEYS.MNEMONIC);
    } catch (error) {
      console.error('Failed to get mnemonic:', error);
      throw error;
    }
  }

  /**
   * Delete mnemonic phrase from secure storage
   */
  static async deleteMnemonic(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.MNEMONIC);
      mnemonicEvents.emit('mnemonicChanged', null);
    } catch (error) {
      console.error('Failed to delete mnemonic:', error);
      throw error;
    }
  }

  /**
   * Save wallet URL to secure storage
   */
  static async saveWalletUrl(url: string): Promise<void> {
    try {
      if (url.trim()) {
        await SecureStore.setItemAsync(SECURE_STORE_KEYS.WALLET_URL, url);
      } else {
        await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.WALLET_URL);
      }
      walletUrlEvents.emit('walletUrlChanged', url.trim() || null);
    } catch (error) {
      console.error('Failed to save wallet URL:', error);
      throw error;
    }
  }

  /**
   * Get wallet URL from secure storage
   */
  static async getWalletUrl(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(SECURE_STORE_KEYS.WALLET_URL);
    } catch (error) {
      console.error('Failed to get wallet URL:', error);
      throw error;
    }
  }

  /**
   * Delete wallet URL from secure storage
   */
  static async deleteWalletUrl(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.WALLET_URL);
      walletUrlEvents.emit('walletUrlChanged', null);
    } catch (error) {
      console.error('Failed to delete wallet URL:', error);
      throw error;
    }
  }
}

// Export legacy functions for backward compatibility
export const saveMnemonic = SecureStorageService.saveMnemonic;
export const getMnemonic = SecureStorageService.getMnemonic;
export const deleteMnemonic = SecureStorageService.deleteMnemonic;
export const saveWalletUrl = SecureStorageService.saveWalletUrl;
export const getWalletUrl = SecureStorageService.getWalletUrl;
export const deleteWalletUrl = SecureStorageService.deleteWalletUrl;
