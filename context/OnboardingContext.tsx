import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { registerContextReset, unregisterContextReset } from '@/services/ContextResetService';

const ONBOARDING_KEY = 'portal_onboarding_complete';
const FIRST_LAUNCH_KEY = 'portal_first_launch_completed';

type OnboardingContextType = {
  isOnboardingComplete: boolean;
  isLoading: boolean;
  completeOnboarding: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnboardingComplete, setIsOnboardingComplete] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);

  // Reset onboarding state to initial values
  // This is called during app reset to ensure clean state
  const resetOnboardingState = useCallback(() => {
    // Reset local state to initial values (SecureStore is cleared by AppResetService)
    setIsOnboardingComplete(false);
  }, []);

  // Register/unregister context reset function
  useEffect(() => {
    registerContextReset(resetOnboardingState);

    return () => {
      unregisterContextReset(resetOnboardingState);
    };
  }, [resetOnboardingState]);

  // Load the value on mount
  useEffect(() => {
    const loadOnboardingState = async () => {
      try {
        const value = await SecureStore.getItemAsync(ONBOARDING_KEY);
        setIsOnboardingComplete(value === 'true');
      } catch (_e) {
        // On error, assume onboarding not complete for safety
        setIsOnboardingComplete(false);
      } finally {
        setIsLoading(false);
      }
    };

    loadOnboardingState();
  }, []);

  const completeOnboarding = useCallback(async () => {
    try {
      // Update local state FIRST to prevent flash
      setIsOnboardingComplete(true);

      // Then update SecureStore
      await SecureStore.setItemAsync(ONBOARDING_KEY, 'true');

      // Reset first launch flag to ensure welcome card appears
      await SecureStore.deleteItemAsync(FIRST_LAUNCH_KEY);

      // Small delay to ensure state propagation
      await new Promise(resolve => setTimeout(resolve, 50));

      // Navigate to home
      router.replace('/');
    } catch (e) {
      // Revert state on error
      setIsOnboardingComplete(false);
      throw e;
    }
  }, []);

  return (
    <OnboardingContext.Provider value={{ isOnboardingComplete, isLoading, completeOnboarding }}>
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
};

export default OnboardingProvider;
