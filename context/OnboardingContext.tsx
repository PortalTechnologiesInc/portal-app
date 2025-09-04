import type React from 'react';
import { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { registerContextReset, unregisterContextReset } from '@/services/ContextResetService';

const ONBOARDING_KEY = 'portal_onboarding_complete';
const FIRST_LAUNCH_KEY = 'portal_first_launch_completed';

type OnboardingContextType = {
  isOnboardingComplete: boolean;
  isLoading: boolean;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnboardingComplete, setIsOnboardingComplete] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);

  // Reset onboarding state to initial values
  // This is called during app reset to ensure clean state
  const resetOnboardingState = () => {
    console.log('🔄 Resetting Onboarding state...');

    // Reset local state to initial values (SecureStore is cleared by AppResetService)
    setIsOnboardingComplete(false);
    // Note: isLoading is not reset as it will be managed by data loading

    console.log('✅ Onboarding state reset completed');
  };

  // Register/unregister context reset function
  useEffect(() => {
    registerContextReset(resetOnboardingState);

    return () => {
      unregisterContextReset(resetOnboardingState);
    };
  }, []);

  // Load the value on mount
  useEffect(() => {
    const loadOnboardingState = async () => {
      try {
        const value = await SecureStore.getItemAsync(ONBOARDING_KEY);
        setIsOnboardingComplete(value === 'true');
      } catch (e) {
        console.error('Failed to load onboarding state:', e);
        // On error, assume onboarding not complete for safety
        setIsOnboardingComplete(false);
      } finally {
        setIsLoading(false);
      }
    };

    loadOnboardingState();
  }, []);

  const completeOnboarding = async () => {
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
      console.error('Failed to complete onboarding:', e);
      // Revert state on error
      setIsOnboardingComplete(false);
      throw e;
    }
  };

  const resetOnboarding = async () => {
    try {
      // Update local state first
      setIsOnboardingComplete(false);

      // Then update SecureStore
      await SecureStore.setItemAsync(ONBOARDING_KEY, 'false');

      // Navigate to onboarding
      router.replace('/onboarding');
    } catch (e) {
      console.error('Failed to reset onboarding:', e);
      throw e;
    }
  };

  return (
    <OnboardingContext.Provider
      value={{ isOnboardingComplete, isLoading, completeOnboarding, resetOnboarding }}
    >
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
