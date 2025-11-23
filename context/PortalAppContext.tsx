import { PortalAppManager } from '@/services/PortalAppManager';
import React, { createContext, useCallback, useEffect, useState } from 'react';
import { useNostrService } from './NostrServiceContext';
import {
  AuthChallengeEvent,
  AuthChallengeListener,
  AuthResponseStatus,
  CashuDirectContentWithKey,
  CashuDirectListener,
  CashuRequestContentWithKey,
  CashuRequestListener,
  CashuResponseStatus,
  ClosedRecurringPaymentListener,
  CloseRecurringPaymentResponse,
  parseCashuToken,
  PaymentRequestListener,
  PaymentStatus,
  PaymentStatusNotifier,
  RecurringPaymentRequest,
  RecurringPaymentResponseContent,
  SinglePaymentRequest,
} from 'portal-app-lib';
import {
  handleAuthChallenge,
  handleSinglePaymentRequest,
  handleRecurringPaymentRequest,
  handleCloseRecurringPaymentResponse,
} from '@/services/EventFilters';
import { showToast, handleErrorWithToastAndReinit } from '@/utils/Toast';
import { PendingRequest } from '@/utils/types';
import { useDatabaseContext } from './DatabaseContext';
import { useWalletManager } from './WalletManagerContext';
import { useECash } from './ECashContext';
import { useCurrency } from './CurrencyContext';
import { globalEvents } from '@/utils/common';
import { AppState } from 'react-native';

class LocalCashuDirectListener implements CashuDirectListener {
  private callback: (event: CashuDirectContentWithKey) => Promise<void>;

  constructor(callback: (event: CashuDirectContentWithKey) => Promise<void>) {
    this.callback = callback;
  }

  onCashuDirect(event: CashuDirectContentWithKey): Promise<void> {
    return this.callback(event);
  }
}

class LocalCashuRequestListener implements CashuRequestListener {
  private callback: (event: CashuRequestContentWithKey) => Promise<CashuResponseStatus>;

  constructor(callback: (event: CashuRequestContentWithKey) => Promise<CashuResponseStatus>) {
    this.callback = callback;
  }

  onCashuRequest(event: CashuRequestContentWithKey): Promise<CashuResponseStatus> {
    return this.callback(event);
  }
}

class LocalAuthChallengeListener implements AuthChallengeListener {
  private callback: (event: AuthChallengeEvent) => Promise<AuthResponseStatus>;

  constructor(callback: (event: AuthChallengeEvent) => Promise<AuthResponseStatus>) {
    this.callback = callback;
  }

  onAuthChallenge(event: AuthChallengeEvent): Promise<AuthResponseStatus> {
    return this.callback(event);
  }
}

class LocalPaymentRequestListener implements PaymentRequestListener {
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

class LocalClosedRecurringPaymentListener implements ClosedRecurringPaymentListener {
  private callback: (event: CloseRecurringPaymentResponse) => Promise<void>;

  constructor(callback: (event: CloseRecurringPaymentResponse) => Promise<void>) {
    this.callback = callback;
  }
  async onClosedRecurringPayment(event: CloseRecurringPaymentResponse): Promise<void> {
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
  const { activeWallet } = useWalletManager();
  const { preferredCurrency } = useCurrency();

  const initializeApp = useCallback(() => {
    const app = PortalAppManager.tryGetInstance();

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

            await executeOnNostr(async db => {
              let mintsList = await db.readMints();

              // Convert to Set to prevent duplicates, then back to array
              const mintsSet = new Set([tokenInfo.mintUrl, ...mintsList]);
              mintsList = Array.from(mintsSet);

              db.storeMints(mintsList);
            });

            console.log('Cashu token processed successfully');

            // Emit event to notify that wallet balances have changed
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
          initializeApp
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
              console.error(`Error creating wallet for ${requiredMintUrl}-${requiredUnit}:`, error);
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
          } catch {
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
          initializeApp
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
  }, [executeOperation, executeOnNostr, activeWallet]);

  const dismissPendingRequest = useCallback((id: string) => {
    setPendingRequests(prev => {
      const newPendingRequests = { ...prev };
      delete newPendingRequests[id];
      return newPendingRequests;
    });
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    initializeApp();
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
