import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useRef,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { AppLockService, AuthMethod, LockTimerDuration, TIMER_OPTIONS } from '@/services/AppLockService';
import { authenticateAsync, isBiometricPromptInProgress } from '@/services/BiometricAuthService';

interface AppLockContextType {
  isLocked: boolean;
  isLockEnabled: boolean;
  lockTimerDuration: LockTimerDuration;
  authMethod: AuthMethod;
  hasPIN: boolean;
  isFingerprintSupported: boolean;
  isInitialized: boolean;
  timerOptions: typeof TIMER_OPTIONS;
  unlockApp: () => void;
  setLockEnabled: (enabled: boolean) => Promise<void>;
  setLockTimerDuration: (duration: LockTimerDuration) => Promise<void>;
  setAuthMethodPreference: (method: AuthMethod) => Promise<void>;
  setupPIN: (pin: string) => Promise<void>;
  clearPIN: () => Promise<void>;
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
  const [isFingerprintSupported, setIsFingerprintSupported] = useState(false);
  const [hasPIN, setHasPIN] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load app lock settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // First, check fingerprint support (this will check and store if not present)
        const fingerprintSupported = await AppLockService.getFingerprintSupported();
        setIsFingerprintSupported(fingerprintSupported);

        const enabled = await AppLockService.isAppLockEnabled();
        let duration = await AppLockService.getLockTimerDuration();
        if (enabled && duration === null) {
          await AppLockService.setLockTimerDuration(0);
          duration = 0;
        }
        let method = await AppLockService.getAuthMethod();

        // If enabled but no method set, determine based on fingerprint support
        if (enabled && !method) {
          method = fingerprintSupported ? 'biometric' : 'pin';
          await AppLockService.setAuthMethod(method);
        }

        setIsLockEnabled(enabled);
        setLockTimerDurationState(duration);
        setAuthMethodState(method);
        const pinExists = await AppLockService.hasPIN();
        setHasPIN(pinExists);

        // If enabled, lock immediately if PIN exists (user should authenticate on app load)
        // Otherwise, check timer-based locking
        if (enabled) {
          if (pinExists) {
            setIsLocked(true);
          } else {
            const shouldLock = await AppLockService.shouldLockApp();
            if (shouldLock) {
              setIsLocked(true);
            }
          }
        }
      } catch (error) {
        console.error('Error loading app lock settings:', error);
      }
    };

    loadSettings().finally(() => setIsInitialized(true));
  }, []);

  // AppState listener to handle background/foreground transitions and device lock
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (isBiometricPromptInProgress()) {
        return;
      }

      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // App going to background or device locked - record timestamp
        AppLockService.recordBackgroundTime();
      } else if (nextAppState === 'active') {
        // Refresh biometric capability when returning to foreground
        const fingerprintSupported = await AppLockService.refreshFingerprintSupport();
        setIsFingerprintSupported(fingerprintSupported);

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
      if (enabled) {
        // Determine auth method based on fresh fingerprint support check
        const fingerprintSupported = await AppLockService.refreshFingerprintSupport();
        setIsFingerprintSupported(fingerprintSupported);
        const existingMethod = await AppLockService.getAuthMethod();
        const fallbackMethod = 'pin';
        if (!existingMethod) {
          await AppLockService.setAuthMethod(fallbackMethod);
        }
        setAuthMethodState(existingMethod ?? fallbackMethod);
        const duration = await AppLockService.getLockTimerDuration();
        setLockTimerDurationState(duration);
        // Keep current session unlocked until the app backgrounds or restarts
        AppLockService.unlockApp();
        setIsLocked(false);
      } else {
        setIsLocked(false);
        const method = await AppLockService.getAuthMethod();
        setAuthMethodState(method);
        const pinExists = await AppLockService.hasPIN();
        setHasPIN(pinExists);
        const duration = await AppLockService.getLockTimerDuration();
        setLockTimerDurationState(duration);
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
      setHasPIN(true);
      if (!isFingerprintSupported || authMethod === null) {
        setAuthMethodState('pin');
      }
    } catch (error) {
      console.error('Error setting up PIN:', error);
      throw error;
    }
  }, [isFingerprintSupported, authMethod]);

  const clearPIN = useCallback(async () => {
    try {
      await AppLockService.clearPIN();
      setHasPIN(false);
      if (authMethod === 'pin') {
        await AppLockService.setAuthMethod(null);
        setAuthMethodState(null);
      }
    } catch (error) {
      console.error('Error clearing PIN:', error);
      throw error;
    }
  }, [authMethod]);

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

  const setAuthMethodPreference = useCallback(async (method: AuthMethod) => {
    try {
      await AppLockService.setAuthMethod(method);
      setAuthMethodState(method);
    } catch (error) {
      console.error('Error setting auth method preference:', error);
      throw error;
    }
  }, []);

  return (
    <AppLockContext.Provider
      value={{
        isLocked,
        isLockEnabled,
        lockTimerDuration,
        authMethod,
        hasPIN,
        isFingerprintSupported,
        isInitialized,
        timerOptions: TIMER_OPTIONS,
        unlockApp,
        setLockEnabled,
        setLockTimerDuration,
        setAuthMethodPreference,
        setupPIN,
        clearPIN,
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

export function useOnAppLock(callback: () => void) {
  const { isLocked } = useAppLock();
  const callbackRef = useRef(callback);
  const wasLockedRef = useRef(isLocked);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!wasLockedRef.current && isLocked) {
      callbackRef.current();
    }
    wasLockedRef.current = isLocked;
  }, [isLocked]);
}

