import type React from 'react';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
  useMemo,
  useCallback,
} from 'react';
import type {
  KeyHandshakeUrl,
  PaymentResponseContent,
  RecurringPaymentRequest,
  SinglePaymentRequest,
} from 'portal-app-lib';
import {
  PaymentStatus,
  RecurringPaymentStatus,
  AuthResponseStatus,
  CashuResponseStatus,
  parseCashuToken,
  parseCalendar,
} from 'portal-app-lib';
import { useSQLiteContext } from 'expo-sqlite';
import { DatabaseService, fromUnixSeconds } from '@/services/database';
import { useDatabaseStatus } from '@/services/database/DatabaseProvider';
import { useActivities } from '@/context/ActivitiesContext';
import { useNostrService } from '@/context/NostrServiceContext';
import { useECash } from '@/context/ECashContext';
import type {
  PendingRequest,
  PendingRequestType,
  PendingActivity,
  PendingSubscription,
} from '@/utils/types';

// Helper function to get service name with fallback
const getServiceNameWithFallback = async (
  nostrService: any,
  serviceKey: string
): Promise<string> => {
  try {
    const serviceName = await nostrService.getServiceName(serviceKey);
    return serviceName || 'Unknown Service';
  } catch (error) {
    console.error('Failed to fetch service name:', error);
    return 'Unknown Service';
  }
};
// Note: PendingActivity and PendingSubscription are now imported from centralized types

interface PendingRequestsContextType {
  getByType: (type: PendingRequestType) => PendingRequest[];
  getById: (id: string) => PendingRequest | undefined;
  approve: (id: string) => void;
  deny: (id: string) => void;
  isLoadingRequest: boolean;
  requestFailed: boolean;
  pendingUrl: KeyHandshakeUrl | undefined;
  showSkeletonLoader: (parsedUrl: KeyHandshakeUrl) => void;
  setRequestFailed: (failed: boolean) => void;
}

const PendingRequestsContext = createContext<PendingRequestsContextType | undefined>(undefined);

export const PendingRequestsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Use preloaded data to avoid loading delay on mount
  const [isLoadingRequest, setIsLoadingRequest] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<KeyHandshakeUrl | undefined>(undefined);
  const [requestFailed, setRequestFailed] = useState(false);
  const [timeoutId, setTimeoutId] = useState<number | null>(null);

  // Create database instance for adding activities, but handle case where it's not ready
  const [db, setDb] = useState<DatabaseService | null>(null);

  // Queue for activities that couldn't be recorded due to DB not being ready
  const [pendingActivities, setPendingActivities] = useState<PendingActivity[]>([]);
  const [pendingSubscriptions, setPendingSubscriptions] = useState<PendingSubscription[]>([]);
  // Get database initialization status
  const dbStatus = useDatabaseStatus();
  const nostrService = useNostrService();
  const eCashContext = useECash();

  // Get SQLite context - this is now safe because we've reordered the providers in _layout.tsx
  let sqliteContext = null;
  try {
    // This will only be accessed when the SQLiteProvider is available
    sqliteContext = dbStatus.shouldInitDb && dbStatus.isDbInitialized ? useSQLiteContext() : null;
  } catch (error) {
    console.log('SQLite context not available yet:', error);
  }

  // Get the refreshData function from ActivitiesContext
  const { refreshData } = useActivities();

  // Initialize DB when SQLite context is available
  useEffect(() => {
    if (!sqliteContext || !dbStatus.shouldInitDb || !dbStatus.isDbInitialized) {
      console.log('Database prerequisites not met, waiting...');
      return;
    }

    try {
      console.log('Initializing DatabaseService in PendingRequestsContext');
      const databaseService = new DatabaseService(sqliteContext);
      setDb(databaseService);
    } catch (error) {
      console.error('Failed to initialize DatabaseService:', error);
      setDb(null);
    }
  }, [sqliteContext, dbStatus.shouldInitDb, dbStatus.isDbInitialized]);

  // Process any pending activities when DB becomes available
  useEffect(() => {
    const processPendingActivities = async () => {
      if (!db || pendingActivities.length === 0) return;

      console.log(`Processing ${pendingActivities.length} pending activities`);

      const activitiesToProcess = [...pendingActivities];
      setPendingActivities([]); // Clear the queue

      for (const activity of activitiesToProcess) {
        try {
          await db.addActivity(activity);
          console.log('Successfully recorded delayed activity:', activity.type);
        } catch (error) {
          console.error('Failed to record delayed activity:', error);
          // Re-queue failed activities
          setPendingActivities(prev => [...prev, activity]);
        }
      }

      // Refresh data after processing pending activities
      refreshData();
    };

    processPendingActivities();
  }, [db, pendingActivities, refreshData]);

  // Helper function to add an activity with fallback to queue
  const addActivityWithFallback = async (activity: PendingActivity): Promise<string> => {
    const id = await db!.addActivity(activity);
    refreshData();

    return id;
  };

  // Helper function to add a subscription with fallback to queue
  const addSubscriptionWithFallback = useCallback(
    (subscription: PendingSubscription): Promise<string | undefined> => {
      if (!db) {
        console.log('Database not ready, queuing subscription for later recording');
        setPendingSubscriptions(prev => [...prev, subscription]);
        return Promise.resolve(undefined);
      }

      try {
        console.log('Adding subscription to database:', subscription.request_id);
        return db.addSubscription(subscription).then(id => {
          // Refresh subscriptions data after adding a new subscription
          refreshData();
          return id;
        });
      } catch (error) {
        console.error('Exception while trying to record subscription, queuing for later:', error);
        setPendingSubscriptions(prev => [...prev, subscription]);
      }

      return Promise.resolve(undefined);
    },
    [db, refreshData]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [timeoutId]);

  // Memoize these functions to prevent recreation on every render
  const getByType = useCallback(
    (type: PendingRequestType) => {
      return Object.values(nostrService.pendingRequests).filter(request => request.type === type);
    },
    [nostrService.pendingRequests]
  );

  const getById = useCallback(
    (id: string) => {
      console.log(nostrService.pendingRequests);
      return nostrService.pendingRequests[id];
    },
    [nostrService.pendingRequests]
  );

  // Process automatic payments
  useEffect(() => {
    for (const request of Object.values(nostrService.pendingRequests)) {
      if (
        request.type === 'payment' &&
        (request.metadata as SinglePaymentRequest).content.subscriptionId
      ) {
        const paymentRequest = request.metadata as SinglePaymentRequest;
        console.log(
          'Processing automated payment for subscription',
          paymentRequest.content.subscriptionId
        );

        (async () => {
          const notifier = request.result as (status: PaymentStatus) => Promise<void>;

          const subscription = await db!.getSubscription(paymentRequest.content.subscriptionId!);
          if (!subscription) {
            await notifier(new PaymentStatus.Rejected({
              reason: 'Subscription not found',
            }));

            return;
          } else if (subscription.status === 'cancelled') {
            await notifier(new PaymentStatus.Rejected({
              reason: 'Subscription cancelled',
            }));

            return;
          } else if (subscription.status === 'expired') {
            await notifier(new PaymentStatus.Rejected({
              reason: 'Subscription expired',
            }));

            return;
          }
          console.log('Subscription found!');

          // We don't need to check the amount here, it will be validated inside the listener
          if (BigInt(subscription.amount) !== (paymentRequest.content.amount / 1000n)) {
            await notifier(new PaymentStatus.Rejected({
              reason: 'Subscription amount mismatch',
            }));
            return;
          }
          console.log('Amount matches');

          // TODO: this is used in the upcoming payments section too, we should move it to a helper function
          const parsedCalendar = parseCalendar(subscription.recurrence_calendar);
          const nextPayment =
            subscription.recurrence_first_payment_due > new Date() || !subscription.last_payment_date
              ? subscription.recurrence_first_payment_due
              : fromUnixSeconds(
                  parsedCalendar.nextOccurrence(
                    BigInt((subscription.last_payment_date?.getTime() ?? 0) / 1000)
                  ) ?? 0
                );
          if (nextPayment > new Date()) {
            await notifier(new PaymentStatus.Rejected({
              reason: 'Subscription not due yet',
            }));
            return;
          }
          console.log('Subscription is due');

          console.log('Proceeding with payment');
          await notifier(new PaymentStatus.Approved());

          let serviceName = 'Unknown Service';
          try {
            const fetchedName = await nostrService.getServiceName(paymentRequest.serviceKey);
            serviceName = fetchedName || 'Unknown Service';
          } catch (e) {
            console.error('Error getting service name:', e);
          }
          const id = await addActivityWithFallback({
            type: 'pay',
            service_key: paymentRequest.serviceKey,
            service_name: serviceName,
            detail: 'Subscription payment approved',
            date: new Date(),
            amount: Number(paymentRequest.content.amount) / 1000,
            currency: 'sats',
            request_id: paymentRequest.content.requestId,
            subscription_id: subscription.id,
            status: 'pending',
            invoice: paymentRequest.content.invoice,
          });

          // Insert into payment_status table
          await db!.addPaymentStatusEntry(
            paymentRequest.content.invoice,
            'payment_started',
          );

          // TODO: we should check that we are not trying to pay this twice at the same time

          try {
            const preimage = await nostrService.payInvoice(paymentRequest.content.invoice);
            await db!.addPaymentStatusEntry(
              paymentRequest.content.invoice,
              'payment_completed',
            );

            // Update the subscription last payment date
            await db!.updateSubscriptionLastPayment(subscription.id, new Date());

            // Update the activity status to positive
            await db!.updateActivityStatus(id, 'positive');
            refreshData();

            await notifier(new PaymentStatus.Success({
              preimage,
            }));
          } catch (error) {
            console.error('Error paying invoice:', error);

            await db!.addPaymentStatusEntry(
              paymentRequest.content.invoice,
              'payment_failed',
            );

            // Update the activity status to negative
            await db!.updateActivityStatus(id, 'negative');
            refreshData();

            await notifier(new PaymentStatus.Failed({
              reason: 'Payment failed: ' + error,
            }));

            // TODO: notify user??
            return;
          }
        })()
          .catch(err => {
            console.error('Error processing automated payment:', err);
          });

        nostrService.dismissPendingRequest(request.id);
      }
    }
  }, [nostrService.pendingRequests, addActivityWithFallback, db, nostrService]);

  const approve = useCallback(
    async (id: string) => {
      console.log('Approve', id);

      const request = getById(id);
      if (!request) {
        console.log('Request not found', id);
        return;
      }

      nostrService.dismissPendingRequest(id);
      db?.storePendingRequest(id, true);

      switch (request.type) {
        case 'login':
          // Create AuthResponseStatus for approved login using type assertion
          const approvedAuthResponse = new AuthResponseStatus.Approved({
            grantedPermissions: [],
            sessionToken: nostrService.issueJWT!(
              (request.metadata as SinglePaymentRequest).serviceKey,
              168n
            ),
          });
          request.result(approvedAuthResponse);

          // Add an activity record directly via the database service
          getServiceNameWithFallback(
            nostrService,
            (request.metadata as SinglePaymentRequest).serviceKey
          ).then(serviceName => {
            addActivityWithFallback({
              type: 'auth',
              service_key: (request.metadata as SinglePaymentRequest).serviceKey,
              detail: 'User approved login',
              date: new Date(),
              service_name: serviceName,
              amount: null,
              currency: null,
              request_id: id,
              subscription_id: null,
              status: 'positive',
            });
          });
          break;
        case 'payment':
          const notifier = request.result as (status: PaymentStatus) => Promise<void>;
          const metadata = request.metadata as SinglePaymentRequest;

          (async () => {
            const serviceName = await getServiceNameWithFallback(
              nostrService,
              metadata.serviceKey
            );

            // Convert BigInt to number if needed
            const amount =
              typeof metadata.content.amount === 'bigint'
                ? Number(metadata.content.amount)
                : metadata.content.amount;

            // Extract currency symbol from the Currency object
            let currency: string | null = null;
            const currencyObj = metadata.content.currency;
            if (currencyObj) {
              // If it's a simple string, use it directly
              if (typeof currencyObj === 'string') {
                currency = currencyObj;
              } else {
                currency = 'sats';
              }
            }

            const activityId = await addActivityWithFallback({
              type: 'pay',
              service_key: metadata.serviceKey,
              service_name: serviceName,
              detail: 'Payment approved',
              date: new Date(),
              amount: Number(amount) / 1000,
              currency,
              request_id: id,
              subscription_id: null,
              status: 'pending',
              invoice: metadata.content.invoice,
            });

            // Notify the approval
            await notifier(new PaymentStatus.Approved());

            // Insert into payment_status table
            await db!.addPaymentStatusEntry(
              metadata.content.invoice,
              'payment_started',
            );

            try {
              const preimage = await nostrService.payInvoice(metadata.content.invoice);

              await db!.addPaymentStatusEntry(
                metadata.content.invoice,
                'payment_completed',
              );

              // Update the activity status to positive
              await db!.updateActivityStatus(activityId, 'positive');
              refreshData();

              await notifier(new PaymentStatus.Success({
                preimage,
              }));

            } catch (err) {
              console.log('Error paying invoice:', err);

              await db!.addPaymentStatusEntry(
                metadata.content.invoice,
                'payment_failed',
              );

              // Update the activity status to negative
              await db!.updateActivityStatus(activityId, 'negative');
              refreshData();

              await notifier(new PaymentStatus.Failed({
                reason: 'Payment failed: ' + err,
              }));
            }
          })()
            .catch(err => {
              console.log('Error processing payment:', err);
            });
          break;
        case 'subscription':
          // Add subscription activity
          try {
            // Convert BigInt to number if needed
            const req = request.metadata as RecurringPaymentRequest;
            const amount =
              typeof req.content.amount === 'bigint'
                ? Number(req.content.amount)
                : req.content.amount;

            // Extract currency symbol from the Currency object
            const currencyObj = req.content.currency;

            (async () => {
              const serviceName = await getServiceNameWithFallback(
                nostrService,
                (request.metadata as RecurringPaymentRequest).serviceKey
              );

              const subscriptionId = await addSubscriptionWithFallback({
                  request_id: id,
                  service_name: serviceName,
                  service_key: (request.metadata as RecurringPaymentRequest).serviceKey,
                  amount: Number(amount) / 1000,
                  currency: 'sats',
                  status: 'active',
                  recurrence_until: req.content.recurrence.until
                    ? fromUnixSeconds(req.content.recurrence.until)
                    : null,
                  recurrence_first_payment_due: fromUnixSeconds(
                    req.content.recurrence.firstPaymentDue
                  ),
                  last_payment_date: null,
                  next_payment_date: fromUnixSeconds(req.content.recurrence.firstPaymentDue),
                  recurrence_calendar: req.content.recurrence.calendar.inner.toCalendarString(),
                  recurrence_max_payments: req.content.recurrence.maxPayments || null,
                });

                // TODO: we should not add a "pay" activity here, we need a new "subscription" type
                // if (subscriptionId) {
                //   await addActivityWithFallback({
                //     type: 'pay',
                //     service_key: (request.metadata as RecurringPaymentRequest).serviceKey,
                //     service_name: serviceName,
                //     detail: 'Subscription approved',
                //     date: new Date(),
                //     amount: Number(amount) / 1000,
                //     currency: 'sats',
                //     request_id: id,
                //     subscription_id: subscriptionId,
                //     status: 'positive',
                //   });
                // }

                // Return the result with the subscriptionId
                request.result({
                  status: new RecurringPaymentStatus.Confirmed({
                    subscriptionId: subscriptionId || 'randomsubscriptionid',
                    authorizedAmount: (request.metadata as RecurringPaymentRequest).content.amount,
                    authorizedCurrency: (request.metadata as RecurringPaymentRequest).content
                      .currency,
                    authorizedRecurrence: (request.metadata as RecurringPaymentRequest).content
                      .recurrence,
                  }),
                  requestId: (request.metadata as RecurringPaymentRequest).content.requestId,
                });
            })().catch(err => {
                console.log('Error processing subscription:', err);
              });
          } catch (err) {
            console.log('Error adding subscription activity:', err);
          }
          break;
        case 'ticket':
          // Handle Cashu requests (sending tokens only)
          try {
            const cashuEvent = request.metadata as any;

            // Only handle Cashu request events (sending tokens)
            if (cashuEvent.inner?.mintUrl && cashuEvent.inner?.amount) {
              console.log('Processing Cashu request approval');

              // Get the wallet from ECash context
              const wallet = await eCashContext.getWallet(
                cashuEvent.inner.mintUrl,
                cashuEvent.inner.unit
              );
              if (!wallet) {
                console.error('No wallet available for Cashu request');
                request.result(new CashuResponseStatus.Rejected({ reason: 'No wallet available' }));
                return;
              }

              // Get the amount from the request
              const amount = cashuEvent.inner.amount;
              const walletBalance = await wallet.getBalance();
              if (walletBalance < amount) {
                request.result(new CashuResponseStatus.InsufficientFunds());
                return;
              }

              // Send tokens from the wallet
              const token = await wallet.sendAmount(amount);

              // Emit event to notify that wallet balances have changed
              const { globalEvents } = await import('@/utils/index');
              globalEvents.emit('walletBalancesChanged', {
                mintUrl: cashuEvent.inner.mintUrl,
                unit: cashuEvent.inner.unit,
              });
              console.log('walletBalancesChanged event emitted for Cashu send');

              // Add activity for token send
              console.log(
                'Approved ticket - available wallets:',
                Object.keys(eCashContext.wallets)
              );
              console.log('Looking for wallet with mintUrl:', cashuEvent.inner.mintUrl);

              // Try to find the wallet by mintUrl
              let ticketWallet = eCashContext.wallets[cashuEvent.inner.mintUrl];
              if (!ticketWallet) {
                // Try to find by any wallet that matches the unit
                const walletEntries = Object.entries(eCashContext.wallets);
                const matchingWallet = walletEntries.find(
                  ([_, wallet]) => wallet.unit() === cashuEvent.inner.unit
                );
                if (matchingWallet) {
                  ticketWallet = matchingWallet[1];
                  console.log('Found wallet by unit match:', matchingWallet[0]);
                }
              }

              console.log('Found wallet:', !!ticketWallet);
              const unitInfo =
                ticketWallet && ticketWallet.getUnitInfo
                  ? await ticketWallet.getUnitInfo()
                  : undefined;
              const ticketTitle =
                unitInfo?.title ||
                (ticketWallet ? ticketWallet.unit() : cashuEvent.inner.unit || 'Unknown Ticket');
              console.log('Ticket title for approved:', ticketTitle);

              addActivityWithFallback({
                type: 'ticket_approved',
                service_key: cashuEvent.serviceKey || 'Unknown Service',
                service_name: ticketTitle, // Use ticket title as service name
                detail: ticketTitle, // Use ticket title as detail
                date: new Date(),
                amount: Number(amount), // Store actual number of tickets, not divided by 1000
                currency: 'sats',
                request_id: id,
                subscription_id: null,
                status: 'positive',
              });

              console.log('Cashu token sent successfully');
              request.result(new CashuResponseStatus.Success({ token }));
            } else {
              console.error('Invalid Cashu request event type');
              request.result(
                new CashuResponseStatus.Rejected({ reason: 'Invalid Cashu request type' })
              );
            }
          } catch (error: any) {
            console.error('Error processing Cashu request:', error);
            request.result(
              new CashuResponseStatus.Rejected({
                reason: error.message || 'Failed to process Cashu request',
              })
            );
          }
          break;
      }
    },
    [getById, addActivityWithFallback, addSubscriptionWithFallback, nostrService, eCashContext]
  );

  const deny = useCallback(
    async (id: string) => {
      console.log('Deny', id);

      const request = getById(id);
      if (!request) {
        console.log('Request not found', id);
        return;
      }

      nostrService.dismissPendingRequest(id);
      db?.storePendingRequest(id, false);

      switch (request?.type) {
        case 'login':
          // Create AuthResponseStatus for denied login using type assertion
          const deniedAuthResponse = new AuthResponseStatus.Declined({
            reason: 'Not approved by user',
          });
          request.result(deniedAuthResponse);

          // Add denied login activity to database
          getServiceNameWithFallback(
            nostrService,
            (request.metadata as SinglePaymentRequest).serviceKey
          ).then(serviceName => {
            addActivityWithFallback({
              type: 'auth',
              service_key: (request.metadata as SinglePaymentRequest).serviceKey,
              detail: 'User denied login',
              date: new Date(),
              service_name: serviceName,
              amount: null,
              currency: null,
              request_id: id,
              subscription_id: null,
              status: 'negative',
            });
          });
          break;
        case 'payment':
          const notifier = request.result as (status: PaymentStatus) => Promise<void>;

          // Add denied payment activity to database
          try {
            // Convert BigInt to number if needed
            const amount =
              typeof (request.metadata as SinglePaymentRequest).content.amount === 'bigint'
                ? Number((request.metadata as SinglePaymentRequest).content.amount)
                : (request.metadata as SinglePaymentRequest).content.amount;

            // Extract currency symbol from the Currency object
            let currency: string | null = null;
            const currencyObj = (request.metadata as SinglePaymentRequest).content.currency;
            if (currencyObj) {
              // If it's a simple string, use it directly
              if (typeof currencyObj === 'string') {
                currency = currencyObj;
              } else {
                currency = 'sats';
              }
            }

            Promise.all([
              notifier(new PaymentStatus.Rejected({ reason: 'User rejected' })),
              getServiceNameWithFallback(
                nostrService,
                (request.metadata as SinglePaymentRequest).serviceKey
              ).then(serviceName => {
                return addActivityWithFallback({
                  type: 'pay',
                  service_key: (request.metadata as SinglePaymentRequest).serviceKey,
                  service_name: serviceName,
                  detail: 'Payment denied by user',
                  date: new Date(),
                  amount: Number(amount) / 1000,
                  currency,
                  request_id: id,
                  subscription_id: null,
                  status: 'negative',
                  invoice: (request.metadata as SinglePaymentRequest).content.invoice,
                });
              })
            ]);
          } catch (err) {
            console.log('Error adding denied payment activity:', err);
          }
          break;
        case 'subscription':
          request.result({
            status: new RecurringPaymentStatus.Rejected({
              reason: 'User rejected',
            }),
            requestId: (request.metadata as RecurringPaymentRequest).content.requestId,
          });

          // TODO: same as for the approve, we shouldn't add a "pay" activity for a rejected subscription
          // Add denied subscription activity to database
          // try {
          //   // Convert BigInt to number if needed
          //   const amount =
          //     typeof (request.metadata as RecurringPaymentRequest).content.amount === 'bigint'
          //       ? Number((request.metadata as RecurringPaymentRequest).content.amount)
          //       : (request.metadata as RecurringPaymentRequest).content.amount;

          //   // Extract currency symbol from the Currency object
          //   let currency: string | null = null;
          //   const currencyObj = (request.metadata as RecurringPaymentRequest).content.currency;
          //   if (currencyObj) {
          //     // If it's a simple string, use it directly
          //     if (typeof currencyObj === 'string') {
          //       currency = currencyObj;
          //     } else {
          //       currency = 'sats';
          //     }
          //   }

          //   getServiceNameWithFallback(
          //     nostrService,
          //     (request.metadata as RecurringPaymentRequest).serviceKey
          //   ).then(serviceName => {
          //     addActivityWithFallback({
          //       type: 'pay',
          //       service_key: (request.metadata as RecurringPaymentRequest).serviceKey,
          //       service_name: serviceName,
          //       detail: 'Subscription denied by user',
          //       date: new Date(),
          //       amount: Number(amount) / 1000,
          //       currency,
          //       request_id: id,
          //       subscription_id: null,
          //       status: 'negative',
          //     });
          //   });
          // } catch (err) {
          //   console.log('Error adding denied subscription activity:', err);
          // }
          break;
        case 'ticket':
          // Handle Cashu request denial (sending tokens only)
          try {
            const cashuEvent = request.metadata as any;

            // Only handle Cashu request events (sending tokens)
            if (cashuEvent.inner?.mintUrl && cashuEvent.inner?.amount) {
              console.log('Cashu request denied by user');

              // Add activity for denied token send
              console.log('Denied ticket - available wallets:', Object.keys(eCashContext.wallets));
              console.log('Looking for wallet with mintUrl:', cashuEvent.inner.mintUrl);

              // Try to find the wallet by mintUrl
              let ticketWallet = eCashContext.wallets[cashuEvent.inner.mintUrl];
              if (!ticketWallet) {
                // Try to find by any wallet that matches the unit
                const walletEntries = Object.entries(eCashContext.wallets);
                const matchingWallet = walletEntries.find(
                  ([_, wallet]) => wallet.unit() === cashuEvent.inner.unit
                );
                if (matchingWallet) {
                  ticketWallet = matchingWallet[1];
                  console.log('Found wallet by unit match:', matchingWallet[0]);
                }
              }

              console.log('Found wallet:', !!ticketWallet);
              const deniedUnitInfo =
                ticketWallet && ticketWallet.getUnitInfo
                  ? await ticketWallet.getUnitInfo()
                  : undefined;
              const deniedTicketTitle =
                deniedUnitInfo?.title ||
                (ticketWallet ? ticketWallet.unit() : cashuEvent.inner.unit || 'Unknown Ticket');
              console.log('Ticket title for denied:', deniedTicketTitle);

              addActivityWithFallback({
                type: 'ticket_denied',
                service_key: cashuEvent.serviceKey || 'Unknown Service',
                service_name: deniedTicketTitle, // Use ticket title as service name
                detail: deniedTicketTitle, // Use ticket title as detail
                date: new Date(),
                amount: Number(cashuEvent.inner.amount), // Store actual number of tickets, not divided by 1000
                currency: 'sats',
                request_id: id,
                subscription_id: null,
                status: 'negative',
              });

              request.result(new CashuResponseStatus.Rejected({ reason: 'User denied request' }));
            } else {
              console.error('Invalid Cashu request event type for denial');
              request.result(
                new CashuResponseStatus.Rejected({ reason: 'Invalid Cashu request type' })
              );
            }
          } catch (error: any) {
            console.error('Error processing Cashu denial:', error);
            request.result(
              new CashuResponseStatus.Rejected({
                reason: error.message || 'Failed to process Cashu denial',
              })
            );
          }
          break;
      }
    },
    [getById, addActivityWithFallback, nostrService]
  );

  // Show skeleton loader and set timeout for request
  const showSkeletonLoader = useCallback(
    (parsedUrl: KeyHandshakeUrl) => {
      // Clean up any existing timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      setIsLoadingRequest(true);
      setPendingUrl(parsedUrl);
      setRequestFailed(false);

      // Set new timeout for 10 seconds
      const newTimeoutId = setTimeout(() => {
        setIsLoadingRequest(false);
        setRequestFailed(true);
      }, 10000);

      setTimeoutId(newTimeoutId);
    },
    [timeoutId]
  );

  const cancelSkeletonLoader = useCallback(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    setIsLoadingRequest(false);
    setRequestFailed(false);
  }, [timeoutId]);

  // Check for expected pending requests and clear skeleton loader
  useEffect(() => {
    // Check for removing skeleton when we get the expected request
    for (const request of Object.values(nostrService.pendingRequests)) {
      if ((request.metadata as SinglePaymentRequest).serviceKey === pendingUrl?.mainKey) {
        // Clear timeout and reset loading states directly to avoid dependency issues
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        setIsLoadingRequest(false);
        setRequestFailed(false);
      }
    }
  }, [nostrService.pendingRequests, pendingUrl, timeoutId]);

  // Memoize the context value to prevent recreation on every render
  const contextValue = useMemo(
    () => ({
      getByType,
      getById,
      approve,
      deny,
      isLoadingRequest,
      requestFailed,
      pendingUrl,
      showSkeletonLoader,
      setRequestFailed,
    }),
    [
      getByType,
      getById,
      approve,
      deny,
      isLoadingRequest,
      requestFailed,
      pendingUrl,
      showSkeletonLoader,
      setRequestFailed,
    ]
  );

  return (
    <PendingRequestsContext.Provider value={contextValue}>
      {children}
    </PendingRequestsContext.Provider>
  );
};

export const usePendingRequests = () => {
  const context = useContext(PendingRequestsContext);
  if (context === undefined) {
    throw new Error('usePendingRequests must be used within a PendingRequestsProvider');
  }
  return context;
};
