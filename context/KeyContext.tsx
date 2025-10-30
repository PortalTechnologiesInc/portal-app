import type React from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  getMnemonic as getSecureMnemonic,
  saveMnemonic as saveSecureMnemonic,
  deleteMnemonic as deleteSecureMnemonic,
  mnemonicEvents,
  getWalletUrl as getSecureWalletUrl,
  saveWalletUrl as saveSecureWalletUrl,
  walletUrlEvents,
} from '@/services/SecureStorageService';
import { generateMnemonic } from 'portal-app-lib';
import { registerContextReset, unregisterContextReset } from '@/services/ContextResetService';

type KeyContextType = {
  mnemonic: string | null;
  walletUrl: string | null;
  isLoading: boolean;
  isWalletConnected: boolean;
  setMnemonic: (mnemonic: string) => Promise<void>;
  clearMnemonic: () => Promise<void>;
  generateNewMnemonic: () => Promise<string>;
  setWalletUrl: (url: string) => Promise<void>;
  clearWalletUrl: () => Promise<void>;
  setWalletConnected: (connected: boolean) => Promise<void>;
  resetMnemonic: () => void; // Add reset method to clear all key state
};

const KeyContext = createContext<KeyContextType | null>(null);

export const KeyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mnemonic, setMnemonicState] = useState<string | null>(null);
  const [walletUrl, setWalletUrlState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWalletConnectedState, setIsWalletConnectedState] = useState(false);

  // Reset all key state to initial values
  // This is called during app reset to ensure clean state
  const resetMnemonic = () => {
    console.log('🔄 Resetting Key state...');

    // Reset local state to initial values
    setMnemonicState(null);
    setWalletUrlState(null);
    setIsWalletConnectedState(false);
    // Note: isLoading is not reset as it will be managed by data loading

    console.log('✅ Key state reset completed');
  };

  // Register/unregister context reset function
  useEffect(() => {
    registerContextReset(resetMnemonic);

    return () => {
      unregisterContextReset(resetMnemonic);
    };
  }, []);

  // Load the mnemonic and wallet URL from secure storage on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [savedMnemonic, savedWalletUrl] = await Promise.all([
          getSecureMnemonic(),
          getSecureWalletUrl(),
        ]);

        setMnemonicState(savedMnemonic);
        setWalletUrlState(savedWalletUrl || null);
      } catch (e) {
        console.error('Failed to load secure data:', e);
        // On error, set default values to prevent app from hanging
        setMnemonicState(null);
        setWalletUrlState(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Listen for wallet URL changes from SecureStorageService
  useEffect(() => {
    const walletUrlSubscription = walletUrlEvents.addListener('walletUrlChanged', async newUrl => {
      console.log('KeyContext: walletUrlChanged event received:', newUrl);
      setWalletUrlState(newUrl || null);
      setIsWalletConnectedState(Boolean(newUrl?.trim()));
    });

    return () => {
      walletUrlSubscription.remove();
    };
  }, []);

  // Set a new mnemonic or nsec
  const setMnemonic = useCallback(async (newMnemonic: string) => {
    try {
      // Check if this is actually a different key
      const currentMnemonic = await getSecureMnemonic();
      const isNewMnemonic = currentMnemonic !== newMnemonic;

      await saveSecureMnemonic(newMnemonic);

      // Only clear profile initialization flag if this is actually a new/different key
      if (isNewMnemonic) {
        try {
          await SecureStore.deleteItemAsync('profile_initialized');
          console.log('Cleared profile_initialized flag for new key');
        } catch (e) {
          // Silent fail - this is not critical
        }
      } else {
        console.log('Same key imported, keeping existing profile initialization state');
      }

      // Update state directly
      setMnemonicState(newMnemonic);

      // Still emit the event for other listeners in the app
      mnemonicEvents.emit('mnemonicChanged', newMnemonic);
    } catch (e) {
      console.error('Failed to save key:', e);
      throw e;
    }
  }, []);

  // Clear the mnemonic/nsec
  const clearMnemonic = useCallback(async () => {
    try {
      await deleteSecureMnemonic();

      // Update state directly
      setMnemonicState(null);

      // Still emit the event for other listeners in the app
      mnemonicEvents.emit('mnemonicChanged', null);
    } catch (e) {
      console.error('Failed to delete key:', e);
      throw e;
    }
  }, []);

  // Generate a new mnemonic
  const generateNewMnemonic = useCallback(async () => {
    try {
      // Generate a new mnemonic phrase
      const newMnemonic = generateMnemonic().toString();

      // Save it and update state
      await setMnemonic(newMnemonic);

      return newMnemonic;
    } catch (e) {
      console.error('Failed to generate new mnemonic:', e);
      throw e;
    }
  }, [setMnemonic]);

  // Set a wallet URL
  const setWalletUrl = useCallback(async (url: string) => {
    try {
      await saveSecureWalletUrl(url);

      // Update state directly
      setWalletUrlState(url);
      setIsWalletConnectedState(Boolean(url.trim()));

      // The event is already emitted by the saveSecureWalletUrl function
    } catch (e) {
      console.error('Failed to save wallet URL:', e);
      throw e;
    }
  }, []);

  // Clear the wallet URL
  const clearWalletUrl = useCallback(async () => {
    try {
      await saveSecureWalletUrl(''); // This will delete it in the SecureStorageService

      // Update state directly
      setWalletUrlState(null);
      setIsWalletConnectedState(false);

      // The event is already emitted by the saveSecureWalletUrl function
    } catch (e) {
      console.error('Failed to clear wallet URL:', e);
      throw e;
    }
  }, []);

  const setWalletConnected = useCallback(async (connected: boolean) => {
    setIsWalletConnectedState(connected);
  }, []);

  return (
    <KeyContext.Provider
      value={{
        mnemonic,
        walletUrl,
        isLoading,
        isWalletConnected: isWalletConnectedState,
        setMnemonic,
        clearMnemonic,
        generateNewMnemonic,
        setWalletUrl,
        clearWalletUrl,
        setWalletConnected,
        resetMnemonic,
      }}
    >
      {children}
    </KeyContext.Provider>
  );
};

export const useKey = () => {
  const context = useContext(KeyContext);
  if (!context) {
    throw new Error('useKey must be used within a KeyProvider');
  }
  return context;
};

export default KeyProvider;
