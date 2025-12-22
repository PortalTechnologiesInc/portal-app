import type {
  KeyHandshakeUrl,
  KeypairInterface,
  PortalAppInterface,
  Profile,
  RelayStatusListener,
} from 'portal-app-lib';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { registerContextReset, unregisterContextReset } from '@/services/ContextResetService';
import type { NwcService } from '@/services/NwcService';
import { PortalAppManager } from '@/services/PortalAppManager';
import { getKeypairFromKey, hasKey } from '@/utils/keyHelpers';
import { getServiceNameFromProfile, mapNumericStatusToString } from '@/utils/nostrHelper';
import type { PendingRequest, RelayInfo, WalletInfoState } from '@/utils/types';
import defaultRelayList from '../assets/DefaultRelays.json';
import { useOnboarding } from './OnboardingContext';

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
  issueJWT: ((targetKey: string, expiresInHours: bigint) => string | undefined) | undefined;
  fetchProfile: (publicKey: string) => Promise<{
    found: boolean;
    username?: string;
    displayName?: string;
    avatarUri?: string;
    npub: string;
  }>;

  // Connection management functions
  startPeriodicMonitoring: () => void;
  stopPeriodicMonitoring: () => void;

  relayStatuses: RelayInfo[];

  // Removed relays tracking
  removedRelays: Set<string>;
  markRelayAsRemoved: (relayUrl: string) => void;
  clearRemovedRelay: (relayUrl: string) => void;

  // Wallet-related properties (optional, may be provided by other contexts)
  walletInfo?: WalletInfoState;
  isWalletConnected?: boolean;
  pendingRequests?: { [key: string]: PendingRequest };
  nwcWallet?: NwcService;
}

// Create context with default values
const NostrServiceContext = createContext<NostrServiceContextType | null>(null);

// Provider component
interface NostrServiceProviderProps {
  mnemonic: string;
  nsec: string;
  children: React.ReactNode;
}

export const NostrServiceProvider: React.FC<NostrServiceProviderProps> = ({
  mnemonic,
  nsec,
  children,
}) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [relayStatuses, setRelayStatuses] = useState<RelayInfo[]>([]);
  const [keypair, setKeypair] = useState<KeypairInterface | null>(null);
  const [_reinitKey, setReinitKey] = useState(0);
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
  const resetNostrService = useCallback(() => {
    // Reset all state to initial values
    setIsInitialized(false);
    setPublicKey(null);
    setRelayStatuses([]);
    setKeypair(null);
    setReinitKey(k => k + 1);
    setRemovedRelays(new Set());

    // Clear reconnection attempts tracking
    lastReconnectAttempts.current.clear();
  }, []);

  // Stable AppState listener - runs only once, never recreated
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: string) => {
      if (nextAppState === 'active') {
        isAppActive.current = true;
      } else if (nextAppState === 'background') {
        isAppActive.current = false;
      }
    };

    // Subscribe to app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    registerContextReset(resetNostrService);

    return () => {
      unregisterContextReset(resetNostrService);
      subscription?.remove();
    };
  }, [resetNostrService]);

  class LocalRelayStatusListener implements RelayStatusListener {
    onRelayStatusChange(relay_url: string, status: number): Promise<void> {
      return executeOperation(db => db.getRelays()).then(relays => {
        const statusString = mapNumericStatusToString(status);

        if (!relays.map(r => r.ws_uri).includes(relay_url)) {
          return;
        }

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
                } catch (_error) {}
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
      return;
    }

    // Skip initialization if no key material is available (e.g., during onboarding)
    if (!hasKey({ mnemonic, nsec })) {
      return;
    }

    const initializeNostrService = async () => {
      try {
        // Create Mnemonic object
        const keypair = getKeypairFromKey({ mnemonic, nsec });
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
        } catch (_error) {
          // Fallback to default relays if database access fails
          relays = [...defaultRelayList];
          await executeOperation(db => db.updateRelays(defaultRelayList), null);
        }

        const app = await PortalAppManager.getInstance(
          keypair,
          relays,
          new LocalRelayStatusListener(),
          false
        );

        // Start listening and give it a moment to establish connections
        app.listen({ signal: abortController.signal });

        // Mark as initialized
        setIsInitialized(true);
        setPublicKey(publicKeyStr);
      } catch (_error) {
        setIsInitialized(false);
      }
    };

    initializeNostrService();

    // Cleanup function
    return () => {
      abortController.abort();
    };
  }, [mnemonic, nsec, executeOperation, isInitialized]);

  // Send auth init
  const sendKeyHandshake = useCallback(
    async (url: KeyHandshakeUrl): Promise<void> => {
      if (!isOnboardingComplete) {
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
        await new Promise(resolve => setTimeout(resolve, 500));
        attempt++;
      }
      return PortalAppManager.tryGetInstance().sendKeyHandshake(url);
    },
    [isOnboardingComplete]
  );

  // Get service name with database caching
  const getServiceName = useCallback(
    async (app: PortalAppInterface, pubKey: string): Promise<string | null> => {
      // Step 1: Check for valid cached entry (not expired)
      const cachedName = await executeOperation(db => db.getCachedServiceName(pubKey), null);
      if (cachedName) {
        return cachedName;
      }

      // Step 2: Check relay connection status before attempting network fetch
      if (
        !relayStatusesRef.current.length ||
        relayStatusesRef.current.every(r => r.status !== 'Connected')
      ) {
        throw new Error(
          'No relay connections available. Please check your internet connection and try again.'
        );
      }

      // Step 3: Fetch from network
      const profile = await app.fetchProfile(pubKey);

      // Step 4: Extract service name from profile
      const serviceName = getServiceNameFromProfile(profile);

      if (serviceName) {
        // Step 5: Cache the result
        await executeOperation(db => db.setCachedServiceName(pubKey, serviceName), null);
        return serviceName;
      } else {
        return null;
      }
    },
    [executeOperation]
  );

  const setUserProfile = useCallback(async (profile: Profile) => {
    await PortalAppManager.tryGetInstance().setProfile(profile);
  }, []);

  const closeRecurringPayment = useCallback(async (pubkey: string, subscriptionId: string) => {
    await PortalAppManager.tryGetInstance().closeRecurringPayment(pubkey, subscriptionId);
  }, []);

  // Simple monitoring control functions (to be used by navigation-based polling)
  const startPeriodicMonitoring = useCallback(() => {}, []);

  const stopPeriodicMonitoring = useCallback(() => {}, []);

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
    return keypair?.issueJwt(targetKey, expiresInHours);
  };

  const fetchProfile = useCallback(
    async (
      publicKey: string
    ): Promise<{
      found: boolean;
      username?: string;
      displayName?: string;
      avatarUri?: string;
      npub: string;
    }> => {
      // Fetch fresh profile data with timeout
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Profile fetch timeout')), 15000); // 15 second timeout
      });

      const fetchedProfile = await Promise.race([
        PortalAppManager.tryGetInstance().fetchProfile(publicKey),
        timeoutPromise,
      ]);

      if (fetchedProfile) {
        // Extract data from fetched profile with proper normalization
        let fetchedUsername = '';
        let fetchedDisplayName = '';

        // Try to get username from nip05 first (most reliable)
        if (fetchedProfile.nip05) {
          const nip05Parts = fetchedProfile.nip05.split('@');
          if (nip05Parts.length > 0 && nip05Parts[0]) {
            fetchedUsername = nip05Parts[0];
          }
        }

        // Fallback to name field if nip05 didn't work
        if (!fetchedUsername && fetchedProfile.name) {
          fetchedUsername = fetchedProfile.name;
        }

        // Fallback to displayName if nothing else worked
        if (!fetchedUsername && fetchedProfile.displayName) {
          fetchedUsername = fetchedProfile.displayName;
        }

        // Always normalize the username to match server behavior
        // The server trims and lowercases, so we should do the same
        if (fetchedUsername) {
          fetchedUsername = fetchedUsername.trim().toLowerCase().replace(/\s+/g, '');
        }

        // Extract display name (more flexible, keep as-is)
        if (fetchedProfile.displayName) {
          fetchedDisplayName = fetchedProfile.displayName || ''; // Allow empty string
        } else if (fetchedProfile.name && fetchedProfile.name !== fetchedUsername) {
          // Fallback to name if it's different from username
          fetchedDisplayName = fetchedProfile.name;
        } else {
          // Final fallback to username
          fetchedDisplayName = fetchedUsername;
        }

        const fetchedAvatarUri = fetchedProfile.picture || null; // Ensure null instead of empty string

        // Return the fetched data directly
        return {
          found: true,
          username: fetchedUsername || undefined,
          displayName: fetchedDisplayName || undefined,
          avatarUri: fetchedAvatarUri || undefined,
          npub: publicKey,
        };
      } else {
        return { found: false, npub: publicKey }; // No profile found
      }
    },
    []
  );

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
    fetchProfile,
    walletInfo: undefined,
    isWalletConnected: undefined,
    pendingRequests: undefined,
    nwcWallet: undefined,
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
