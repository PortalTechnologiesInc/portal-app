import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import {
  AppLockService,
  type AuthMethod,
  type LockTimerDuration,
  TIMER_OPTIONS,
} from '@/services/AppLockService';
import { isBiometricPromptInProgress } from '@/services/BiometricAuthService';
import { isFilePickerActive } from '@/services/FilePickerService';

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
      } catch (_error) {}
    };

    loadSettings().finally(() => setIsInitialized(true));
  }, []);

  // AppState listener to handle background/foreground transitions and device lock
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background') {
        // Always record background time for actual background state, even if biometric prompt is in progress
        // This ensures the app locks correctly if FaceID fails while backgrounded
        AppLockService.recordBackgroundTime();
      } else if (nextAppState === 'inactive') {
        if (Platform.OS === 'android') {
          // Ignore Android inactive state (only background matters)
          return;
        }
        // For iOS inactive state: only record background time if biometric prompt is NOT in progress
        // and file picker is NOT active. When FaceID modal or image picker appears, app goes to
        // "inactive" but this is not real backgrounding. We should only record background time
        // for actual backgrounding, not system modals or file picker UI.
        if (!isBiometricPromptInProgress() && !isFilePickerActive()) {
          AppLockService.recordBackgroundTime();
        }
      } else if (nextAppState === 'active') {
        // Skip lock check if biometric prompt is in progress or file picker is active
        // to avoid race conditions and prevent locking while user is selecting images
        if (isBiometricPromptInProgress() || isFilePickerActive()) {
          return;
        }

        // Refresh biometric capability when returning to foreground
        const fingerprintSupported = await AppLockService.refreshFingerprintSupport();
        setIsFingerprintSupported(fingerprintSupported);

        // App becoming active - check if we should lock
        // The shouldLockApp() method requires at least MIN_BACKGROUND_DURATION_MS in background
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
  }, []);

  const setLockTimerDuration = useCallback(async (duration: LockTimerDuration) => {
    await AppLockService.setLockTimerDuration(duration);
    setLockTimerDurationState(duration);
  }, []);

  const setupPIN = useCallback(
    async (pin: string) => {
      await AppLockService.setupPIN(pin);
      setHasPIN(true);
      if (!isFingerprintSupported || authMethod === null) {
        setAuthMethodState('pin');
      }
    },
    [isFingerprintSupported, authMethod]
  );

  const clearPIN = useCallback(async () => {
    await AppLockService.clearPIN();
    setHasPIN(false);
    if (authMethod === 'pin') {
      await AppLockService.setAuthMethod(null);
      setAuthMethodState(null);
    }
  }, [authMethod]);

  const verifyPIN = useCallback(async (pin: string): Promise<boolean> => {
    try {
      return await AppLockService.verifyPIN(pin);
    } catch (_error) {
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
    await AppLockService.setAuthMethod(method);
    setAuthMethodState(method);
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
