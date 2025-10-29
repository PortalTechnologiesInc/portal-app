import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import {
  KeyHandshakeUrl,
  Mnemonic,
  Profile,
  PortalAppInterface,
  RelayStatusListener,
  KeypairInterface,
} from 'portal-app-lib';
import { PortalAppManager } from '@/services/PortalAppManager';
import type { RelayConnectionStatus, RelayInfo } from '@/utils/types';
import { registerContextReset, unregisterContextReset } from '@/services/ContextResetService';
import { useDatabaseContext } from '@/context/DatabaseContext';
import defaultRelayList from '../assets/DefaultRelays.json';
import { useOnboarding } from './OnboardingContext';

// Helper function to extract service name from profile (nip05 only)
const getServiceNameFromProfile = (profile: Profile | undefined): string | null => {
  return profile?.nip05 || null;
};

// Note: RelayConnectionStatus, RelayInfo, and ConnectionSummary are now imported from centralized types

// Map numeric RelayStatus values to string status names
// Based on the actual Rust enum from portal-app-lib:
// pub enum RelayStatus { Initialized, Pending, Connecting, Connected, Disconnected, Terminated, Banned }
function mapNumericStatusToString(numericStatus: number): RelayConnectionStatus {
  switch (numericStatus) {
    case 0:
      return 'Initialized';
    case 1:
      return 'Pending';
    case 2:
      return 'Connecting';
    case 3:
      return 'Connected';
    case 4:
      return 'Disconnected';
    case 5:
      return 'Terminated';
    case 6:
      return 'Banned';
    default:
      console.warn(`🔍 NostrService: Unknown numeric RelayStatus: ${numericStatus}`);
      return 'Unknown';
  }
}
// Note: WalletInfo and WalletInfoState are now imported from centralized types

// Context type definition
export interface NostrServiceContextType {
  isInitialized: boolean;
  publicKey: string | null;
  sendKeyHandshake: (url: KeyHandshakeUrl) => Promise<void>;
  getServiceName: (app: PortalAppInterface, publicKey: string) => Promise<string | null>;
  setUserProfile: (profile: Profile) => Promise<void>;
  submitNip05: (nip05: string) => Promise<void>;
  submitImage: (imageBase64: string) => Promise<void>;
  closeRecurringPayment: (pubkey: string, subscriptionId: string) => Promise<void>;
  allRelaysConnected: boolean;
  connectedCount: number;
  issueJWT: ((targetKey: string, expiresInHours: bigint) => string) | undefined;

  // Connection management functions
  startPeriodicMonitoring: () => void;
  stopPeriodicMonitoring: () => void;

  relayStatuses: RelayInfo[];

  // Removed relays tracking
  removedRelays: Set<string>;
  markRelayAsRemoved: (relayUrl: string) => void;
  clearRemovedRelay: (relayUrl: string) => void;
}

// Create context with default values
const NostrServiceContext = createContext<NostrServiceContextType | null>(null);

// Provider component
interface NostrServiceProviderProps {
  mnemonic: string;
  children: React.ReactNode;
}

export const NostrServiceProvider: React.FC<NostrServiceProviderProps> = ({
  mnemonic,
  children,
}) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [relayStatuses, setRelayStatuses] = useState<RelayInfo[]>([]);
  const [keypair, setKeypair] = useState<KeypairInterface | null>(null);
  const [reinitKey, setReinitKey] = useState(0);
  const [removedRelays, setRemovedRelays] = useState<Set<string>>(new Set());

  // Track last reconnection attempts to prevent spam
  const lastReconnectAttempts = useRef<Map<string, number>>(new Map());
  const allRelaysConnected = relayStatuses.length > 0 && relayStatuses.every(r => r.connected);
  const connectedCount = relayStatuses.filter(r => r.connected).length;

  // Refs to store current values for stable AppState listener
  const isAppActive = useRef(true);
  const relayStatusesRef = useRef<RelayInfo[]>([]);
  const removedRelaysRef = useRef<Set<string>>(new Set());

  const { executeOperation } = useDatabaseContext();
  const { isOnboardingComplete } = useOnboarding();

  // Reset all NostrService state to initial values
  // This is called during app reset to ensure clean state
  const resetNostrService = () => {
    console.log('🔄 Resetting NostrService state...');

    // Reset all state to initial values
    setIsInitialized(false);
    setPublicKey(null);
    setRelayStatuses([]);
    setKeypair(null);
    setReinitKey(k => k + 1);
    setRemovedRelays(new Set());

    // Clear reconnection attempts tracking
    lastReconnectAttempts.current.clear();

    console.log('✅ NostrService state reset completed');
  };

  // Stable AppState listener - runs only once, never recreated
  useEffect(() => {
    console.log('🔄 Setting up STABLE AppState listener (runs once)');

    const handleAppStateChange = async (nextAppState: string) => {
      const previousState = AppState.currentState;
      console.log('AppState changed to:', nextAppState);

      console.log(`App State Transition: ${previousState} → ${nextAppState}`);

      if (nextAppState === 'active') {
        console.log('📱 App became active');
        isAppActive.current = true;
      } else if (nextAppState === 'background') {
        isAppActive.current = false;
        console.log('App moved to background');
      }
    };

    // Subscribe to app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    registerContextReset(resetNostrService);

    return () => {
      unregisterContextReset(resetNostrService);

      console.log('🧹 Removing STABLE AppState listener (only on unmount)');
      subscription?.remove();
    };
  }, []);

  class LocalRelayStatusListener implements RelayStatusListener {
    onRelayStatusChange(relay_url: string, status: number): Promise<void> {
      return executeOperation(db => db.getRelays()).then(relays => {
        const statusString = mapNumericStatusToString(status);

        if (!relays.map(r => r.ws_uri).includes(relay_url)) {
          console.log(
            '📡😒 [STATUS UPDATE IGNORED] Relay:',
            relay_url,
            '→',
            statusString,
            `(${status})`
          );
          return;
        }

        console.log('📡 [STATUS UPDATE] Relay:', relay_url, '→', statusString, `(${status})`);

        setRelayStatuses(prev => {
          // Check if this relay has been marked as removed by user
          if (removedRelaysRef.current.has(relay_url)) {
            // Don't add removed relays back to the status list
            return prev.filter(relay => relay.url !== relay_url);
          }

          // Reset reconnection attempts tracker when relay connects successfully
          if (status === 3) {
            // Connected - clear both manual and auto reconnection attempts
            lastReconnectAttempts.current.delete(relay_url);
            lastReconnectAttempts.current.delete(`auto_${relay_url}`);
          }

          // Auto-reconnect logic for terminated/disconnected relays
          if (status === 5 || status === 4) {
            // Terminated or Disconnected
            const now = Date.now();
            const lastAutoAttempt = lastReconnectAttempts.current.get(`auto_${relay_url}`) || 0;
            const timeSinceLastAutoAttempt = now - lastAutoAttempt;

            // Only attempt auto-reconnection if more than 10 seconds have passed since last auto-attempt
            if (timeSinceLastAutoAttempt > 10000) {
              lastReconnectAttempts.current.set(`auto_${relay_url}`, now);

              // Use setTimeout to avoid blocking the status update
              setTimeout(async () => {
                try {
                  await PortalAppManager.tryGetInstance().reconnectRelay(relay_url);
                } catch (error) {
                  console.error('❌ Auto-reconnect failed for relay:', relay_url, error);
                }
              }, 2000);
            }
          }

          const index = prev.findIndex(relay => relay.url === relay_url);
          let newStatuses: RelayInfo[];

          // If relay is not in the list, add it
          if (index === -1) {
            newStatuses = [
              ...prev,
              { url: relay_url, status: statusString, connected: status === 3 },
            ];
          }
          // Otherwise, update the relay list
          else {
            newStatuses = [
              ...prev.slice(0, index),
              { url: relay_url, status: statusString, connected: status === 3 },
              ...prev.slice(index + 1),
            ];
          }

          return newStatuses;
        });

        return Promise.resolve();
      });
    }
  }

  // Initialize the NostrService
  useEffect(() => {
    const abortController = new AbortController();

    // Prevent re-initialization if already initialized
    if (isInitialized && PortalAppManager.tryGetInstance()) {
      console.log('NostrService already initialized, skipping re-initialization');
      return;
    }

    // Skip initialization if mnemonic is not available yet
    if (!mnemonic || mnemonic.trim() === '') {
      console.log('NostrService: Skipping initialization - no mnemonic available yet');
      return;
    }

    const initializeNostrService = async () => {
      try {
        console.log('Initializing NostrService with mnemonic');

        // Create Mnemonic object
        const mnemonicObj = new Mnemonic(mnemonic);
        const keypair = mnemonicObj.getKeypair();
        setKeypair(keypair);
        const publicKeyStr = keypair.publicKey().toString();

        // Set public key
        setPublicKey(publicKeyStr);

        // Create and initialize portal app
        let relays: string[] = [];

        try {
          // Try to get relays from database first
          const dbRelays = (await executeOperation(db => db.getRelays(), [])).map(
            relay => relay.ws_uri
          );
          if (dbRelays.length > 0) {
            relays = dbRelays;
          } else {
            // If no relays in database, use defaults and update database
            relays = [...defaultRelayList];
            await executeOperation(db => db.updateRelays(defaultRelayList), null);
          }
        } catch (error) {
          console.warn('Failed to get relays from database, using defaults:', error);
          // Fallback to default relays if database access fails
          relays = [...defaultRelayList];
          await executeOperation(db => db.updateRelays(defaultRelayList), null);
        }

        const app = await PortalAppManager.getInstance(
          keypair,
          relays,
          new LocalRelayStatusListener()
        );

        // Start listening and give it a moment to establish connections
        app.listen({ signal: abortController.signal });
        console.log('PortalApp listening started...');

        // Save portal app instance
        console.log('NostrService initialized successfully with public key:', publicKeyStr);
        console.log('Running on those relays:', relays);

        // Mark as initialized
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize NostrService:', error);
        setIsInitialized(false);
      }
    };

    initializeNostrService();

    // Cleanup function
    return () => {
      abortController.abort();
    };
  }, [mnemonic, reinitKey]);

  // Send auth init
  const sendKeyHandshake = useCallback(
    async (url: KeyHandshakeUrl): Promise<void> => {
      if (!isOnboardingComplete) {
        console.log('Cannot send handshake, onboarding is not complete');
        return;
      }
      // let's try for 30 times. One every .5 sec should timeout after 15 secs.
      let attempt = 0;
      while (
        !url.relays.some(urlRelay =>
          relayStatusesRef.current.some(r => r.url === urlRelay && r.status === 'Connected')
        ) ||
        !isAppActive.current
      ) {
        if (attempt > 30) {
          return;
        }
        console.log(
          `🤝 Try #${attempt}. Handshake request delayed. No relay connected or app not fully active!`
        );
        await new Promise(resolve => setTimeout(resolve, 500));
        attempt++;
      }

      console.log('Sending auth init', url);
      return PortalAppManager.tryGetInstance().sendKeyHandshake(url);
    },
    [isAppActive, isOnboardingComplete]
  );

  // Get service name with database caching
  const getServiceName = useCallback(
    async (app: PortalAppInterface, pubKey: string): Promise<string | null> => {
      try {
        // Step 1: Check for valid cached entry (not expired)
        const cachedName = await executeOperation(db => db.getCachedServiceName(pubKey), null);
        if (cachedName) {
          console.log('DEBUG: Using cached service name for:', pubKey, '->', cachedName);
          return cachedName;
        }

        // Step 2: Check relay connection status before attempting network fetch
        if (
          !relayStatusesRef.current.length ||
          relayStatusesRef.current.every(r => r.status != 'Connected')
        ) {
          console.warn('DEBUG: No relays connected, cannot fetch service profile for:', pubKey);
          throw new Error(
            'No relay connections available. Please check your internet connection and try again.'
          );
        }

        console.log('DEBUG: NostrService.getServiceName fetching from network for pubKey:', pubKey);
        console.log(
          'DEBUG: Connected relays:',
          connectedCount,
          '/',
          relayStatusesRef.current.length
        );

        // Step 3: Fetch from network
        const profile = await app.fetchProfile(pubKey);
        console.log('DEBUG: portalApp.fetchProfile returned:', profile);

        // Step 4: Extract service name from profile
        const serviceName = getServiceNameFromProfile(profile);

        if (serviceName) {
          // Step 5: Cache the result
          await executeOperation(db => db.setCachedServiceName(pubKey, serviceName), null);
          console.log('DEBUG: Cached new service name for:', pubKey, '->', serviceName);
          return serviceName;
        } else {
          console.log('DEBUG: No service name found in profile for:', pubKey);
          return null;
        }
      } catch (error) {
        console.error('DEBUG: getServiceName error for:', pubKey, error);
        throw error;
      }
    },
    [relayStatuses]
  );

  const setUserProfile = useCallback(async (profile: Profile) => {
    await PortalAppManager.tryGetInstance().setProfile(profile);
  }, []);

  const closeRecurringPayment = useCallback(async (pubkey: string, subscriptionId: string) => {
    await PortalAppManager.tryGetInstance().closeRecurringPayment(pubkey, subscriptionId);
  }, []);

  // Simple monitoring control functions (to be used by navigation-based polling)
  const startPeriodicMonitoring = useCallback(() => {
    console.warn('startPeriodicMonitoring is deprecated. Use navigation-based monitoring instead.');
  }, []);

  const stopPeriodicMonitoring = useCallback(() => {
    console.warn('stopPeriodicMonitoring is deprecated. Use navigation-based monitoring instead.');
  }, []);

  useEffect(() => {
    relayStatusesRef.current = relayStatuses;
  }, [relayStatuses]);

  useEffect(() => {
    removedRelaysRef.current = removedRelays;
  }, [removedRelays]);

  const submitNip05 = useCallback(async (nip05: string) => {
    await PortalAppManager.tryGetInstance().registerNip05(nip05);
  }, []);

  const submitImage = useCallback(async (imageBase64: string) => {
    await PortalAppManager.tryGetInstance().registerImg(imageBase64);
  }, []);

  // Removed relays management functions
  const markRelayAsRemoved = useCallback((relayUrl: string) => {
    // Update ref immediately for status listener
    removedRelaysRef.current.add(relayUrl);

    // Defer state updates to next tick to avoid setState during render
    setTimeout(() => {
      setRemovedRelays(prev => new Set([...prev, relayUrl]));
      // Also immediately remove it from relay statuses to avoid showing disconnected removed relays
      setRelayStatuses(prev => prev.filter(relay => relay.url !== relayUrl));
    }, 0);
  }, []);

  const clearRemovedRelay = useCallback((relayUrl: string) => {
    setRemovedRelays(prev => {
      const newSet = new Set(prev);
      newSet.delete(relayUrl);
      return newSet;
    });
  }, []);

  const issueJWT = (targetKey: string, expiresInHours: bigint) => {
    return keypair!.issueJwt(targetKey, expiresInHours);
  };

  /* useEffect(() => {
    class Logger implements LogCallback {
      log(entry: LogEntry) {
        const message = `[${entry.target}] ${entry.message}`;
        switch (entry.level) {
          case LogLevel.Trace:
            console.trace(message);
            break;
          case LogLevel.Debug:
            console.debug(message);
            break;
          case LogLevel.Info:
            console.info(message);
            break;
          case LogLevel.Warn:
            console.warn(message);
            break;
          case LogLevel.Error:
            console.error(message);
            break;
        }
      }
    }
    try {
      initLogger(new Logger(), LogLevel.Trace);
      console.log('Logger initialized');
    } catch (error) {
      console.error('Error initializing logger:', error);
    }
  }, []); */

  // Context value
  const contextValue: NostrServiceContextType = {
    isInitialized,
    publicKey,
    sendKeyHandshake,
    getServiceName,
    setUserProfile,
    closeRecurringPayment,
    startPeriodicMonitoring,
    stopPeriodicMonitoring,
    submitNip05,
    submitImage,
    relayStatuses,
    allRelaysConnected,
    connectedCount,
    issueJWT,
    removedRelays,
    markRelayAsRemoved,
    clearRemovedRelay,
  };

  return (
    <NostrServiceContext.Provider value={contextValue}>{children}</NostrServiceContext.Provider>
  );
};

// Hook to use the NostrService context
export const useNostrService = () => {
  const context = useContext(NostrServiceContext);
  if (!context) {
    throw new Error('useNostrService must be used within a NostrServiceProvider');
  }
  return context;
};

export default NostrServiceProvider;
