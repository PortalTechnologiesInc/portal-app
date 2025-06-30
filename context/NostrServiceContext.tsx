import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import {
  AuthChallengeEvent,
  KeyHandshakeUrl,
  Mnemonic,
  PaymentResponseContent,
  Profile,
  RecurringPaymentResponseContent,
  PortalApp,
  Nwc,
  AuthChallengeListener,
  PaymentRequestListener,
  SinglePaymentRequest,
  RecurringPaymentRequest,
  LookupInvoiceResponse,
  PortalAppInterface,
  AuthResponseStatus,
  CloseRecurringPaymentResponse,
  ClosedRecurringPaymentListener,
  initLogger,
  LogLevel,
  LogEntry,
  LogCallback,
} from 'portal-app-lib';
import { PendingRequest } from '@/models/PendingRequest';
import uuid from 'react-native-uuid';
import { DatabaseService } from '@/services/database';
import { useSQLiteContext } from 'expo-sqlite';

// Constants and helper classes from original NostrService
const DEFAULT_RELAYS = [
  'wss://relay.getportal.cc',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://offchain.pub',
];

// Helper function to extract service name from profile (nip05 only)
const getServiceNameFromProfile = (profile: any): string | null => {
  return profile?.nip05 || null;
};

// Types for connection management
export type RelayConnectionStatus =
  | 'Connected'
  | 'Connecting'
  | 'Pending'
  | 'Initialized'
  | 'Disconnected'
  | 'Terminated'
  | 'Banned'
  | 'Unknown';

export interface RelayInfo {
  url: string;
  status: RelayConnectionStatus;
  connected: boolean;
}

export interface ConnectionSummary {
  allRelaysConnected: boolean;
  connectedCount: number;
  totalCount: number;
  relays: RelayInfo[];
}

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

export class LocalAuthChallengeListener implements AuthChallengeListener {
  private callback: (event: AuthChallengeEvent) => Promise<AuthResponseStatus>;

  constructor(callback: (event: AuthChallengeEvent) => Promise<AuthResponseStatus>) {
    this.callback = callback;
  }

  onAuthChallenge(event: AuthChallengeEvent): Promise<AuthResponseStatus> {
    return this.callback(event);
  }
}

export class LocalPaymentRequestListener implements PaymentRequestListener {
  private singleCb: (event: SinglePaymentRequest) => Promise<PaymentResponseContent>;
  private recurringCb: (event: RecurringPaymentRequest) => Promise<RecurringPaymentResponseContent>;

  constructor(
    singleCb: (event: SinglePaymentRequest) => Promise<PaymentResponseContent>,
    recurringCb: (event: RecurringPaymentRequest) => Promise<RecurringPaymentResponseContent>
  ) {
    this.singleCb = singleCb;
    this.recurringCb = recurringCb;
  }

  onSinglePaymentRequest(event: SinglePaymentRequest): Promise<PaymentResponseContent> {
    return this.singleCb(event);
  }

  onRecurringPaymentRequest(
    event: RecurringPaymentRequest
  ): Promise<RecurringPaymentResponseContent> {
    return this.recurringCb(event);
  }
}

// Wallet Info types for getinfo data
export interface WalletInfo {
  alias?: string;
  get_balance?: number;
}

export interface WalletInfoState {
  data: WalletInfo | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

// Context type definition
interface NostrServiceContextType {
  isInitialized: boolean;
  isWalletConnected: boolean;
  publicKey: string | null;
  portalApp: PortalAppInterface | null;
  nwcWallet: Nwc | null;
  pendingRequests: { [key: string]: PendingRequest };
  payInvoice: (invoice: string) => Promise<string>;
  lookupInvoice: (invoice: string) => Promise<LookupInvoiceResponse>;
  disconnectWallet: () => void;
  sendKeyHandshake: (url: KeyHandshakeUrl) => Promise<void>;
  getServiceName: (publicKey: string) => Promise<string | null>;
  dismissPendingRequest: (id: string) => void;
  setUserProfile: (profile: Profile) => Promise<void>;
  submitNip05: (nip05: string) => Promise<void>;
  submitImage: (imageBase64: string) => Promise<void>;
  closeRecurringPayment: (pubkey: string, subscriptionId: string) => Promise<void>;

  // Connection management functions
  getConnectionSummary: () => ConnectionSummary;
  refreshConnectionStatus: () => Promise<void>;
  forceReconnect: () => Promise<void>;
  startPeriodicMonitoring: () => void;
  stopPeriodicMonitoring: () => void;
  connectionStatus: any; // Keep for backwards compatibility, but prefer getConnectionSummary

  // NWC wallet connection monitoring
  nwcConnectionStatus: boolean | null;
  nwcConnectionError: string | null;
  refreshNwcConnectionStatus: () => Promise<void>;

  // Wallet info from getinfo method
  walletInfo: WalletInfoState;
  refreshWalletInfo: () => Promise<void>;
  getWalletInfo: () => Promise<WalletInfo | null>;
}

// Create context with default values
const NostrServiceContext = createContext<NostrServiceContextType | null>(null);

// Provider component
interface NostrServiceProviderProps {
  mnemonic: string;
  walletUrl: string | null;
  children: React.ReactNode;
}

// Pure function for status interpretation - better testability and reusability
const interpretNwcStatus = (status: any): boolean => {
  if (status === null || status === undefined) {
    return false;
  }

  // If status is a Map and has entries, consider it connected
  if (status instanceof Map) {
    return status.size > 0;
  }
  // If status is a boolean
  else if (typeof status === 'boolean') {
    return status;
  }
  // If status is a number, consider >=0 as connected (permissive approach)
  else if (typeof status === 'number') {
    return status >= 0;
  }
  // If status is a string, be more permissive
  else if (typeof status === 'string') {
    const statusStr = status.toLowerCase();
    return (
      !statusStr.includes('disconnected') &&
      !statusStr.includes('error') &&
      !statusStr.includes('failed')
    );
  }
  // If status is an object, check for explicit failure indicators
  else if (typeof status === 'object') {
    const hasExplicitFailure =
      (status as any).connected === false ||
      (status as any).success === false ||
      (status as any).status === 'disconnected' ||
      (status as any).error;
    return !hasExplicitFailure;
  }
  // Default: if we get any response without timeout, consider it connected
  return true;
};

// Pure function for error categorization - better maintainability
const categorizeNwcError = (error: unknown): string => {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (errorMessage.includes('timeout')) {
    return 'Connection timeout - wallet may be unreachable';
  } else if (errorMessage.includes('network')) {
    return 'Network error - check your connection';
  } else if (errorMessage.includes('connection')) {
    return 'Unable to connect to wallet service';
  }
  return 'Connection failed';
};

// Optimized timeout wrapper with proper cleanup
const createTimeoutPromise = (
  timeoutMs: number
): { promise: Promise<never>; cleanup: () => void } => {
  let timeoutId: number;

  const promise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Connection timeout')), timeoutMs);
  });

  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };

  return { promise, cleanup };
};

export const NostrServiceProvider: React.FC<NostrServiceProviderProps> = ({
  mnemonic,
  walletUrl,
  children,
}) => {
  const [portalApp, setPortalApp] = useState<PortalAppInterface | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<{ [key: string]: PendingRequest }>({});
  const [nwcWallet, setNwcWallet] = useState<Nwc | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<any>(null);
  const [nwcConnectionStatus, setNwcConnectionStatus] = useState<boolean | null>(null);
  const [nwcConnectionError, setNwcConnectionError] = useState<string | null>(null);
  const [nwcTimeoutUntil, setNwcTimeoutUntil] = useState<number | null>(null);
  const [nwcCheckInProgress, setNwcCheckInProgress] = useState(false);
  const [lastNwcCheck, setLastNwcCheck] = useState<number>(0);
  const [appIsActive, setAppIsActive] = useState(true);
  const [walletInfo, setWalletInfo] = useState<WalletInfoState>({
    data: null,
    isLoading: false,
    error: null,
    lastUpdated: null,
  });

  // Refs to store current values for stable AppState listener
  const portalAppRef = useRef<PortalAppInterface | null>(null);
  const refreshConnectionStatusRef = useRef<(() => Promise<void>) | null>(null);
  const refreshNwcConnectionStatusRef = useRef<(() => Promise<void>) | null>(null);

  const sqliteContext = useSQLiteContext();
  const DB = new DatabaseService(sqliteContext);

  // Initialize the NostrService
  useEffect(() => {
    const abortController = new AbortController();

    if (!mnemonic) {
      console.log('No mnemonic provided, initialization skipped');
      return;
    }

    // Only initialize when app is active
    if (!appIsActive) {
      console.log('App not active, skipping initialization');
      return;
    }

    const initializeNostrService = async () => {
      try {
        console.log('Initializing NostrService with mnemonic');

        // Create Mnemonic object
        const mnemonicObj = new Mnemonic(mnemonic);
        const keypair = mnemonicObj.getKeypair();
        const publicKeyStr = keypair.publicKey().toString();

        // Set public key
        setPublicKey(publicKeyStr);

        // Create and initialize portal app

        let relays = (await DB.getRelays()).map(relay => relay.ws_uri);
        if (relays.length === 0) {
          DEFAULT_RELAYS.forEach(relay => relays.push(relay));
          await DB.updateRelays(DEFAULT_RELAYS);
        }
        const app = await PortalApp.create(keypair, relays);

        // Start listening and give it a moment to establish connections
        app.listen({ signal: abortController.signal });
        console.log('PortalApp listening started...');

        app
          .listenForAuthChallenge(
            new LocalAuthChallengeListener((event: AuthChallengeEvent) => {
              const id = event.eventId;

              console.log(`Auth challenge with id ${id} received`, event);

              return new Promise<AuthResponseStatus>(resolve => {
                setPendingRequests(prev => {
                  const newPendingRequests = { ...prev };

                  if (prev[id]) {
                    return prev
                  }
                  
                  newPendingRequests[id] = {
                    id,
                    metadata: event,
                    timestamp: new Date(),
                    type: 'login',
                    result: resolve as (
                      value:
                        | AuthResponseStatus
                        | PaymentResponseContent
                        | RecurringPaymentResponseContent
                    ) => void,
                  };
                  console.log('Updated pending requests map:', pendingRequests);

                  return newPendingRequests;
                });
              });
            })
          )
          .catch(e => {
            console.error('Error listening for auth challenge', e);
            // TODO: re-initialize the app
          });

        app
          .listenForPaymentRequest(
            new LocalPaymentRequestListener(
              (event: SinglePaymentRequest) => {
                const id = event.eventId;

                console.log(`Single payment request with id ${id} received`, event);

                return new Promise<PaymentResponseContent>(resolve => {
                  setPendingRequests(prev => {
                    const newPendingRequests = { ...prev };

                    if (prev[id]) {
                      return prev
                    }

                    newPendingRequests[id] = {
                      id,
                      metadata: event,
                      timestamp: new Date(),
                      type: 'payment',
                      result: resolve as (
                        value:
                          | AuthResponseStatus
                          | PaymentResponseContent
                          | RecurringPaymentResponseContent
                      ) => void,
                    };

                    return newPendingRequests;
                  });
                });
              },
              (event: RecurringPaymentRequest) => {
                const id = event.eventId;

                console.log(`Recurring payment request with id ${id} received`, event);

                return new Promise<RecurringPaymentResponseContent>(resolve => {
                  setPendingRequests(prev => {
                    const newPendingRequests = { ...prev };

                    if (prev[id]) {
                      return prev
                    }

                    newPendingRequests[id] = {
                      id,
                      metadata: event,
                      timestamp: new Date(),
                      type: 'subscription',
                      result: resolve as (
                        value:
                          | AuthResponseStatus
                          | PaymentResponseContent
                          | RecurringPaymentResponseContent
                      ) => void,
                    };

                    return newPendingRequests;
                  });
                });
              }
            )
          )
          .catch(e => {
            console.error('Error listening for payment request', e);
            // TODO: re-initialize the app
          });

        // Listen for closed recurring payments
        class ClosedRecurringPaymentListenerImpl implements ClosedRecurringPaymentListener {
          async onClosedRecurringPayment(event: CloseRecurringPaymentResponse): Promise<void> {
            console.log('Closed subscription received', event);
            // Handle closed recurring payment event
            // You can add additional logic here if needed
          }
        }
        app.listenClosedRecurringPayment(new ClosedRecurringPaymentListenerImpl());

        // Save portal app instance
        setPortalApp(app);
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

    return () => {
      console.log('Aborting NostrService initialization');
      abortController.abort();
    };
  }, [mnemonic, appIsActive]);

  useEffect(() => {
    console.log('Updated pending requests:', pendingRequests);
  }, [pendingRequests]);

  // Optimized wallet connection effect with better separation of concerns
  useEffect(() => {
    if (!isInitialized) return;

    // Always reset connection status when wallet URL changes (including when cleared)
    console.log(
      'NostrServiceContext: Wallet URL changed to:',
      walletUrl,
      'resetting connection status'
    );
    setNwcConnectionStatus(null);
    setNwcConnectionError(null);

    // Clear any timeout state
    setNwcTimeoutUntil(null);
    setNwcCheckInProgress(false);

    if (!walletUrl) {
      console.log('Wallet URL cleared, disconnecting wallet');
      setNwcWallet(null);
      return;
    }

    let timeoutId: number;
    let isCancelled = false;

    const connectWallet = async () => {
      try {
        console.log('Connecting to wallet with URL:', walletUrl);
        const wallet = new Nwc(walletUrl);

        if (isCancelled) return;
        setNwcWallet(wallet);
        console.log('Wallet connected successfully');

        // Schedule initial status check with proper cleanup
        timeoutId = setTimeout(async () => {
          if (isCancelled) return;

          try {
            // Call getInfo first to establish relay connections before checking status
            console.log('Calling getInfo to establish relay connections...');
            await wallet.getInfo();
            console.log('info: ', await wallet.getInfo());
            if (isCancelled) return;

            console.log('getInfo completed, now checking connection status...');
            const status = await wallet.connectionStatus();
            if (isCancelled) return;

            const isConnected = interpretNwcStatus(status);
            setNwcConnectionStatus(isConnected);
            setNwcConnectionError(isConnected ? null : 'Unable to connect to wallet service');
            console.log('Initial NWC wallet connection status:', isConnected);
          } catch (error) {
            if (isCancelled) return;

            const errorMessage = error instanceof Error ? error.message : String(error);

            // Handle specific NWC errors more gracefully
            if (errorMessage.includes('AppError.Nwc')) {
              console.log('NWC wallet not ready or unavailable during initial check');
              setNwcConnectionStatus(false);
              setNwcConnectionError('Wallet not available - will retry automatically');
            } else if (errorMessage.includes('timeout')) {
              console.log('NWC initial connection timeout - will retry automatically');
              setNwcConnectionStatus(false);
              setNwcConnectionError('Connection timeout - will retry automatically');
            } else {
              console.error('Error checking initial NWC connection status:', error);
              setNwcConnectionStatus(false);
              setNwcConnectionError('Failed to verify wallet connection');
            }
          }
        }, 1000);
      } catch (error) {
        if (isCancelled) return;
        console.error('Failed to connect wallet:', error);
        setNwcWallet(null);
        setNwcConnectionStatus(null);
        setNwcConnectionError('Failed to connect to wallet');
      }
    };

    connectWallet();

    // Cleanup function to prevent race conditions and memory leaks
    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [walletUrl, isInitialized]);

  // Pay invoice via wallet
  const payInvoice = useCallback(
    async (invoice: string): Promise<string> => {
      if (!nwcWallet) {
        throw new Error('NWC wallet not connected');
      }
      return nwcWallet.payInvoice(invoice);
    },
    [nwcWallet]
  );

  // Lookup invoice via wallet
  const lookupInvoice = useCallback(
    async (invoice: string): Promise<LookupInvoiceResponse> => {
      if (!nwcWallet) {
        throw new Error('NWC wallet not connected');
      }
      return nwcWallet.lookupInvoice(invoice);
    },
    [nwcWallet]
  );

  // Disconnect wallet
  const disconnectWallet = useCallback(() => {
    setNwcWallet(null);
  }, []);

  // Send auth init
  const sendKeyHandshake = useCallback(
    async (url: KeyHandshakeUrl): Promise<void> => {
      if (!portalApp) {
        throw new Error('PortalApp not initialized');
      }

      console.log('Sending auth init', url);
      return portalApp.sendKeyHandshake(url);
    },
    [portalApp]
  );

  // Get service name with database caching
  const getServiceName = useCallback(
    async (pubKey: string): Promise<string | null> => {
      if (!portalApp) {
        throw new Error('PortalApp not initialized');
      }

      try {
        // Step 1: Check for valid cached entry (not expired)
        const cachedName = await DB.getCachedServiceName(pubKey);
        if (cachedName) {
          console.log('DEBUG: Using cached service name for:', pubKey, '->', cachedName);
          return cachedName;
        }

        // Step 2: Check relay connection status before attempting network fetch
        if (!connectionStatus || !(connectionStatus instanceof Map) || connectionStatus.size === 0) {
          console.warn('DEBUG: No relays connected, cannot fetch service profile for:', pubKey);
          throw new Error('No relay connections available. Please check your internet connection and try again.');
        }

        // Check if at least one relay is connected
        let connectedCount = 0;
        for (const [url, status] of connectionStatus.entries()) {
          const finalStatus = typeof status === 'number' ? mapNumericStatusToString(status) : 'Unknown';
          if (finalStatus === 'Connected') {
            connectedCount++;
          }
        }

        if (connectedCount === 0) {
          console.warn('DEBUG: No relays in Connected state, cannot fetch service profile for:', pubKey);
          throw new Error('No relay connections available. Please check your internet connection and try again.');
        }

        console.log('DEBUG: NostrService.getServiceName fetching from network for pubKey:', pubKey);
        console.log('DEBUG: Connected relays:', connectedCount, '/', connectionStatus.size);

        // Step 3: Fetch from network
        const profile = await portalApp.fetchProfile(pubKey);
        console.log('DEBUG: portalApp.fetchProfile returned:', profile);

        // Step 4: Extract service name from profile
        const serviceName = getServiceNameFromProfile(profile);
        
        if (serviceName) {
          // Step 5: Cache the result
          await DB.setCachedServiceName(pubKey, serviceName);
          console.log('DEBUG: Cached new service name for:', pubKey, '->', serviceName);
          return serviceName;
        } else {
          console.log('DEBUG: No service name found in profile for:', pubKey);
          return null;
        }
      } catch (error) {
        console.log('DEBUG: getServiceName error for:', pubKey, error);
        throw error;
      }
    },
    [portalApp, connectionStatus]
  );

  const dismissPendingRequest = useCallback((id: string) => {
    setPendingRequests(prev => {
      const newPendingRequests = { ...prev };
      delete newPendingRequests[id];
      return newPendingRequests;
    });
  }, []);

  const setUserProfile = useCallback(
    async (profile: Profile) => {
      if (!portalApp) {
        throw new Error('PortalApp not initialized');
      }
      await portalApp.setProfile(profile);
    },
    [portalApp]
  );

  const closeRecurringPayment = useCallback(
    async (pubkey: string, subscriptionId: string) => {
      if (!portalApp) {
        throw new Error('PortalApp not initialized');
      }
      await portalApp.closeRecurringPayment(pubkey, subscriptionId);
    },
    [portalApp]
  );

  // Refresh connection status from portal app
  const refreshConnectionStatus = useCallback(async () => {
    if (portalApp) {
      try {
        const status = await portalApp.connectionStatus();
        setConnectionStatus(status);
      } catch (error) {
        console.error('NostrService: Error fetching connection status:', error);
        setConnectionStatus(null);
      }
    }
  }, [portalApp]);

  // Get processed connection summary
  const getConnectionSummary = useCallback((): ConnectionSummary => {
    if (!connectionStatus) {
      return {
        allRelaysConnected: false,
        connectedCount: 0,
        totalCount: 0,
        relays: [],
      };
    }

    if (connectionStatus instanceof Map) {
      const relayEntries = Array.from(connectionStatus.entries());

      const relays: RelayInfo[] = relayEntries
        .map(([url, status]) => {
          // Convert numeric status to string using the mapping function
          const finalStatus: RelayConnectionStatus =
            typeof status === 'number' ? mapNumericStatusToString(status) : 'Unknown';

          return {
            url,
            status: finalStatus,
            connected: finalStatus === 'Connected',
          };
        })
        .sort((a, b) => a.url.localeCompare(b.url)); // Sort by URL for consistent order

      const connectedCount = relays.filter(relay => relay.connected).length;
      const totalCount = relays.length;
      const allRelaysConnected = totalCount > 0 && connectedCount === totalCount;

      return {
        allRelaysConnected,
        connectedCount,
        totalCount,
        relays,
      };
    }

    return {
      allRelaysConnected: false,
      connectedCount: 0,
      totalCount: 0,
      relays: [],
    };
  }, [connectionStatus]);

  // Simple monitoring control functions (to be used by navigation-based polling)
  const startPeriodicMonitoring = useCallback(() => {
    console.warn('startPeriodicMonitoring is deprecated. Use navigation-based monitoring instead.');
  }, []);

  const stopPeriodicMonitoring = useCallback(() => {
    console.warn('stopPeriodicMonitoring is deprecated. Use navigation-based monitoring instead.');
  }, []);

  // Simple NWC connection status refresh - prevent concurrent calls
  const refreshNwcConnectionStatus = useCallback(async () => {
    const currentWallet = nwcWallet;

    if (!currentWallet) {
      setNwcConnectionStatus(null);
      setNwcConnectionError(null);
      return;
    }

    // Skip if another check is already in progress
    if (nwcCheckInProgress) {
      return;
    }

    // Skip if we're in timeout period (60 seconds after last timeout)
    const now = Date.now();
    if (nwcTimeoutUntil && now < nwcTimeoutUntil) {
      return;
    }

    // Add debounce: Skip if we've checked within the last 3 seconds
    if (now - lastNwcCheck < 3000) {
      return;
    }

    // Set in-progress flag to prevent concurrent calls
    setNwcCheckInProgress(true);
    setLastNwcCheck(now);

    try {
      setNwcConnectionError(null);

      // Use optimized timeout with proper cleanup
      const { promise: timeoutPromise, cleanup } = createTimeoutPromise(10000);

      try {
        // Call getInfo first to establish relay connections before checking status
        await Promise.race([currentWallet.getInfo(), timeoutPromise]);

        const status: any = await Promise.race([currentWallet.connectionStatus(), timeoutPromise]);

        cleanup();

        // Use pure function for status interpretation
        const isConnected = interpretNwcStatus(status);

        setNwcConnectionStatus(isConnected);
        setNwcConnectionError(isConnected ? null : 'Unable to connect to wallet service');

        // Clear timeout on successful connection
        if (isConnected) {
          setNwcTimeoutUntil(null);
        }

        // Always clear in-progress flag on successful completion
        setNwcCheckInProgress(false);
      } catch (raceError) {
        cleanup();
        throw raceError;
      }
    } catch (error) {
      // Always clear in-progress flag on error
      setNwcCheckInProgress(false);

      if (currentWallet === nwcWallet) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const userFriendlyError = categorizeNwcError(error);

        setNwcConnectionStatus(false);
        setNwcConnectionError(userFriendlyError);

        // If timeout error, set timeout period without logging
        if (errorMessage.includes('timeout')) {
          const timeoutUntil = Date.now() + 60000; // 60 seconds from now
          setNwcTimeoutUntil(timeoutUntil);
        } else {
          // Log other errors normally (keep real errors)
          console.error('NostrService: Error fetching NWC connection status:', error);
        }
      }
    }
  }, [nwcWallet]); // Only depend on nwcWallet to prevent infinite recreation

  // Force reconnect function to trigger immediate reconnection
  const forceReconnect = useCallback(async () => {
    if (!portalApp) {
      console.warn('PortalApp not initialized, cannot force reconnect');
      return;
    }

          console.log('Force reconnecting to relays...');

    try {
      // Only refresh connection status, don't trigger recursive calls
      await refreshConnectionStatus();

              console.log('Force reconnect initiated');
    } catch (error) {
              console.error('Error during force reconnect:', error);
    }
  }, [portalApp, refreshConnectionStatus]);

  // Centralized NWC polling - only when wallet is configured
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (nwcWallet) {
      // Start periodic polling every 5 seconds (unified with relay polling)
      interval = setInterval(() => {
        if (refreshNwcConnectionStatusRef.current) {
          refreshNwcConnectionStatusRef.current();
        }
      }, 5000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [nwcWallet]); // Only start/stop when wallet configuration changes

  // Initial connection status fetch with delay to allow relay connections to establish
  useEffect(() => {
    // Add a small delay to allow relay connections to establish after initialization
    const timer = setTimeout(() => {
      if (refreshConnectionStatusRef.current) {
        refreshConnectionStatusRef.current();
      }
      if (refreshNwcConnectionStatusRef.current) {
        refreshNwcConnectionStatusRef.current();
      }
    }, 2000); // 2 second delay to allow relay connections to establish

    return () => clearTimeout(timer);
  }, []); // Empty dependency array - only run once on mount

  // Update refs when values change (no effect recreation)
  useEffect(() => {
    portalAppRef.current = portalApp;
  }, [portalApp]);

  useEffect(() => {
    refreshConnectionStatusRef.current = refreshConnectionStatus;
  }, [refreshConnectionStatus]);

  useEffect(() => {
    refreshNwcConnectionStatusRef.current = refreshNwcConnectionStatus;
  }, [refreshNwcConnectionStatus]);

  // Stable AppState listener - runs only once, never recreated
  useEffect(() => {
    console.log('🔄 Setting up STABLE AppState listener (runs once)');
    
    const handleAppStateChange = async (nextAppState: string) => {
      console.log('AppState changed to:', nextAppState);

      // Update app active state
      setAppIsActive(nextAppState === 'active');

      if (nextAppState === 'active') {
        if (portalAppRef.current) {
          console.log('📱 App became active - refreshing connection status');
          try {
            if (refreshConnectionStatusRef.current) {
              await refreshConnectionStatusRef.current();
            }
            if (refreshNwcConnectionStatusRef.current) {
              await refreshNwcConnectionStatusRef.current();
            }
          } catch (error) {
            console.error('Error refreshing connection status on app active:', error);
          }
        } else {
          console.log('⚠️ App became active but portalApp is null - will re-initialize');
        }
      }
    };

    // Subscribe to app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      console.log('🧹 Removing STABLE AppState listener (only on unmount)');
      subscription?.remove();
    };
  }, []); // EMPTY dependency array - never recreated

  // Remove the old unstable AppState listener
  // (commenting out the old one that was being recreated constantly)

  const submitNip05 = useCallback(async (nip05: string) => {
    if (!portalApp) {
      throw new Error('PortalApp not initialized');
    }
    await portalApp.registerNip05(nip05);
  }, [portalApp]);

  const submitImage = useCallback(async (imageBase64: string) => {
    if (!portalApp) {
      throw new Error('PortalApp not initialized');
    }
    await portalApp.registerImg(imageBase64);
  }, [portalApp]);

  // Wallet info functions
  const getWalletInfo = useCallback(async (): Promise<WalletInfo | null> => {
    if (!nwcWallet) {
      console.log('No NWC wallet available for getInfo');
      return null;
    }

    try {
      setWalletInfo(prev => ({ ...prev, isLoading: true, error: null }));

      console.log('Fetching wallet info via getInfo...');
      const info: any = await nwcWallet.getInfo();
      const balance = await nwcWallet.getBalance();

      console.log('Balance:', balance);

      console.log('Wallet info received:', info);

      // Map the response properties to our WalletInfo interface
      // Using flexible property access to handle different response formats
      const walletData: WalletInfo = {
        alias: info.alias,
        get_balance: Number(balance)
      };

      setWalletInfo({
        data: walletData,
        isLoading: false,
        error: null,
        lastUpdated: new Date(),
      });

      return walletData;
    } catch (error) {
      console.error('Error fetching wallet info:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch wallet info';

      setWalletInfo(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));

      return null;
    }
  }, [nwcWallet]);

  const refreshWalletInfo = useCallback(async () => {
    await getWalletInfo();
  }, [getWalletInfo]);

  // Auto-refresh wallet info when wallet connects/changes
  useEffect(() => {
    if (nwcWallet && nwcConnectionStatus === true) {
      console.log('Wallet connected, fetching wallet info...');
      refreshWalletInfo();
    } else if (!nwcWallet) {
      // Clear wallet info when wallet disconnects
      setWalletInfo({
        data: null,
        isLoading: false,
        error: null,
        lastUpdated: null,
      });
    }
  }, [nwcWallet, nwcConnectionStatus, refreshWalletInfo]);

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
      initLogger(new Logger(), LogLevel.Warn)
      console.log('Logger initialized');
    } catch (error) {
      console.error('Error initializing logger:', error);
    }
  }, []); */

  // Context value
  const contextValue: NostrServiceContextType = {
    isInitialized,
    isWalletConnected: nwcWallet !== null,
    publicKey,
    portalApp,
    nwcWallet,
    pendingRequests,
    payInvoice,
    lookupInvoice,
    disconnectWallet,
    sendKeyHandshake,
    getServiceName,
    dismissPendingRequest,
    setUserProfile,
    closeRecurringPayment,
    getConnectionSummary,
    refreshConnectionStatus,
    connectionStatus,
    startPeriodicMonitoring,
    stopPeriodicMonitoring,
    nwcConnectionStatus,
    nwcConnectionError,
    refreshNwcConnectionStatus,
    forceReconnect,
    submitNip05,
    submitImage,
    walletInfo,
    refreshWalletInfo,
    getWalletInfo,
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
