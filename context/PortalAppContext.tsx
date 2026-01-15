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
  CloseRecurringPaymentResponse,
  IncomingPaymentRequest_Tags,
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
  PaymentStatus,
  PortalApp,
  PortalAppInterface,
  Profile,
  RecurringPaymentRequest,
  RecurringPaymentResponseContent,
  SinglePaymentRequest,
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
import type { PendingRequest, RelayInfo } from '@/utils/types';
import { useCurrency } from './CurrencyContext';
import { useDatabaseContext } from './DatabaseContext';
import { useECash } from './ECashContext';
import { useKey } from './KeyContext';
import { useNostrService } from './NostrServiceContext';
import { useWalletManager } from './WalletManagerContext';
import { enqueueTask, ProviderRepository } from '@/queue/WorkQueue';
import { getServiceNameFromProfile } from '@/utils/nostrHelper';
import { ActivityWithDates, DatabaseService } from '@/services/DatabaseService';
import { ProcessAuthRequestTask } from '@/queue/tasks/ProcessAuthRequest';
import { PromptUserWithPendingCard } from '@/queue/providers/PromptUser';
import { HandleSinglePaymentRequestTask } from '@/queue/tasks/HandleSinglePaymentRequest';
import { HandleRecurringPaymentRequestTask } from '@/queue/tasks/HandleRecurringPaymentRequest';

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
    console.log('[PortalAppContext] Registering providers');
    ProviderRepository.register(new PromptUserWithPendingCard(setPendingRequests), 'PromptUserProvider');
    console.log('[PortalAppContext] Providers registered');
  }, [setPendingRequests]);

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
    // app
    //   .listenCashuDirect(
    //     new LocalCashuDirectListener(async (event: CashuDirectContentWithKey) => {
    //       try {
    //         // Auto-process the Cashu token (receiving tokens)
    //         const token = event.inner.token;

    //         // Check if we've already processed this token
    //         const tokenInfo = await parseCashuToken(token);

    //         // Use database service to handle connection errors
    //         const isProcessed = await executeOperation(
    //           db =>
    //             db.markCashuTokenAsProcessed(
    //               token,
    //               tokenInfo.mintUrl,
    //               tokenInfo.unit,
    //               tokenInfo.amount ? Number(tokenInfo.amount) : 0
    //             ),
    //           false
    //         );

    //         if (isProcessed === true) {
    //           return;
    //         } else if (isProcessed === null) {
    //           console.warn(
    //             'Failed to check token processing status due to database issues, proceeding cautiously'
    //           );
    //           // Continue processing but log a warning
    //         }

    //         const wallet = await eCashContext.addWallet(
    //           tokenInfo.mintUrl,
    //           tokenInfo.unit.toLowerCase()
    //         );
    //         await wallet.receiveToken(token);

    //         await executeOnNostr(async db => {
    //           let mintsList = await db.readMints();

    //           // Convert to Set to prevent duplicates, then back to array
    //           const mintsSet = new Set([tokenInfo.mintUrl, ...mintsList]);
    //           mintsList = Array.from(mintsSet);

    //           db.storeMints(mintsList);
    //         });

    //         console.log('Cashu token processed successfully');

    //         // Emit event to notify that wallet balances have changed
    //         globalEvents.emit('walletBalancesChanged', {
    //           mintUrl: tokenInfo.mintUrl,
    //           unit: tokenInfo.unit.toLowerCase(),
    //         });
    //         console.log('walletBalancesChanged event emitted');

    //         // Record activity for token receipt
    //         try {
    //           // For Cashu direct, use mint URL as service identifier
    //           const serviceKey = tokenInfo.mintUrl;
    //           const unitInfo = await wallet.getUnitInfo();
    //           const ticketTitle = unitInfo?.title || wallet.unit();

    //           // Add activity to database using ActivitiesContext directly
    //           const activity = {
    //             type: 'ticket_received' as const,
    //             service_key: serviceKey,
    //             service_name: ticketTitle, // Always use ticket title
    //             detail: ticketTitle, // Always use ticket title
    //             date: new Date(),
    //             amount: Number(tokenInfo.amount),
    //             currency: null,
    //             request_id: `cashu-direct-${Date.now()}`,
    //             subscription_id: null,
    //             status: 'neutral' as const,
    //             converted_amount: null,
    //             converted_currency: null,
    //           };

    //           // Use database service for activity recording
    //           const activityId = await executeOperation(db => db.addActivity(activity), null);

    //           if (activityId) {
    //             // Emit event for UI updates
    //             globalEvents.emit('activityAdded', activity);
    //             // Provide lightweight user feedback
    //             const amountStr = tokenInfo.amount ? ` x${Number(tokenInfo.amount)}` : '';
    //             showToast(`Ticket received: ${ticketTitle}${amountStr}`, 'success');
    //           } else {
    //             console.warn('Failed to record Cashu token activity due to database issues');
    //           }
    //         } catch (activityError) {
    //           console.error('Error recording Cashu direct activity:', activityError);
    //         }
    //       } catch (error: any) {
    //         console.error('Error processing Cashu token:', error.inner);
    //       }

    //       // Return void for direct processing
    //       return;
    //     })
    //   )
    //   .catch(e => {
    //     console.error('Error listening for Cashu direct', e);
    //     handleErrorWithToastAndReinit(
    //       'Failed to listen for Cashu direct. Retrying...',
    //       initializeApp
    //     );
    //   });

    // listener to burn tokens
    // app.listenCashuRequests(
    //   new LocalCashuRequestListener(async (event: CashuRequestContentWithKey) => {
    //     // Use event-based ID for deduplication instead of random generation
    //     const eventId = `${event.inner.mintUrl}-${event.inner.unit}-${event.inner.amount}-${event.mainKey}`;
    //     const id = `cashu-request-${eventId}`;

    //     // Early deduplication check before processing
    //     const existingRequest = pendingRequests[id];
    //     if (existingRequest) {
    //       // Return a promise that will resolve when the original request is resolved
    //       return new Promise<CashuResponseStatus>(resolve => {
    //         // Store the resolve function so it gets called when the original request completes
    //         const originalResolve = existingRequest.result;
    //         existingRequest.result = (status: CashuResponseStatus) => {
    //           resolve(status);
    //           if (originalResolve) originalResolve(status);
    //         };
    //       });
    //     }

    //     // Declare wallet in outer scope
    //     let wallet;
    //     // Check if we have the required unit before creating pending request
    //     try {
    //       const requiredMintUrl = event.inner.mintUrl;
    //       const requiredUnit = event.inner.unit.toLowerCase(); // Normalize unit name
    //       const requiredAmount = event.inner.amount;

    //       // Check if we have a wallet for this mint and unit
    //       wallet = await eCashContext.getWallet(requiredMintUrl, requiredUnit);

    //       // If wallet not found in ECashContext, try to create it
    //       if (!wallet) {
    //         try {
    //           wallet = await eCashContext.addWallet(requiredMintUrl, requiredUnit);
    //         } catch (error) {
    //           console.error(`Error creating wallet for ${requiredMintUrl}-${requiredUnit}:`, error);
    //         }
    //       }

    //       if (!wallet) {
    //         return new CashuResponseStatus.InsufficientFunds();
    //       }

    //       // Check if we have sufficient balance
    //       const balance = await wallet.getBalance();
    //       if (balance < requiredAmount) {
    //         return new CashuResponseStatus.InsufficientFunds();
    //       }
    //     } catch (error) {
    //       console.error('Error checking wallet availability:', error);
    //       return new CashuResponseStatus.InsufficientFunds();
    //     }

    //     // Get the ticket title for pending requests
    //     let ticketTitle = 'Unknown Ticket';
    //     if (wallet) {
    //       let unitInfo;
    //       try {
    //         unitInfo = wallet.getUnitInfo ? await wallet.getUnitInfo() : undefined;
    //       } catch {
    //         unitInfo = undefined;
    //       }
    //       ticketTitle = unitInfo?.title || wallet.unit();
    //     }
    //     return new Promise<CashuResponseStatus>(resolve => {
    //       const newRequest: PendingRequest = {
    //         id,
    //         metadata: event,
    //         timestamp: new Date(),
    //         type: 'ticket',
    //         result: resolve,
    //         ticketTitle, // Set the ticket name for UI
    //       };
    //       setPendingRequests(prev => {
    //         // Check if request already exists to prevent duplicates
    //         if (prev[id]) {
    //           return prev;
    //         }
    //         return { ...prev, [id]: newRequest };
    //       });
    //     });
    //   })
    // );

    /**
     * these logic go inside the new listeners that will be implemented
     */
    // end
    (async () => {
      while (true) {
        try {
          let event = await app.nextAuthChallenge();
          const id = event.eventId;
          const task = new ProcessAuthRequestTask(event);
          console.log('[PortalAppContext] Enqueuing ProcessAuthRequestTask for request:', id);
          enqueueTask(task);
        } catch (error) {
          console.error('[PortalAppContext] Error running task', error);
        }
      }
    })();

    (async () => {
      while (true) {
        try {
          const event = (await app.nextPaymentRequest());
          switch (event.tag) {
            case IncomingPaymentRequest_Tags.Single: {
              const singlePaymentRequest = event.inner[0] as SinglePaymentRequest;
              const task = await new HandleSinglePaymentRequestTask(singlePaymentRequest)
              console.log('[PortalAppContext] Enqueuing HandleSinglePaymentRequestTask for request:', singlePaymentRequest.eventId);
              enqueueTask(task);
              break;
            }
            case IncomingPaymentRequest_Tags.Recurring: {
              const recurringPaymentRequest = event.inner[0] as RecurringPaymentRequest;
              const task = await new HandleRecurringPaymentRequestTask(recurringPaymentRequest)
              console.log('[PortalAppContext] Enqueuing HandleRecurringPaymentRequestTask for request:', recurringPaymentRequest.eventId);
              enqueueTask(task);
              break;
            }
          }
          const id = event.inner[0].eventId;
        } catch (error) {
          console.error('[PortalAppContext] Error running task', error);
        }
      }
    })();

    // Listen for closed recurring payments
    // app
    //   .listenClosedRecurringPayment(
    //     new LocalClosedRecurringPaymentListener((event: CloseRecurringPaymentResponse) => {
    //       console.log('Closed subscription received', event);
    //       return new Promise<void>(resolve => {
    //         handleCloseRecurringPaymentResponse(event, executeOperation, resolve);
    //       });
    //     })
    //   )
    //   .catch(e => {
    //     console.error('Error listening for recurring payments closing.', e);
    //   });

    // app
    //   .listenForNip46Request(
    //     new LocalNip46RequestListener((event: NostrConnectRequestEvent) => {
    //       const id = event.id;
    //       return new Promise<NostrConnectResponseStatus>(resolve => {
    //         handleNostrConnectRequest(
    //           event,
    //           keyToHex(publicKeyStr),
    //           executeOperation,
    //           resolve
    //         ).then(askUser => {
    //           if (askUser) {
    //             const newRequest: PendingRequest = {
    //               id,
    //               metadata: event,
    //               timestamp: new Date(),
    //               type: 'nostrConnect',
    //               result: resolve,
    //             };

    //             setPendingRequests(prev => {
    //               // Check if request already exists to prevent duplicates
    //               if (prev[id]) {
    //                 return prev;
    //               }
    //               return { ...prev, [id]: newRequest };
    //             });
    //           }
    //         });
    //       });
    //     })
    //   )
    //   .catch(e => {
    //     console.error('Error listening for nip46 requests.', e);
    //   });
  }, [executeOperation, executeOnNostr, activeWallet, preferredCurrency]);

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
