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
import type { PendingRequest, PendingRequestType } from '../models/PendingRequest';
import type {
  KeyHandshakeUrl,
  PaymentResponseContent,
  Profile,
  RecurringPaymentRequest,
  RecurringPaymentResponseContent,
  SinglePaymentRequest,
} from 'portal-app-lib';
import { PaymentStatus, RecurringPaymentStatus, AuthResponseStatus } from 'portal-app-lib';
import { useSQLiteContext } from 'expo-sqlite';
import { DatabaseService, fromUnixSeconds } from '@/services/database';
import type { ActivityWithDates, SubscriptionWithDates } from '@/services/database';
import { useDatabaseStatus } from '@/services/database/DatabaseProvider';
import { useActivities } from '@/context/ActivitiesContext';
import { useNostrService } from '@/context/NostrServiceContext';

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
// Define a type for pending activities
type PendingActivity = Omit<ActivityWithDates, 'id' | 'created_at'>;
type PendingSubscription = Omit<SubscriptionWithDates, 'id' | 'created_at'>;

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
  const [resolvers, setResolvers] = useState<
    Map<string, (value: boolean | PaymentResponseContent | RecurringPaymentResponseContent) => void>
  >(new Map());

  // Create database instance for adding activities, but handle case where it's not ready
  const [db, setDb] = useState<DatabaseService | null>(null);

  // Queue for activities that couldn't be recorded due to DB not being ready
  const [pendingActivities, setPendingActivities] = useState<PendingActivity[]>([]);
  const [pendingSubscriptions, setPendingSubscriptions] = useState<PendingSubscription[]>([]);
  // Get database initialization status
  const dbStatus = useDatabaseStatus();
  const nostrService = useNostrService();

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
  const addActivityWithFallback = useCallback(
    (activity: PendingActivity) => {
      if (!db) {
        console.log('Database not ready, queuing activity for later recording');
        setPendingActivities(prev => [...prev, activity]);
        return;
      }

      try {
        console.log('Adding activity to database:', activity.type);
        db.addActivity(activity)
          .then(() => {
            console.log('Activity recorded successfully:', activity.type);
            // Refresh activities data after adding a new activity
            refreshData();
          })
          .catch(err => {
            console.error('Error recording activity, queuing for later:', err);
            setPendingActivities(prev => [...prev, activity]);
          });
      } catch (error) {
        console.error('Exception while trying to record activity, queuing for later:', error);
        setPendingActivities(prev => [...prev, activity]);
      }
    },
    [db, refreshData]
  );

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

        async function processPayment() {
          const subscription = await db!.getSubscription(paymentRequest.content.subscriptionId!);
          if (!subscription) {
            request.result({
              status: new PaymentStatus.Rejected({
                reason: 'Subscription not found',
              }),
              requestId: paymentRequest.content.requestId,
            });

            return;
          }
          console.log('Subscription found!');

          // TODO: check amount

          request.result({
            status: new PaymentStatus.Pending(),
            requestId: paymentRequest.content.requestId,
          });

          let preimage: string | null = null;
          try {
            preimage = await nostrService.payInvoice(paymentRequest.content.invoice);
            if (!preimage) {
              // TODO: save failed payment??
              // TODO: notify user??
              return;
            }
          } catch (error) {
            console.error('Error paying invoice:', error);
            // TODO: save failed payment??
            // TODO: notify user??
            return;
          }
          console.log('Preimage: ', preimage);

          // Update the subscription last payment date
          await db!.updateSubscriptionLastPayment(subscription.id, new Date());

          let serviceName = 'Unknown Service';
          try {
            const fetchedName = await nostrService.getServiceName(paymentRequest.serviceKey);
            serviceName = fetchedName || 'Unknown Service';
          } catch (e) {
            console.error('Error getting service name:', e);
          }

          addActivityWithFallback({
            type: 'pay',
            service_key: paymentRequest.serviceKey,
            service_name: serviceName,
            detail: 'Payment approved',
            date: new Date(),
            amount: Number(paymentRequest.content.amount) / 1000,
            currency: 'sats',
            request_id: paymentRequest.content.requestId,
            subscription_id: subscription.id,
          });
        }

        processPayment();
        nostrService.dismissPendingRequest(request.id);
      }
    }
  }, [nostrService.pendingRequests, addActivityWithFallback, db, nostrService]);

  const approve = useCallback(
    (id: string) => {
      console.log('Approve', id);

      const request = getById(id);
      if (!request) {
        console.log('Request not found', id);
        return;
      }

      nostrService.dismissPendingRequest(id);

      switch (request.type) {
        case 'login':
          // Create AuthResponseStatus for approved login using type assertion
          const approvedAuthResponse = new AuthResponseStatus.Approved({
            grantedPermissions: [],
            sessionToken: 'randomsessiontoken', // TODO: generate a real session token
          });
          request.result(approvedAuthResponse);

          // Add an activity record directly via the database service
                      getServiceNameWithFallback(nostrService, request.metadata.serviceKey).then(serviceName => {
              addActivityWithFallback({
                type: 'auth',
                service_key: request.metadata.serviceKey,
                detail: 'User approved login',
                date: new Date(),
                service_name: serviceName,
                amount: null,
                currency: null,
                request_id: id,
                subscription_id: null,
              });
            });
          break;
        case 'payment':
          request.result({
            status: new PaymentStatus.Pending(),
            requestId: (request.metadata as SinglePaymentRequest).content.requestId,
          });
          // Add payment activity
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

            getServiceNameWithFallback(nostrService, request.metadata.serviceKey).then(serviceName => {
              addActivityWithFallback({
                type: 'pay',
                service_key: request.metadata.serviceKey,
                service_name: serviceName,
                detail: 'Payment approved',
                date: new Date(),
                amount: Number(amount) / 1000,
                currency,
                request_id: id,
                subscription_id: null,
              });
            });
          } catch (err) {
            console.log('Error adding payment activity:', err);
          }
          nostrService.payInvoice((request?.metadata as SinglePaymentRequest).content.invoice);
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

            getServiceNameWithFallback(nostrService, request.metadata.serviceKey)
              .then(serviceName => {
                return addSubscriptionWithFallback({
                  request_id: id,
                  service_name: serviceName,
                  service_key: request.metadata.serviceKey,
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
              })
              .then(id => {
                request.result({
                  status: new RecurringPaymentStatus.Confirmed({
                    subscriptionId: id || 'randomsubscriptionid',
                    authorizedAmount: (request.metadata as SinglePaymentRequest).content.amount,
                    authorizedCurrency: (request.metadata as SinglePaymentRequest).content.currency,
                    authorizedRecurrence: (request.metadata as RecurringPaymentRequest).content
                      .recurrence,
                  }),
                  requestId: (request.metadata as RecurringPaymentRequest).content.requestId,
                });
              });
          } catch (err) {
            console.log('Error adding subscription activity:', err);
          }
          break;
      }
    },
    [getById, addActivityWithFallback, addSubscriptionWithFallback, nostrService]
  );

  const deny = useCallback(
    (id: string) => {
      console.log('Deny', id);

      const request = getById(id);
      if (!request) {
        console.log('Request not found', id);
        return;
      }

      nostrService.dismissPendingRequest(id);

      switch (request?.type) {
        case 'login':
          // Create AuthResponseStatus for denied login using type assertion
          const deniedAuthResponse = new AuthResponseStatus.Declined({
            reason: 'Not approved by user',
          });
          request.result(deniedAuthResponse);

          // Add denied login activity to database
          getServiceNameWithFallback(nostrService, request.metadata.serviceKey).then(serviceName => {
            addActivityWithFallback({
              type: 'auth',
              service_key: request.metadata.serviceKey,
              detail: 'User denied login',
              date: new Date(),
              service_name: serviceName,
              amount: null,
              currency: null,
              request_id: id,
              subscription_id: null,
            });
          });
          break;
        case 'payment':
          request.result({
            status: new PaymentStatus.Rejected({ reason: 'User rejected' }),
            requestId: (request.metadata as SinglePaymentRequest).content.requestId,
          });

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

            getServiceNameWithFallback(nostrService, request.metadata.serviceKey).then(serviceName => {
              addActivityWithFallback({
                type: 'pay',
                service_key: request.metadata.serviceKey,
                service_name: serviceName,
                detail: 'Payment denied by user',
                date: new Date(),
                amount: Number(amount) / 1000,
                currency,
                request_id: id,
                subscription_id: null,
              });
            });
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

          // Add denied subscription activity to database
          try {
            // Convert BigInt to number if needed
            const amount =
              typeof (request.metadata as RecurringPaymentRequest).content.amount === 'bigint'
                ? Number((request.metadata as RecurringPaymentRequest).content.amount)
                : (request.metadata as RecurringPaymentRequest).content.amount;

            // Extract currency symbol from the Currency object
            let currency: string | null = null;
            const currencyObj = (request.metadata as RecurringPaymentRequest).content.currency;
            if (currencyObj) {
              // If it's a simple string, use it directly
              if (typeof currencyObj === 'string') {
                currency = currencyObj;
              } else {
                currency = 'sats';
              }
            }

            getServiceNameWithFallback(nostrService, request.metadata.serviceKey).then(serviceName => {
              addActivityWithFallback({
                type: 'pay',
                service_key: request.metadata.serviceKey,
                service_name: serviceName,
                detail: 'Subscription denied by user',
                date: new Date(),
                amount: Number(amount) / 1000,
                currency,
                request_id: id,
                subscription_id: null,
              });
            });
          } catch (err) {
            console.log('Error adding denied subscription activity:', err);
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
      if (request.metadata.serviceKey === pendingUrl?.mainKey) {
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
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
