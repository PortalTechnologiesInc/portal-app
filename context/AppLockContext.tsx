import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  AppLockService,
  AuthMethod,
  LockTimerDuration,
  TIMER_OPTIONS,
} from '@/services/AppLockService';
import { authenticateAsync } from '@/services/BiometricAuthService';

interface AppLockContextType {
  isLocked: boolean;
  isLockEnabled: boolean;
  lockTimerDuration: LockTimerDuration;
  authMethod: AuthMethod;
  timerOptions: typeof TIMER_OPTIONS;
  unlockApp: () => void;
  setLockEnabled: (enabled: boolean) => Promise<void>;
  setLockTimerDuration: (duration: LockTimerDuration) => Promise<void>;
  setupPIN: (pin: string) => Promise<void>;
  verifyPIN: (pin: string) => Promise<boolean>;
  checkLockStatus: () => Promise<void>;
  isBiometricAvailable: () => Promise<boolean>;
}

const AppLockContext = createContext<AppLockContextType | undefined>(undefined);

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [isLocked, setIsLocked] = useState(false);
  const [isLockEnabled, setIsLockEnabled] = useState(false);
  const [lockTimerDuration, setLockTimerDurationState] = useState<LockTimerDuration>(null);
  const [authMethod, setAuthMethodState] = useState<AuthMethod>(null);

  // Load app lock settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const enabled = await AppLockService.isAppLockEnabled();
        const duration = await AppLockService.getLockTimerDuration();
        const method = await AppLockService.getAuthMethod();

        setIsLockEnabled(enabled);
        setLockTimerDurationState(duration);
        setAuthMethodState(method);

        // If enabled, check if we should lock immediately
        if (enabled) {
          const shouldLock = await AppLockService.shouldLockApp();
          if (shouldLock) {
            setIsLocked(true);
          }
        }
      } catch (error) {
        console.error('Error loading app lock settings:', error);
      }
    };

    loadSettings();
  }, []);

  // AppState listener to handle background/foreground transitions and device lock
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // App going to background or device locked - record timestamp
        AppLockService.recordBackgroundTime();
      } else if (nextAppState === 'active') {
        // App becoming active - check if we should lock
        if (isLockEnabled) {
          const shouldLock = await AppLockService.shouldLockApp();
          if (shouldLock) {
            setIsLocked(true);
          }
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, [isLockEnabled]);

  const unlockApp = useCallback(() => {
    AppLockService.unlockApp();
    setIsLocked(false);
  }, []);

  const setLockEnabled = useCallback(async (enabled: boolean) => {
    try {
      await AppLockService.setAppLockEnabled(enabled);
      setIsLockEnabled(enabled);
      if (!enabled) {
        setIsLocked(false);
        setAuthMethodState(null);
      }
    } catch (error) {
      console.error('Error setting app lock enabled:', error);
      throw error;
    }
  }, []);

  const setLockTimerDuration = useCallback(async (duration: LockTimerDuration) => {
    try {
      await AppLockService.setLockTimerDuration(duration);
      setLockTimerDurationState(duration);
    } catch (error) {
      console.error('Error setting lock timer duration:', error);
      throw error;
    }
  }, []);

  const setupPIN = useCallback(async (pin: string) => {
    try {
      await AppLockService.setupPIN(pin);
      setAuthMethodState('pin');
    } catch (error) {
      console.error('Error setting up PIN:', error);
      throw error;
    }
  }, []);

  const verifyPIN = useCallback(async (pin: string): Promise<boolean> => {
    try {
      return await AppLockService.verifyPIN(pin);
    } catch (error) {
      console.error('Error verifying PIN:', error);
      return false;
    }
  }, []);

  const checkLockStatus = useCallback(async () => {
    if (isLockEnabled) {
      const shouldLock = await AppLockService.shouldLockApp();
      if (shouldLock) {
        setIsLocked(true);
      }
    }
  }, [isLockEnabled]);

  const isBiometricAvailable = useCallback(async (): Promise<boolean> => {
    return await AppLockService.isBiometricAvailable();
  }, []);

  return (
    <AppLockContext.Provider
      value={{
        isLocked,
        isLockEnabled,
        lockTimerDuration,
        authMethod,
        timerOptions: TIMER_OPTIONS,
        unlockApp,
        setLockEnabled,
        setLockTimerDuration,
        setupPIN,
        verifyPIN,
        checkLockStatus,
        isBiometricAvailable,
      }}
    >
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  const context = useContext(AppLockContext);
  if (context === undefined) {
    throw new Error('useAppLock must be used within an AppLockProvider');
  }
  return context;
}

