import {
  type AuthChallengeEvent,
  type AuthChallengeListener,
  type AuthResponseStatus,
  type CashuDirectContentWithKey,
  type CashuDirectListener,
  type CashuRequestContentWithKey,
  type CashuRequestListener,
  CashuResponseStatus,
  type ClosedRecurringPaymentListener,
  type CloseRecurringPaymentResponse,
  keyToHex,
  type NostrConnectRequestEvent,
  type NostrConnectRequestListener,
  type NostrConnectResponseStatus,
  type PaymentRequestListener,
  type PaymentStatus,
  type PaymentStatusNotifier,
  parseCashuToken,
  type RecurringPaymentRequest,
  type RecurringPaymentResponseContent,
  type SinglePaymentRequest,
} from 'portal-app-lib';
import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  handleAuthChallenge,
  handleCloseRecurringPaymentResponse,
  handleNostrConnectRequest,
  handleRecurringPaymentRequest,
  handleSinglePaymentRequest,
} from '@/services/EventFilters';
import { PortalAppManager } from '@/services/PortalAppManager';
import { globalEvents } from '@/utils/common';
import { logError } from '@/utils/errorLogger';
import { getKeypairFromKey } from '@/utils/keyHelpers';
import { handleErrorWithToastAndReinit, showToast } from '@/utils/Toast';
import type { PendingRequest } from '@/utils/types';
import { useCurrency } from './CurrencyContext';
import { useDatabaseContext } from './DatabaseContext';
import { useECash } from './ECashContext';
import { useKey } from './KeyContext';
import { useNostrService } from './NostrServiceContext';
import { useWalletManager } from './WalletManagerContext';

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

export class LocalNip46RequestListener implements NostrConnectRequestListener {
  private callback: (event: NostrConnectRequestEvent) => Promise<NostrConnectResponseStatus>;

  constructor(callback: (event: NostrConnectRequestEvent) => Promise<NostrConnectResponseStatus>) {
    this.callback = callback;
  }
  async onRequest(event: NostrConnectRequestEvent): Promise<NostrConnectResponseStatus> {
    return this.callback(event);
  }
}

interface PortalAppProviderProps {
  children: React.ReactNode;
}

export interface PortalAppProviderType {
  pendingRequests: { [key: string]: PendingRequest };
  dismissPendingRequest: (id: string) => void;
}

const PortalAppContext = createContext<PortalAppProviderType | null>(null);

export const PortalAppProvider: React.FC<PortalAppProviderProps> = ({ children }) => {
  const { isInitialized } = useNostrService();
  const eCashContext = useECash();
  const { executeOperation, executeOnNostr } = useDatabaseContext();
  const [pendingRequests, setPendingRequests] = useState<{ [key: string]: PendingRequest }>({});
  const pendingRequestsRef = useRef<{ [key: string]: PendingRequest }>({});
  const listenersInitializedRef = useRef(false);
  const { activeWallet } = useWalletManager();
  const { preferredCurrency } = useCurrency();
  const { mnemonic, nsec } = useKey();

  // Keep ref in sync with state so listeners always access current value
  useEffect(() => {
    pendingRequestsRef.current = pendingRequests;
  }, [pendingRequests]);

  const initializeApp = useCallback(() => {
    // Prevent re-registering listeners if they're already initialized
    // This prevents Rust panics from trying to register listeners multiple times
    if (listenersInitializedRef.current) {
      console.log('[PORTAL_APP]: Listeners already initialized, skipping');
      return;
    }

    console.log('[PORTAL_APP]: Initializing app and setting up listeners');
    const app = PortalAppManager.tryGetInstance();

    const keypair = getKeypairFromKey({ mnemonic, nsec });
    const publicKeyStr = keypair.publicKey().toString();

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
              // Continue processing but log a warning
            }

            const wallet = await eCashContext.addWallet(
              tokenInfo.mintUrl,
              tokenInfo.unit.toLowerCase()
            );
            await wallet.receiveToken(token);

            await executeOnNostr(async db => {
              let mintsList = await db.readMints();

              // Convert to Set to prevent duplicates, then back to array
              const mintsSet = new Set([tokenInfo.mintUrl, ...mintsList]);
              mintsList = Array.from(mintsSet);

              db.storeMints(mintsList);
            });

            // Emit event to notify that wallet balances have changed
            globalEvents.emit('walletBalancesChanged', {
              mintUrl: tokenInfo.mintUrl,
              unit: tokenInfo.unit.toLowerCase(),
            });

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
                status: 'neutral' as const,
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
              }
            } catch (activityError: any) {
              logError('CASHU_DIRECT', 'onCashuDirect - recordActivity', activityError, {
                tokenInfo: tokenInfo?.mintUrl,
                amount: tokenInfo?.amount,
              });
            }
          } catch (error: any) {
            logError('CASHU_DIRECT', 'onCashuDirect - processToken', error, {
              tokenLength: event?.inner?.token?.length,
            });
          }

          // Return void for direct processing
          return;
        })
      )
      .catch(_e => {
        // Silently handle listener setup errors - don't retry to avoid infinite loops
        // The listener will be re-established on next app initialization
      });

    // listener to burn tokens
    app
      .listenCashuRequests(
      new LocalCashuRequestListener(async (event: CashuRequestContentWithKey) => {
          try {
        // Use event-based ID for deduplication instead of random generation
        const eventId = `${event.inner.mintUrl}-${event.inner.unit}-${event.inner.amount}-${event.mainKey}`;
        const id = `cashu-request-${eventId}`;

            // Early deduplication check before processing - use ref to get current value
            const existingRequest = pendingRequestsRef.current[id];
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
        let wallet: any;
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
                  logError('CASHU_REQUEST', 'listenCashuRequests - addWallet', error, {
                    mintUrl: requiredMintUrl,
                    unit: requiredUnit,
                  });
                }
          }

          if (!wallet) {
                // Auto-reject - wallet not found (expected behavior)
                console.log('[CASHU_REQUEST]: Auto-rejecting - wallet not found', {
                  mintUrl: requiredMintUrl,
                  unit: requiredUnit,
                });
            return new CashuResponseStatus.InsufficientFunds();
          }

          // Check if we have sufficient balance
          const balance = await wallet.getBalance();
          if (balance < requiredAmount) {
                console.log('[CASHU_REQUEST]: Auto-rejecting - insufficient balance', {
                  balance: balance.toString(),
                  requiredAmount: requiredAmount.toString(),
                  mintUrl: requiredMintUrl,
                  unit: requiredUnit,
                });
            return new CashuResponseStatus.InsufficientFunds();
          }
            } catch (error) {
              logError('CASHU_REQUEST', 'listenCashuRequests - checkWallet', error, {
                mintUrl: event.inner.mintUrl,
                unit: event.inner.unit,
                amount: event.inner.amount,
              });
          return new CashuResponseStatus.InsufficientFunds();
        }

        // Get the ticket title for pending requests
        let ticketTitle = 'Unknown Ticket';
        if (wallet) {
          let unitInfo: any;
          try {
            unitInfo = wallet.getUnitInfo ? await wallet.getUnitInfo() : undefined;
              } catch (error) {
                logError('CASHU_REQUEST', 'listenCashuRequests - getUnitInfo', error, {
                  mintUrl: event.inner.mintUrl,
                  unit: event.inner.unit,
                });
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
                  // Duplicate request - silently ignore (expected behavior)
              return prev;
            }
            return { ...prev, [id]: newRequest };
          });
        });
          } catch (error) {
            // Catch any unexpected errors and return InsufficientFunds to prevent hanging
            logError('CASHU_REQUEST', 'listenCashuRequests - unexpectedError', error, {
              mintUrl: event?.inner?.mintUrl,
              unit: event?.inner?.unit,
              amount: event?.inner?.amount,
            });
            return new CashuResponseStatus.InsufficientFunds();
          }
        })
      )
      .catch(e => {
        logError('CASHU_REQUEST', 'listenCashuRequests - setup', e);
        // Silently handle listener setup errors - don't retry to avoid infinite loops
        // The listener will be re-established on next app initialization
      });

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
      .catch(_e => {
        handleErrorWithToastAndReinit(
          'Failed to listen for authentication challenge. Retrying...',
          initializeApp
        );
      });

    app
      .listenForPaymentRequest(
        new LocalPaymentRequestListener(
          async (event: SinglePaymentRequest, notifier: PaymentStatusNotifier) => {
            const id = event.eventId;

            const alreadyTracked = await executeOperation(
              db => db.markNotificationEventProcessed(id),
              false
            );

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
                activeWallet ?? null,
                event,
                preferredCurrency,
                executeOperation,
                resolver,
                AppState.currentState !== 'active' && !alreadyTracked
              )
                .then(askUser => {
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
                        // Duplicate request - silently ignore (expected behavior)
                      return prev;
                    }
                    const newPendingRequests = { ...prev };
                    newPendingRequests[id] = newRequest;
                    return newPendingRequests;
                  });
                }
                })
                .catch(error => {
                  logError('PAYMENT_REQUEST', 'listenForPaymentRequest - handleSinglePaymentRequest', error, {
                    eventId: id,
                    alreadyTracked,
                  });
              });
            });
          },
          (event: RecurringPaymentRequest) => {
            const id = event.eventId;

            void executeOperation(db => db.markNotificationEventProcessed(id), false);

            return new Promise<RecurringPaymentResponseContent>(resolve => {
              handleRecurringPaymentRequest(event, executeOperation, resolve)
                .then(askUser => {
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
                        // Duplicate request - silently ignore (expected behavior)
                      return prev;
                    }
                    const newPendingRequests = { ...prev };
                    newPendingRequests[id] = newRequest;
                    return newPendingRequests;
                  });
                }
                })
                .catch(error => {
                  logError('RECURRING_PAYMENT', 'listenForPaymentRequest - handleRecurringPaymentRequest', error, {
                    eventId: id,
                  });
              });
            });
          }
        )
      )
      .catch(e => {
        logError('PAYMENT_REQUEST', 'listenForPaymentRequest - setup', e);
        // Don't retry on Rust panics - listeners might already be registered
        // Reset the flag so it can be retried manually if needed
        if (e?.message?.includes('panic') || e?.message?.includes('Rust')) {
          listenersInitializedRef.current = false;
          console.log('[PORTAL_APP]: Rust panic detected, resetting listener flag');
        }
        // Don't call handleErrorWithToastAndReinit to avoid infinite retry loop
      });

    // Listen for closed recurring payments
    app
      .listenClosedRecurringPayment(
        new LocalClosedRecurringPaymentListener((event: CloseRecurringPaymentResponse) => {
          return new Promise<void>(resolve => {
            handleCloseRecurringPaymentResponse(event, executeOperation, resolve);
          });
        })
      )
      .catch(e => {
        logError('AUTH_CHALLENGE', 'listenForAuthChallenge - setup', e);
      });

    app
      .listenForNip46Request(
        new LocalNip46RequestListener((event: NostrConnectRequestEvent) => {
          const id = event.id;
          return new Promise<NostrConnectResponseStatus>(resolve => {
            handleNostrConnectRequest(event, keyToHex(publicKeyStr), executeOperation, resolve)
              .then(askUser => {
              if (askUser) {
                const newRequest: PendingRequest = {
                  id,
                  metadata: event,
                  timestamp: new Date(),
                  type: 'nostrConnect',
                  result: resolve,
                };

                setPendingRequests(prev => {
                  // Check if request already exists to prevent duplicates
                  if (prev[id]) {
                      // Duplicate request - silently ignore (expected behavior)
                    return prev;
                  }
                  return { ...prev, [id]: newRequest };
                });
              }
              })
              .catch(error => {
                logError('NOSTR_CONNECT', 'listenForNip46Request - handleNostrConnectRequest', error, {
                  eventId: id,
                });
            });
          });
        })
      )
      .catch(e => {
        logError('AUTH_CHALLENGE', 'listenForAuthChallenge - setup', e);
        // Don't retry on Rust panics - listeners might already be registered
        if (e?.message?.includes('panic') || e?.message?.includes('Rust')) {
          console.log('[PORTAL_APP]: Rust panic detected in auth challenge listener');
        }
      });

    // Mark listeners as initialized after attempting all registrations
    // Note: Even if some fail, we mark as initialized to prevent retry loops
    listenersInitializedRef.current = true;
    console.log('[PORTAL_APP]: Listener initialization complete');
  }, [
    executeOperation,
    executeOnNostr,
    activeWallet,
    preferredCurrency,
    eCashContext.addWallet,
    eCashContext.getWallet,
    mnemonic,
    nsec,
    // Removed pendingRequests from dependencies - using ref instead to prevent listener re-registration
  ]);

  const dismissPendingRequest = useCallback((id: string) => {
    setPendingRequests(prev => {
      const newPendingRequests = { ...prev };
      delete newPendingRequests[id];
      return newPendingRequests;
    });
  }, []);

  useEffect(() => {
    if (!isInitialized) {
      // Reset flag when not initialized so it can be initialized again
      listenersInitializedRef.current = false;
      return;
    }
    // Only initialize once - guard prevents re-initialization
    if (!listenersInitializedRef.current) {
    initializeApp();
    }
  }, [isInitialized, initializeApp]);

  const contextValue: PortalAppProviderType = {
    pendingRequests,
    dismissPendingRequest,
  };

  return <PortalAppContext.Provider value={contextValue}>{children}</PortalAppContext.Provider>;
};

export const usePortalApp = (): PortalAppProviderType => {
  const context = React.useContext(PortalAppContext);
  if (!context) {
    throw new Error('usePortalApp must be used within a PortalAppProvider');
  }
  return context;
};
