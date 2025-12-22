import * as SecureStore from 'expo-secure-store';
import { generateMnemonic } from 'portal-app-lib';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { registerContextReset, unregisterContextReset } from '@/services/ContextResetService';
import {
  deleteMnemonic as deleteSecureMnemonic,
  deleteNsec as deleteSecureNsec,
  getMnemonic as getSecureMnemonic,
  getNsec as getSecureNsec,
  getWalletUrl as getSecureWalletUrl,
  mnemonicEvents,
  saveMnemonic as saveSecureMnemonic,
  saveNsec as saveSecureNsec,
  saveWalletUrl as saveSecureWalletUrl,
  walletUrlEvents,
} from '@/services/SecureStorageService';
import { validateKeyMaterial } from '@/utils/keyHelpers';

type KeyContextType = {
  mnemonic: string | null;
  nsec: string | null;
  walletUrl: string | null;
  isLoading: boolean;
  isWalletConnected: boolean;
  setMnemonic: (mnemonic: string) => Promise<void>;
  clearMnemonic: () => Promise<void>;
  generateNewMnemonic: () => Promise<string>;
  setNsec: (nsec: string) => Promise<void>;
  clearNsec: () => Promise<void>;
  setWalletUrl: (url: string) => Promise<void>;
  clearWalletUrl: () => Promise<void>;
  setWalletConnected: (connected: boolean) => Promise<void>;
  resetMnemonic: () => void; // Add reset method to clear all key state
};

const KeyContext = createContext<KeyContextType | null>(null);

export const KeyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mnemonic, setMnemonicState] = useState<string | null>(null);
  const [nsec, setNsecState] = useState<string | null>(null);
  const [walletUrl, setWalletUrlState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWalletConnectedState, setIsWalletConnectedState] = useState(false);

  // Reset all key state to initial values
  // This is called during app reset to ensure clean state
  const resetMnemonic = useCallback(() => {
    // Reset local state to initial values
    setMnemonicState(null);
    setNsecState(null);
    setWalletUrlState(null);
    setIsWalletConnectedState(false);
  }, []);

  // Register/unregister context reset function
  useEffect(() => {
    registerContextReset(resetMnemonic);

    return () => {
      unregisterContextReset(resetMnemonic);
    };
  }, [resetMnemonic]);

  // Load the mnemonic/nsec and wallet URL from secure storage on mount
  useEffect(() => {
    const loadData = async () => {
      // Load each value separately to handle missing keys gracefully
      let savedMnemonic: string | null = null;
      let savedNsec: string | null = null;
      let savedWalletUrl: string | null = null;

      // Load mnemonic - null is expected if key doesn't exist
      try {
        savedMnemonic = await getSecureMnemonic();
      } catch (_e) {
        // Only set to null if actual error occurred (not just missing key)
        savedMnemonic = null;
      }

      // Load nsec - null is expected if key doesn't exist
      try {
        savedNsec = await getSecureNsec();
      } catch (_e) {
        // Only set to null if actual error occurred (not just missing key)
        savedNsec = null;
      }

      // Load wallet URL - null is expected if key doesn't exist
      try {
        const walletUrl = await getSecureWalletUrl();
        savedWalletUrl = walletUrl || null;
      } catch (_e) {
        // Only set to null if actual error occurred (not just missing key)
        savedWalletUrl = null;
      }

      // Update state with loaded values (null is valid if keys don't exist)
      setMnemonicState(savedMnemonic);
      setNsecState(savedNsec);
      setWalletUrlState(savedWalletUrl);
      setIsLoading(false);
    };

    loadData();
  }, []);

  // Listen for wallet URL changes from SecureStorageService
  useEffect(() => {
    const walletUrlSubscription = walletUrlEvents.addListener('walletUrlChanged', async newUrl => {
      setWalletUrlState(newUrl || null);
      setIsWalletConnectedState(Boolean(newUrl?.trim()));
    });

    return () => {
      walletUrlSubscription.remove();
    };
  }, []);

  // Set a new mnemonic
  // Ensures mutual exclusivity by clearing nsec when mnemonic is set
  const setMnemonic = useCallback(async (newMnemonic: string) => {
    // Validate mnemonic format using helper
    const validation = validateKeyMaterial({ mnemonic: newMnemonic, nsec: null });
    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid mnemonic format');
    }

    // Check if this is actually a different key
    const currentMnemonic = await getSecureMnemonic();
    const isNewMnemonic = currentMnemonic !== newMnemonic;

    // Clear nsec to ensure mutual exclusivity
    const currentNsec = await getSecureNsec();
    if (currentNsec) {
      await deleteSecureNsec();
      setNsecState(null);
    }

    await saveSecureMnemonic(newMnemonic);

    // Only clear profile initialization flag if this is actually a new/different key
    if (isNewMnemonic) {
      try {
        await SecureStore.deleteItemAsync('profile_initialized');
      } catch {
        // Silent fail - this is not critical
      }
    } else {
    }

    // Update state directly
    setMnemonicState(newMnemonic);

    // Still emit the event for other listeners in the app
    mnemonicEvents.emit('mnemonicChanged', newMnemonic);
  }, []);

  // Clear the mnemonic
  const clearMnemonic = useCallback(async () => {
    await deleteSecureMnemonic();

    // Update state directly
    setMnemonicState(null);

    // Still emit the event for other listeners in the app
    mnemonicEvents.emit('mnemonicChanged', null);
  }, []);

  // Generate a new mnemonic
  const generateNewMnemonic = useCallback(async () => {
    // Generate a new mnemonic phrase
    const newMnemonic = generateMnemonic().toString();

    // Save it and update state
    await setMnemonic(newMnemonic);

    return newMnemonic;
  }, [setMnemonic]);

  // Set a new nsec
  // Ensures mutual exclusivity by clearing mnemonic when nsec is set
  const setNsec = useCallback(async (newNsec: string) => {
    // Validate nsec format using helper
    const validation = validateKeyMaterial({ mnemonic: null, nsec: newNsec });
    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid nsec format');
    }

    // Clear mnemonic to ensure mutual exclusivity
    const currentMnemonic = await getSecureMnemonic();
    if (currentMnemonic) {
      await deleteSecureMnemonic();
      setMnemonicState(null);
    }

    await saveSecureNsec(newNsec);

    // Clear profile initialization flag for new key
    try {
      await SecureStore.deleteItemAsync('profile_initialized');
    } catch (_e) {}

    setNsecState(newNsec);

    // Emit event for other listeners
    mnemonicEvents.emit('nsecChanged', newNsec);
  }, []);

  const clearNsec = useCallback(async () => {
    await deleteSecureNsec();
    setNsecState(null);
  }, []);

  // Set a wallet URL
  const setWalletUrl = useCallback(async (url: string) => {
    await saveSecureWalletUrl(url);

    // Update state directly
    setWalletUrlState(url);
    setIsWalletConnectedState(Boolean(url.trim()));
  }, []);

  // Clear the wallet URL
  const clearWalletUrl = useCallback(async () => {
    await saveSecureWalletUrl(''); // This will delete it in the SecureStorageService

    // Update state directly
    setWalletUrlState(null);
    setIsWalletConnectedState(false);
  }, []);

  const setWalletConnected = useCallback(async (connected: boolean) => {
    setIsWalletConnectedState(connected);
  }, []);

  return (
    <KeyContext.Provider
      value={{
        mnemonic,
        nsec,
        walletUrl,
        isLoading,
        isWalletConnected: isWalletConnectedState,
        setMnemonic,
        clearMnemonic,
        generateNewMnemonic,
        setNsec,
        clearNsec,
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
