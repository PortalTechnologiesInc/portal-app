import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { AppState } from 'react-native';
import {
  AuthChallengeEvent,
  KeyHandshakeUrl,
  Mnemonic,
  Profile,
  RecurringPaymentResponseContent,
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
  RelayStatusListener,
  KeypairInterface,
  parseCashuToken,
  CashuDirectContentWithKey,
  CashuDirectListener,
  CashuRequestListener,
  CashuRequestContentWithKey,
  CashuResponseStatus,
  PaymentStatusNotifier,
  PaymentStatus,
} from 'portal-app-lib';
import { PortalAppManager } from '@/services/PortalAppManager';
import type {
  PendingRequest,
  RelayConnectionStatus,
  RelayInfo,
  WalletInfo,
  WalletInfoState,
} from '@/utils/types';
import { handleErrorWithToastAndReinit } from '@/utils/Toast';
import { showToast } from '@/utils/Toast';
import { useECash } from './ECashContext';
import {
  handleAuthChallenge,
  handleCloseRecurringPaymentResponse,
  handleRecurringPaymentRequest,
  handleSinglePaymentRequest,
} from '@/services/EventFilters';
import { registerContextReset, unregisterContextReset } from '@/services/ContextResetService';
import { useDatabaseContext } from '@/context/DatabaseContext';
import defaultRelayList from '../assets/DefaultRelays.json';
import { useCurrency } from './CurrencyContext';
import { useOnboarding } from './OnboardingContext';
import { getKeypairFromKey, hasKey } from '@/utils/keyHelpers';
import { getServiceNameFromProfile, mapNumericStatusToString } from '@/utils/nostrHelper';

export class LocalCashuDirectListener implements CashuDirectListener {
  private callback: (event: CashuDirectContentWithKey) => Promise<void>;

  constructor(callback: (event: CashuDirectContentWithKey) => Promise<void>) {
    this.callback = callback;
  }

  onCashuDirect(event: CashuDirectContentWithKey): Promise<void> {
    return this.callback(event);
  }
}

export class LocalCashuRequestListener implements CashuRequestListener {
  private callback: (event: CashuRequestContentWithKey) => Promise<CashuResponseStatus>;

  constructor(callback: (event: CashuRequestContentWithKey) => Promise<CashuResponseStatus>) {
    this.callback = callback;
  }

  onCashuRequest(event: CashuRequestContentWithKey): Promise<CashuResponseStatus> {
    return this.callback(event);
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
  private singleCb: (event: SinglePaymentRequest, notifier: PaymentStatusNotifier) => Promise<void>;
  private recurringCb: (event: RecurringPaymentRequest) => Promise<RecurringPaymentResponseContent>;

  constructor(
    singleCb: (event: SinglePaymentRequest, notifier: PaymentStatusNotifier) => Promise<void>,
    recurringCb: (event: RecurringPaymentRequest) => Promise<RecurringPaymentResponseContent>
  ) {
    this.singleCb = singleCb;
    this.recurringCb = recurringCb;
  }

  onSinglePaymentRequest(
    event: SinglePaymentRequest,
    notifier: PaymentStatusNotifier
  ): Promise<void> {
    return this.singleCb(event, notifier);
  }

  onRecurringPaymentRequest(
    event: RecurringPaymentRequest
  ): Promise<RecurringPaymentResponseContent> {
    return this.recurringCb(event);
  }
}

export class LocalClosedRecurringPaymentListener implements ClosedRecurringPaymentListener {
  private callback: (event: CloseRecurringPaymentResponse) => Promise<void>;

  constructor(callback: (event: CloseRecurringPaymentResponse) => Promise<void>) {
    this.callback = callback;
  }
  async onClosedRecurringPayment(event: CloseRecurringPaymentResponse): Promise<void> {
    return this.callback(event);
  }
}

// Note: WalletInfo and WalletInfoState are now imported from centralized types

// Context type definition
export interface NostrServiceContextType {
  isInitialized: boolean;
  isWalletConnected: boolean;
  publicKey: string | null;
  nwcWallet: Nwc | null;
  pendingRequests: { [key: string]: PendingRequest };
  payInvoice: (invoice: string) => Promise<string>;
  lookupInvoice: (invoice: string) => Promise<LookupInvoiceResponse>;
  disconnectWallet: () => void;
  sendKeyHandshake: (url: KeyHandshakeUrl) => Promise<void>;
  getServiceName: (app: PortalAppInterface, publicKey: string) => Promise<string | null>;
  dismissPendingRequest: (id: string) => void;
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

  // Wallet info from getinfo method
  walletInfo: WalletInfoState;
  refreshWalletInfo: () => Promise<void>;
  getWalletInfo: () => Promise<WalletInfo | null>;
  relayStatuses: RelayInfo[];

  // NWC relay status
  nwcRelayStatus: RelayInfo | null;
  nwcConnectionStatus: boolean | null; // Derived from nwcRelayStatus.connected
  nwcConnectionError: string | null; // Derived from nwcRelayStatus when disconnected
  nwcConnecting: boolean; // Whether NWC connection is in progress

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
  nsec: string;
  walletUrl: string | null;
  children: React.ReactNode;
}

export const NostrServiceProvider: React.FC<NostrServiceProviderProps> = ({
  mnemonic,
  nsec,
  walletUrl,
  children,
}) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<{ [key: string]: PendingRequest }>({});
  const [nwcWallet, setNwcWallet] = useState<Nwc | null>(null);
  const nwcWalletRef = useRef<Nwc | null>(null);
  const [walletInfo, setWalletInfo] = useState<WalletInfoState>({
    data: null,
    isLoading: false,
    error: null,
    lastUpdated: null,
  });
  const [relayStatuses, setRelayStatuses] = useState<RelayInfo[]>([]);
  const [nwcRelayStatus, setNwcRelayStatus] = useState<RelayInfo | null>(null);
  const [nwcConnectionFailed, setNwcConnectionFailed] = useState<boolean>(false);
  const [nwcConnecting, setNwcConnecting] = useState<boolean>(false);
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

  const eCashContext = useECash();
  const { executeOperation, executeOnNostr } = useDatabaseContext();
  const { preferredCurrency } = useCurrency();
  const { isOnboardingComplete } = useOnboarding();

  // Reset all NostrService state to initial values
  // This is called during app reset to ensure clean state
  const resetNostrService = () => {
    // Reset all state to initial values
    setIsInitialized(false);
    setPublicKey(null);
    setPendingRequests({});
    setNwcWallet(null);
    setWalletInfo({
      data: null,
      isLoading: false,
      error: null,
      lastUpdated: null,
    });
    setRelayStatuses([]);
    setNwcRelayStatus(null);
    setKeypair(null);
    setReinitKey(k => k + 1);
    setRemovedRelays(new Set());

    // Clear reconnection attempts tracking
    lastReconnectAttempts.current.clear();
  };

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
  }, []);

  class NwcRelayStatusListener implements RelayStatusListener {
    onRelayStatusChange(relay_url: string, status: number): Promise<void> {
      const statusString = mapNumericStatusToString(status);
      console.log('💰 [NWC STATUS UPDATE] Relay:', relay_url, '→', statusString, `(${status})`);

      // Reset reconnection attempts tracker when relay connects successfully
      if (status === 3) {
        // Connected - clear both manual and auto reconnection attempts
        lastReconnectAttempts.current.delete(`nwc_${relay_url}`);
        lastReconnectAttempts.current.delete(`nwc_auto_${relay_url}`);
      }

      // Auto-reconnect logic for terminated/disconnected relays
      if (status === 5 || status === 4) {
        // Terminated or Disconnected
        const now = Date.now();
        const lastAutoAttempt = lastReconnectAttempts.current.get(`nwc_auto_${relay_url}`) || 0;
        const timeSinceLastAutoAttempt = now - lastAutoAttempt;

        // Only attempt auto-reconnection if more than 10 seconds have passed since last auto-attempt
        if (timeSinceLastAutoAttempt > 10000) {
          lastReconnectAttempts.current.set(`nwc_auto_${relay_url}`, now);

          // Use setTimeout to avoid blocking the status update
          setTimeout(async () => {
            try {
              const currentWallet = nwcWalletRef.current;
              if (currentWallet && typeof currentWallet.reconnectRelay === 'function') {
                console.log('🔄 Attempting NWC relay reconnection for:', relay_url);
                await currentWallet.reconnectRelay(relay_url);
                console.log('✅ NWC relay reconnected successfully:', relay_url);
              } else {
                console.log('⚠️ NWC wallet or reconnectRelay method not available for:', relay_url);
              }
            } catch (error) {
              console.error('❌ NWC auto-reconnect failed for relay:', relay_url, error);
            }
          }, 2000);
        }
      }

      // Update NWC relay status state
      setNwcRelayStatus({
        url: relay_url,
        status: statusString,
        connected: status === 3, // Status 3 = Connected
      });

      return Promise.resolve();
    }
  }

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

  // Add reinit logic
  const triggerReinit = useCallback(() => {
    setIsInitialized(false);
    setPublicKey(null);
    setReinitKey(k => k + 1);
  }, []);

  // Initialize the NostrService
  useEffect(() => {
    const abortController = new AbortController();

    // Prevent re-initialization if already initialized
    if (isInitialized && PortalAppManager.tryGetInstance()) {
      return;
    }


    // Skip initialization if no key material is available (e.g., during onboarding)
    if (!hasKey({ mnemonic, nsec })) {
      console.log('NostrService: Skipping initialization - no key material available');
      return;
    }

    const initializeNostrService = async () => {
      try {
        console.log('Initializing NostrService with key material');

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
        } catch (error) {
          console.warn('Failed to get relays from database, using defaults:', error);
          // Fallback to default relays if database access fails
          relays = [...defaultRelayList];
          await executeOperation(db => db.updateRelays(defaultRelayList), null);
        }

        const app = await PortalAppManager.getInstance(
          keypair,
          relays,
          new LocalRelayStatusListener(),
          true
        );

        // Start listening and give it a moment to establish connections
        app.listen({ signal: abortController.signal });

        // listener to receive tokens
        app
          .listenCashuDirect(
            new LocalCashuDirectListener(async (event: CashuDirectContentWithKey) => {

              try {
                // Auto-process the Cashu token (receiving tokens)
                const token = event.inner.token;

                // Check if we've already processed this token
                const tokenInfo = await parseCashuToken(token);

                // Use database service to handle connection errors
                const isProcessed = await executeOperation(
                  db =>
                    db.markCashuTokenAsProcessed(
                      token,
                      tokenInfo.mintUrl,
                      tokenInfo.unit,
                      tokenInfo.amount ? Number(tokenInfo.amount) : 0
                    ),
                  false
                );

                if (isProcessed === true) {
                  return;
                } else if (isProcessed === null) {
                  console.warn(
                    'Failed to check token processing status due to database issues, proceeding cautiously'
                  );
                  // Continue processing but log a warning
                }

                const wallet = await eCashContext.addWallet(
                  tokenInfo.mintUrl,
                  tokenInfo.unit.toLowerCase()
                );
                await wallet.receiveToken(token);

                await executeOnNostr(async (db) => {
                  let mintsList = await db.readMints();

                  // Convert to Set to prevent duplicates, then back to array
                  const mintsSet = new Set([tokenInfo.mintUrl, ...mintsList]);
                  mintsList = Array.from(mintsSet);

                  db.storeMints(mintsList);
                });

                console.log('Cashu token processed successfully');

                // Emit event to notify that wallet balances have changed
                const { globalEvents } = await import('@/utils/index');
                globalEvents.emit('walletBalancesChanged', {
                  mintUrl: tokenInfo.mintUrl,
                  unit: tokenInfo.unit.toLowerCase(),
                });
                console.log('walletBalancesChanged event emitted');

                // Record activity for token receipt
                try {
                  // For Cashu direct, use mint URL as service identifier
                  const serviceKey = tokenInfo.mintUrl;
                  const unitInfo = await wallet.getUnitInfo();
                  const ticketTitle = unitInfo?.title || wallet.unit();

                  // Add activity to database using ActivitiesContext directly
                  const activity = {
                    type: 'ticket_received' as const,
                    service_key: serviceKey,
                    service_name: ticketTitle, // Always use ticket title
                    detail: ticketTitle, // Always use ticket title
                    date: new Date(),
                    amount: Number(tokenInfo.amount),
                    currency: null,
                    request_id: `cashu-direct-${Date.now()}`,
                    subscription_id: null,
                    status: 'neutral' as 'neutral',
                    converted_amount: null,
                    converted_currency: null,
                  };

                  // Use database service for activity recording
                  const activityId = await executeOperation(db => db.addActivity(activity), null);

                  if (activityId) {
                    // Emit event for UI updates
                    globalEvents.emit('activityAdded', activity);
                    // Provide lightweight user feedback
                    const amountStr = tokenInfo.amount ? ` x${Number(tokenInfo.amount)}` : '';
                    showToast(`Ticket received: ${ticketTitle}${amountStr}`, 'success');
                  } else {
                    console.warn('Failed to record Cashu token activity due to database issues');
                  }
                } catch (activityError) {
                  console.error('Error recording Cashu direct activity:', activityError);
                }
              } catch (error: any) {
                console.error('Error processing Cashu token:', error.inner);
              }

              // Return void for direct processing
              return;
            })
          )
          .catch(e => {
            console.error('Error listening for Cashu direct', e);
            handleErrorWithToastAndReinit(
              'Failed to listen for Cashu direct. Retrying...',
              triggerReinit
            );
          });

        // listener to burn tokens
        app.listenCashuRequests(
          new LocalCashuRequestListener(async (event: CashuRequestContentWithKey) => {
            // Use event-based ID for deduplication instead of random generation
            const eventId = `${event.inner.mintUrl}-${event.inner.unit}-${event.inner.amount}-${event.mainKey}`;
            const id = `cashu-request-${eventId}`;

            // Early deduplication check before processing
            const existingRequest = pendingRequests[id];
            if (existingRequest) {
              // Return a promise that will resolve when the original request is resolved
              return new Promise<CashuResponseStatus>(resolve => {
                // Store the resolve function so it gets called when the original request completes
                const originalResolve = existingRequest.result;
                existingRequest.result = (status: CashuResponseStatus) => {
                  resolve(status);
                  if (originalResolve) originalResolve(status);
                };
              });
            }

            // Declare wallet in outer scope
            let wallet;
            // Check if we have the required unit before creating pending request
            try {
              const requiredMintUrl = event.inner.mintUrl;
              const requiredUnit = event.inner.unit.toLowerCase(); // Normalize unit name
              const requiredAmount = event.inner.amount;

              // Check if we have a wallet for this mint and unit
              wallet = await eCashContext.getWallet(requiredMintUrl, requiredUnit);

              // If wallet not found in ECashContext, try to create it
              if (!wallet) {
                try {
                  wallet = await eCashContext.addWallet(requiredMintUrl, requiredUnit);
                } catch (error) {
                  console.error(
                    `Error creating wallet for ${requiredMintUrl}-${requiredUnit}:`,
                    error
                  );
                }
              }

              if (!wallet) {
                return new CashuResponseStatus.InsufficientFunds();
              }

              // Check if we have sufficient balance
              const balance = await wallet.getBalance();
              if (balance < requiredAmount) {
                return new CashuResponseStatus.InsufficientFunds();
              }
            } catch (error) {
              console.error('Error checking wallet availability:', error);
              return new CashuResponseStatus.InsufficientFunds();
            }

            // Get the ticket title for pending requests
            let ticketTitle = 'Unknown Ticket';
            if (wallet) {
              let unitInfo;
              try {
                unitInfo = wallet.getUnitInfo ? await wallet.getUnitInfo() : undefined;
              } catch (e) {
                unitInfo = undefined;
              }
              ticketTitle = unitInfo?.title || wallet.unit();
            }
            return new Promise<CashuResponseStatus>(resolve => {
              const newRequest: PendingRequest = {
                id,
                metadata: event,
                timestamp: new Date(),
                type: 'ticket',
                result: resolve,
                ticketTitle, // Set the ticket name for UI
              };
              setPendingRequests(prev => {
                // Check if request already exists to prevent duplicates
                if (prev[id]) {
                  return prev;
                }
                return { ...prev, [id]: newRequest };
              });
            });
          })
        );

        /**
         * these logic go inside the new listeners that will be implemented
         */
        // end

        app
          .listenForAuthChallenge(
            new LocalAuthChallengeListener((event: AuthChallengeEvent) => {
              const id = event.eventId;

              void executeOperation(db => db.markNotificationEventProcessed(id), false);

              return new Promise<AuthResponseStatus>(resolve => {
                handleAuthChallenge(event, executeOperation, resolve).then(askUser => {
                  if (askUser) {
                    const newRequest: PendingRequest = {
                      id,
                      metadata: event,
                      timestamp: new Date(),
                      type: 'login',
                      result: resolve,
                    };

                    setPendingRequests(prev => {
                      // Check if request already exists to prevent duplicates
                      if (prev[id]) {
                        return prev;
                      }
                      return { ...prev, [id]: newRequest };
                    });
                  }
                });
              });
            })
          )
          .catch(e => {
            console.error('Error listening for auth challenge', e);
            handleErrorWithToastAndReinit(
              'Failed to listen for authentication challenge. Retrying...',
              triggerReinit
            );
          });

        app
          .listenForPaymentRequest(
            new LocalPaymentRequestListener(
              async (event: SinglePaymentRequest, notifier: PaymentStatusNotifier) => {
                const id = event.eventId;

                const alreadyTracked = await executeOperation(db => db.markNotificationEventProcessed(id), false);

                return new Promise<void>(resolve => {
                  // Immediately resolve the promise, we use the notifier to notify the payment status
                  resolve();

                  const resolver = async (status: PaymentStatus) => {
                    await notifier.notify({
                      status,
                      requestId: event.content.requestId,
                    });
                  };

                  handleSinglePaymentRequest(
                    nwcWalletRef.current,
                    event,
                    preferredCurrency,
                    executeOperation,
                    resolver,
                    (AppState.currentState !== 'active' && !alreadyTracked)
                  ).then(askUser => {
                    if (askUser) {
                      const newRequest: PendingRequest = {
                        id,
                        metadata: event,
                        timestamp: new Date(),
                        type: 'payment',
                        result: resolver,
                      };

                      setPendingRequests(prev => {
                        // Check if request already exists to prevent duplicates
                        if (prev[id]) {
                          console.log(`Request ${id} already exists, skipping duplicate`);
                          return prev;
                        }
                        const newPendingRequests = { ...prev };
                        newPendingRequests[id] = newRequest;
                        return newPendingRequests;
                      });
                    }
                  });
                });
              },
              (event: RecurringPaymentRequest) => {
                const id = event.eventId;

                void executeOperation(db => db.markNotificationEventProcessed(id), false);

                return new Promise<RecurringPaymentResponseContent>(resolve => {
                  handleRecurringPaymentRequest(event, executeOperation, resolve).then(askUser => {
                    if (askUser) {
                      const newRequest: PendingRequest = {
                        id,
                        metadata: event,
                        timestamp: new Date(),
                        type: 'subscription',
                        result: resolve,
                      };

                      setPendingRequests(prev => {
                        // Check if request already exists to prevent duplicates
                        if (prev[id]) {
                          console.log(`Request ${id} already exists, skipping duplicate`);
                          return prev;
                        }
                        const newPendingRequests = { ...prev };
                        newPendingRequests[id] = newRequest;
                        return newPendingRequests;
                      });
                    }
                  });
                });
              }
            )
          )
          .catch(e => {
            console.error('Error listening for payment request', e);
            handleErrorWithToastAndReinit(
              'Failed to listen for payment request. Retrying...',
              triggerReinit
            );
          });

        // Listen for closed recurring payments
        app
          .listenClosedRecurringPayment(
            new LocalClosedRecurringPaymentListener((event: CloseRecurringPaymentResponse) => {
              console.log('Closed subscription received', event);
              return new Promise<void>(resolve => {
                handleCloseRecurringPaymentResponse(event, executeOperation, resolve);
              });
            })
          )
          .catch(e => {
            console.error('Error listening for recurring payments closing.', e);
          });

        // Mark as initialized
        setIsInitialized(true);
        setPublicKey(publicKeyStr);
        console.log('✅ NostrService initialized successfully');
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
  }, [mnemonic, nsec, reinitKey]);

  useEffect(() => {
  }, [pendingRequests]);

  // Optimized wallet connection effect with better separation of concerns
  useEffect(() => {
    if (!isInitialized) return;

    // Wallet URL changed
    if (!walletUrl) {
      setNwcWallet(null);
      setNwcRelayStatus(null); // Clear NWC relay status when wallet is disconnected
      setNwcConnectionFailed(false); // Reset connection failed state
      setNwcConnecting(false); // Reset connecting state
      return;
    }

    let timeoutId: number;
    let isCancelled = false;

    const connectWallet = async () => {
      try {
        setNwcConnectionFailed(false); // Reset failed state before attempting connection
        setNwcConnecting(true); // Set connecting state

        let wallet: Nwc;
        try {
          wallet = new Nwc(walletUrl, new NwcRelayStatusListener());
        } catch (nwcError) {
          console.error('NWC constructor failed:', nwcError);
          const errorMessage = nwcError instanceof Error ? nwcError.message : 'Unknown error';
          throw new Error(`Invalid wallet URL: ${errorMessage}`);
        }

        if (isCancelled) return;
        nwcWalletRef.current = wallet;
        setNwcWallet(wallet);

        // Initialize wallet info after connection
        timeoutId = setTimeout(async () => {
          if (isCancelled) return;

          try {
            // Call getInfo to establish relay connections
            await wallet.getInfo();
            setNwcConnecting(false); // Clear connecting state on success
          } catch (error) {
            if (isCancelled) return;
            setNwcConnecting(false); // Clear connecting state even on non-fatal error
          }
        }, 1000);
      } catch (error) {
        if (isCancelled) return;
        console.error('Failed to connect wallet:', error);
        setNwcWallet(null);
        setNwcConnectionFailed(true); // Mark connection as failed
        setNwcConnecting(false); // Clear connecting state on failure
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
      if (!isOnboardingComplete) {
        console.log("Cannot send handshake, onboarding is not complete");
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
      } catch (error) {
        console.error('Error fetching service name for:', pubKey, error);
        throw error;
      }
    },
    [relayStatuses]
  );

  const dismissPendingRequest = useCallback((id: string) => {
    setPendingRequests(prev => {
      const newPendingRequests = { ...prev };
      delete newPendingRequests[id];
      return newPendingRequests;
    });
  }, []);

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
        get_balance: Number(balance),
      };

      setWalletInfo({
        data: walletData,
        isLoading: false,
        error: null,
        lastUpdated: new Date(),
      });

      return walletData;
    } catch (error: any) {
      console.error('Error fetching wallet info:', error.inner);
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

  // Auto-refresh wallet info when wallet connects/changes
  useEffect(() => {
    if (nwcWallet) {
      console.log('Wallet available, fetching wallet info...');
      refreshWalletInfo();
    } else {
      // Clear wallet info when wallet disconnects
      setWalletInfo({
        data: null,
        isLoading: false,
        error: null,
        lastUpdated: null,
      });
    }
  }, [nwcWallet, refreshWalletInfo]);

  const issueJWT = (targetKey: string, expiresInHours: bigint) => {
    return keypair!.issueJwt(targetKey, expiresInHours);
  };

  // Derived NWC connection status values
  const nwcConnectionStatus = useMemo(() => {
    if (!walletUrl) return null; // No wallet URL configured
    if (nwcConnectionFailed) return false; // Connection failed
    if (nwcConnecting) return null; // Currently connecting
    if (!nwcWallet) return null; // No wallet instance yet
    if (!nwcRelayStatus) return null; // No status received yet
    return nwcRelayStatus.connected; // Return the actual connection status
  }, [walletUrl, nwcConnectionFailed, nwcConnecting, nwcWallet, nwcRelayStatus]);

  const nwcConnectionError = useMemo(() => {
    if (!walletUrl) return null; // No wallet URL configured
    if (nwcConnectionFailed) return 'Failed to connect wallet'; // Connection failed
    if (nwcConnecting) return null; // Currently connecting
    if (!nwcWallet) return null; // No wallet instance yet
    if (!nwcRelayStatus) return null; // No status received yet
    if (nwcRelayStatus.connected) return null; // No error when connected
    return `Connection ${nwcRelayStatus.status.toLowerCase()}`; // Show status as error message
  }, [walletUrl, nwcConnectionFailed, nwcConnecting, nwcWallet, nwcRelayStatus]);

  // Context value
  const contextValue: NostrServiceContextType = {
    isInitialized,
    isWalletConnected: nwcWallet !== null,
    publicKey,
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
    startPeriodicMonitoring,
    stopPeriodicMonitoring,
    submitNip05,
    submitImage,
    walletInfo,
    refreshWalletInfo,
    getWalletInfo,
    relayStatuses,
    nwcRelayStatus,
    nwcConnectionStatus,
    nwcConnectionError,
    nwcConnecting,
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
