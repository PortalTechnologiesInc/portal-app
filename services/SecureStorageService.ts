import * as SecureStore from 'expo-secure-store';

// Key constants
const MNEMONIC_KEY = 'portal_mnemonic';
const NSEC_KEY = 'portal_nsec';
const WALLET_URL_KEY = 'portal_wallet_url';

// Type for mnemonic data
type MnemonicData = string | null;
// Type for nsec data
type NsecData = string | null;
// Type for wallet URL data
type WalletUrlData = string | null;
// Type for any event data
type EventData = MnemonicData | NsecData | WalletUrlData;

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
 * Save mnemonic phrase to secure storage
 * @param mnemonic The mnemonic phrase to store
 * @returns Promise that resolves when the operation is complete
 */
export const saveMnemonic = async (mnemonic: string): Promise<void> => {
  try {
    await SecureStore.setItemAsync(MNEMONIC_KEY, mnemonic);
    // Emit an event when mnemonic is saved
    mnemonicEvents.emit('mnemonicChanged', mnemonic);
  } catch (error) {
    console.error('Failed to save mnemonic:', error);
    throw error;
  }
};

/**
 * Get mnemonic phrase from secure storage
 * @returns Promise that resolves with the mnemonic phrase or null if not found
 */
export const getMnemonic = async (): Promise<string | null> => {
  try {
    const mnemonic = await SecureStore.getItemAsync(MNEMONIC_KEY);
    return mnemonic;
  } catch (error) {
    console.error('Failed to get mnemonic:', error);
    throw error;
  }
};

/**
 * Delete mnemonic phrase from secure storage
 * @returns Promise that resolves when the operation is complete
 */
export const deleteMnemonic = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(MNEMONIC_KEY);
    // Emit an event when mnemonic is deleted
    mnemonicEvents.emit('mnemonicChanged', null);
  } catch (error) {
    console.error('Failed to delete mnemonic:', error);
    throw error;
  }
};

export const saveNsec = async (nsec: string): Promise<void> => {
  try {
    await SecureStore.setItemAsync(NSEC_KEY, nsec);
    // Emit an event when nsec is saved
    mnemonicEvents.emit('nsecChanged', nsec);
  } catch (error) {
    console.error('Failed to save nsec:', error);
    throw error;
  }
};

export const getNsec = async (): Promise<string | null> => {
  try {
    const nsec = await SecureStore.getItemAsync(NSEC_KEY);
    return nsec;
  } catch (error) {
    console.error('Failed to get nsec:', error);
    throw error;
  }
};

export const deleteNsec = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(NSEC_KEY);
    // Emit an event when nsec is deleted
    mnemonicEvents.emit('nsecChanged', null);
  } catch (error) {
    console.error('Failed to delete nsec:', error);
    throw error;
  }
};

/**
 * Save wallet URL to secure storage
 * @param url The wallet URL to store
 * @returns Promise that resolves when the operation is complete
 */
export const saveWalletUrl = async (url: string): Promise<void> => {
  try {
    if (url.trim()) {
      await SecureStore.setItemAsync(WALLET_URL_KEY, url);
    } else {
      await SecureStore.deleteItemAsync(WALLET_URL_KEY);
    }
    // Emit an event when wallet URL is saved or deleted
    walletUrlEvents.emit('walletUrlChanged', url);
  } catch (error) {
    console.error('Failed to save wallet URL:', error);
    throw error;
  }
};

/**
 * Get wallet URL from secure storage
 * @returns Promise that resolves with the wallet URL or empty string if not found
 */
export const getWalletUrl = async (): Promise<string> => {
  try {
    const walletUrl = await SecureStore.getItemAsync(WALLET_URL_KEY);
    return walletUrl || '';
  } catch (error) {
    console.error('Failed to get wallet URL:', error);
    throw error;
  }
};

/**
 * Check if wallet is connected (has a valid URL)
 * @returns Promise that resolves with boolean indicating if wallet is connected
 */
export const isWalletConnected = async (): Promise<boolean> => {
  try {
    const walletUrl = await getWalletUrl();
    return Boolean(walletUrl.trim());
  } catch (error) {
    console.error('Failed to check wallet connection:', error);
    return false;
  }
};
