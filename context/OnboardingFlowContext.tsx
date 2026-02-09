import AsyncStorage from '@react-native-async-storage/async-storage';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { generateMnemonic } from 'portal-app-lib';
import { WALLET_TYPE } from '@/models/WalletType';
import { showToast } from '@/utils/Toast';
import { createVerificationChallenge, type VerificationChallenge } from '@/utils/onboarding';

// Key to track if seed was generated or imported (used by profile setup step)
export const SEED_ORIGIN_KEY = 'portal_seed_origin';

type OnboardingFlowContextType = {
  seedPhrase: string;
  setSeedPhrase: (value: string) => void;
  clearSeedPhrase: () => void;

  generateNewSeedPhrase: () => string;

  verificationChallenge: VerificationChallenge | null;
  createChallengeFromSeedPhrase: () => VerificationChallenge;
  clearVerificationChallenge: () => void;

  pinStep: 'enter' | 'confirm';
  setPinStep: (value: 'enter' | 'confirm') => void;
  enteredPin: string;
  setEnteredPin: (value: string) => void;
  pinError: string;
  setPinError: (value: string) => void;
  resetPinState: () => void;
};

const OnboardingFlowContext = createContext<OnboardingFlowContextType | null>(null);

export const OnboardingFlowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [seedPhrase, setSeedPhrase] = useState('');
  const [verificationChallenge, setVerificationChallenge] = useState<VerificationChallenge | null>(
    null
  );

  const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter');
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Check for app reset completion and show toast (used to live in legacy onboarding screen).
  useEffect(() => {
    const checkResetComplete = async () => {
      try {
        const resetFlag = await AsyncStorage.getItem('app_reset_complete');
        if (resetFlag === 'true') {
          setTimeout(() => {
            showToast('App reset successful!', 'success');
          }, 300);
          await AsyncStorage.removeItem('app_reset_complete');
        }
      } catch (_error) {}
    };

    checkResetComplete();
    const timeoutId = setTimeout(checkResetComplete, 200);
    return () => clearTimeout(timeoutId);
  }, []);

  // Set preferred wallet default (legacy behavior).
  useEffect(() => {
    const setPreferredWalletDefault = async () => {
      try {
        await AsyncStorage.setItem('preferred_wallet', JSON.stringify(WALLET_TYPE.BREEZ));
      } catch (_error) {}
    };
    setPreferredWalletDefault();
  }, []);

  const clearSeedPhrase = useCallback(() => {
    setSeedPhrase('');
  }, []);

  const generateNewSeedPhrase = useCallback(() => {
    const mnemonic = generateMnemonic().toString();
    setSeedPhrase(mnemonic);
    setVerificationChallenge(null);
    return mnemonic;
  }, []);

  const createChallengeFromSeedPhrase = useCallback(() => {
    const challenge = createVerificationChallenge(seedPhrase);
    setVerificationChallenge(challenge);
    return challenge;
  }, [seedPhrase]);

  const clearVerificationChallenge = useCallback(() => {
    setVerificationChallenge(null);
  }, []);

  const resetPinState = useCallback(() => {
    setPinStep('enter');
    setEnteredPin('');
    setPinError('');
  }, []);

  // Defensive: if seed phrase changes, the previous challenge is no longer valid.
  useEffect(() => {
    setVerificationChallenge(null);
  }, [seedPhrase]);

  const value = useMemo<OnboardingFlowContextType>(
    () => ({
      seedPhrase,
      setSeedPhrase,
      clearSeedPhrase,
      generateNewSeedPhrase,

      verificationChallenge,
      createChallengeFromSeedPhrase,
      clearVerificationChallenge,

      pinStep,
      setPinStep,
      enteredPin,
      setEnteredPin,
      pinError,
      setPinError,
      resetPinState,
    }),
    [
      seedPhrase,
      setSeedPhrase,
      clearSeedPhrase,
      generateNewSeedPhrase,
      verificationChallenge,
      createChallengeFromSeedPhrase,
      clearVerificationChallenge,
      pinStep,
      enteredPin,
      pinError,
      resetPinState,
    ]
  );

  return <OnboardingFlowContext.Provider value={value}>{children}</OnboardingFlowContext.Provider>;
};

export function useOnboardingFlow() {
  const context = useContext(OnboardingFlowContext);
  if (!context) {
    throw new Error('useOnboardingFlow must be used within an OnboardingFlowProvider');
  }
  return context;
}

