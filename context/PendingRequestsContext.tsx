import type React from 'react';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { Platform } from 'react-native';
import type {
  KeyHandshakeUrl,
  NostrConnectRequestEvent,
  RecurringPaymentRequest,
  SinglePaymentRequest,
} from 'portal-app-lib';
import {
  PaymentStatus,
  RecurringPaymentStatus,
  AuthResponseStatus,
  CashuResponseStatus,
  Currency_Tags,
  NostrConnectResponseStatus,
  keyToHex,
} from 'portal-app-lib';

import { fromUnixSeconds } from '@/services/DatabaseService';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { useActivities } from '@/context/ActivitiesContext';
import { useCurrency } from '@/context/CurrencyContext';
import { CurrencyConversionService } from '@/services/CurrencyConversionService';
import { normalizeCurrencyForComparison } from '@/utils/currency';
import { NostrServiceContextType, useNostrService } from '@/context/NostrServiceContext';
import { useECash } from '@/context/ECashContext';
import type {
  PendingRequest,
  PendingRequestType,
  PendingActivity,
  PendingSubscription,
} from '@/utils/types';
import { PortalAppManager } from '@/services/PortalAppManager';
import { registerContextReset, unregisterContextReset } from '@/services/ContextResetService';
import { globalEvents, getServiceNameFromMintUrl } from '@/utils/common';
import { usePortalApp } from './PortalAppContext';
import { useWalletManager } from './WalletManagerContext';

// Helper function to get service name with fallback
const getServiceNameWithFallback = async (
  nostrService: NostrServiceContextType,
  serviceKey: string
): Promise<string> => {
  if (!serviceKey || serviceKey === 'Unknown Service') {
    return 'Unknown Service';
  }

  // If it's a URL (mint URL), extract service name from it
  if (serviceKey.startsWith('http://') || serviceKey.startsWith('https://')) {
    return getServiceNameFromMintUrl(serviceKey);
  }

  // Try to resolve service name from Nostr (works with hex, npub, or any valid key format)
  try {
    const app = PortalAppManager.tryGetInstance();
    const serviceName = await nostrService.getServiceName(app, serviceKey);
    if (serviceName) {
      return serviceName;
    }
  } catch (error) {
    // If resolution fails, fall through to return Unknown Service
    console.error('Failed to fetch service name:', error);
  }

  return 'Unknown Service';
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
  const [timeoutId, setTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Simple database access
  const { executeOperation } = useDatabaseContext();

  const appService = usePortalApp();
  const nostrService = useNostrService();
  const eCashContext = useECash();
  const { preferredCurrency } = useCurrency();
  const walletService = useWalletManager();

  // Get the refreshData function from ActivitiesContext
  const { refreshData } = useActivities();

  // Reset all PendingRequests state to initial values
  // This is called during app reset to ensure clean state
  const resetPendingRequests = () => {
    // Reset all state to initial values
    setIsLoadingRequest(false);
    setPendingUrl(undefined);
    setRequestFailed(false);

    // Clear any active timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setTimeoutId(null);
    }
  };

  // Register/unregister context reset function
  useEffect(() => {
    registerContextReset(resetPendingRequests);

    return () => {
      unregisterContextReset(resetPendingRequests);
    };
  }, []);

  // Helper function to add an activity
  const addActivityWithFallback = async (activity: PendingActivity): Promise<string> => {
    try {
      const id = await executeOperation(db => db.addActivity(activity));
      if (id && typeof id === 'string' && id.length > 0) {
        // Fetch the created/updated activity to emit it
        const createdActivity = await executeOperation(db => db.getActivity(id), null);
        if (createdActivity) {
          globalEvents.emit('activityAdded', createdActivity);
        }
        refreshData();
        return id;
      } else {
        refreshData();
        return '';
      }
    } catch (error) {
      console.error('Failed to add activity:', error);
      refreshData();
      return '';
    }
  };

  // Helper function to safely convert amount to number or null
  // Preserves 0 values (doesn't convert to null due to falsy check)
  const safeAmountToNumber = (amount: number | null | undefined): number | null => {
    if (amount == null) return null;
    const num = Number(amount);
    return isNaN(num) ? null : num;
  };

  // Helper function to create ticket activity with progressive fallback retry logic
  // Tries with full data first, then minimal required fields, then absolute minimal data
  const createTicketActivityWithRetry = useCallback(
    async (
      activityType: 'ticket_approved' | 'ticket_denied',
      baseData: {
        mintUrl: string | null;
        serviceName: string;
        ticketTitle: string;
        amount: number | null;
        requestId: string;
      }
    ): Promise<void> => {
      const { mintUrl, serviceName, ticketTitle, amount, requestId } = baseData;
      const status =
        activityType === 'ticket_approved' ? ('positive' as const) : ('negative' as const);

      // Try with full data first
      try {
        const activityId = await addActivityWithFallback({
          type: activityType,
          service_key: mintUrl || 'Unknown Service',
          service_name: serviceName,
          detail: ticketTitle,
          date: new Date(),
          amount: safeAmountToNumber(amount),
          currency: activityType === 'ticket_approved' ? 'sats' : null,
          converted_amount: null,
          converted_currency: null,
          request_id: requestId,
          subscription_id: null,
          status,
        });
        if (activityId) {
          return; // Success, exit early
        }
      } catch (error) {
        console.error(`Failed to create ${activityType} activity with full data:`, error);
      }

      // Try with minimal required fields
      try {
        const activityId = await addActivityWithFallback({
          type: activityType,
          service_key: mintUrl || 'Unknown Service',
          service_name: 'Unknown Service',
          detail: `Ticket ${activityType === 'ticket_approved' ? 'request approved' : 'request denied'}`,
          date: new Date(),
          amount: safeAmountToNumber(amount),
          currency: activityType === 'ticket_approved' ? 'sats' : null,
          converted_amount: null,
          converted_currency: null,
          request_id: requestId,
          subscription_id: null,
          status,
        });
        if (activityId) {
          return; // Success, exit early
        }
      } catch (error) {
        console.error(`Failed to create ${activityType} activity with minimal data:`, error);
      }

      // Last resort - try with absolute minimal data
      try {
        await addActivityWithFallback({
          type: activityType,
          service_key: mintUrl || 'Unknown Service',
          service_name: 'Unknown Service',
          detail: `Ticket ${activityType === 'ticket_approved' ? 'approved' : 'denied'}`,
          date: new Date(),
          amount: null,
          currency: null,
          converted_amount: null,
          converted_currency: null,
          request_id: requestId,
          subscription_id: null,
          status,
        });
      } catch (error) {
        console.error(`Final attempt to create ${activityType} activity failed:`, error);
      }
    },
    [addActivityWithFallback]
  );

  // Helper function to add a subscription
  const addSubscriptionWithFallback = useCallback(
    async (subscription: PendingSubscription): Promise<string | undefined> => {
      const id = await executeOperation(
        db => db.addSubscription(subscription),
        undefined // fallback to undefined if failed
      );

      if (id) {
        // Refresh subscriptions data after adding a new subscription
        refreshData();
        return id;
      }

      return undefined;
    },
    [executeOperation, refreshData]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  // Memoize these functions to prevent recreation on every render
  const getByType = useCallback(
    (type: PendingRequestType) => {
      return Object.values(appService.pendingRequests).filter(request => request.type === type);
    },
    [appService.pendingRequests]
  );

  const getById = useCallback(
    (id: string) => {
      return appService.pendingRequests[id];
    },
    [appService.pendingRequests]
  );

  const approve = useCallback(
    async (id: string) => {
      const request = getById(id);
      if (!request) {
        console.warn('Request not found:', id);
        return;
      }

      appService.dismissPendingRequest(id);
      await executeOperation(db => db.storePendingRequest(id, true), null);

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
              converted_amount: null,
              converted_currency: null,
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
            const serviceName = await getServiceNameWithFallback(nostrService, metadata.serviceKey);

            // Convert BigInt to number if needed
            const rawAmount =
              typeof metadata.content.amount === 'bigint'
                ? Number(metadata.content.amount)
                : Number(metadata.content.amount ?? 0);

            let amount = rawAmount;
            let currency: string | null = null;
            const currencyObj = metadata.content.currency;
            let conversionSourceAmount = rawAmount;
            let conversionSourceCurrency = 'MSATS';
            switch (currencyObj.tag) {
              case Currency_Tags.Fiat:
                {
                  const fiatCodeRaw = (currencyObj as any).inner;
                  const fiatCodeValue = Array.isArray(fiatCodeRaw) ? fiatCodeRaw[0] : fiatCodeRaw;
                  const fiatCode =
                    typeof fiatCodeValue === 'string'
                      ? String(fiatCodeValue).toUpperCase()
                      : 'UNKNOWN';
                  currency = fiatCode;
                  amount = rawAmount / 100; // store fiat in major units
                  conversionSourceAmount = rawAmount / 100;
                  conversionSourceCurrency = fiatCode;
                }
                break;
              case Currency_Tags.Millisats:
                amount = amount / 1000; // Convert to sats for database storage
                currency = 'SATS';
                conversionSourceAmount = rawAmount;
                conversionSourceCurrency = 'MSATS';
                break;
            }

            // Convert currency for user's preferred currency using original amount
            let convertedAmount: number | null = null;
            let convertedCurrency: string | null = null;

            // Normalize stored currency for comparison (handle "sats" -> "SATS")
            const normalizedStoredCurrency = normalizeCurrencyForComparison(currency);
            const normalizedPreferredCurrency = normalizeCurrencyForComparison(preferredCurrency);

            // Skip conversion if currencies are the same (case-insensitive, with sats normalization)
            if (
              normalizedStoredCurrency &&
              normalizedPreferredCurrency &&
              normalizedStoredCurrency === normalizedPreferredCurrency
            ) {
              // No conversion needed - currencies match
              convertedAmount = null;
              convertedCurrency = null;
            } else {
              try {
                convertedAmount = await CurrencyConversionService.convertAmount(
                  conversionSourceAmount,
                  conversionSourceCurrency,
                  preferredCurrency // Currency enum values are already strings
                );
                convertedCurrency = preferredCurrency;
              } catch (error) {
                console.error('Currency conversion error during payment:', error);
                // Continue without conversion - convertedAmount will remain null
              }
            }

            const activityId = await addActivityWithFallback({
              type: 'pay',
              service_key: metadata.serviceKey,
              service_name: serviceName,
              detail: 'Payment approved',
              date: new Date(),
              amount: amount,
              currency: currency,
              converted_amount: convertedAmount,
              converted_currency: convertedCurrency,
              request_id: id,
              subscription_id: null,
              status: 'pending',
              invoice: metadata.content.invoice,
            });

            // Notify the approval
            await notifier(new PaymentStatus.Approved());

            // Insert into payment_status table
            await executeOperation(
              db => db.addPaymentStatusEntry(metadata.content.invoice, 'payment_started'),
              null
            );

            try {
              const response = await walletService.sendPayment(
                metadata.content.invoice,
                BigInt(amount)
              );

              console.log(response);

              await executeOperation(
                db => db.addPaymentStatusEntry(metadata.content.invoice, 'payment_completed'),
                null
              );

              // Update the activity status to positive
              await executeOperation(
                db => db.updateActivityStatus(activityId, 'positive', 'Payment completed'),
                null
              );
              refreshData();

              await notifier(
                new PaymentStatus.Success({
                  // preimage,
                  preimage: '',
                })
              );
            } catch (err) {
              console.log('Error paying invoice:', JSON.stringify(err));

              await executeOperation(
                db => db.addPaymentStatusEntry(metadata.content.invoice, 'payment_failed'),
                null
              );

              await executeOperation(
                db =>
                  db.updateActivityStatus(
                    activityId,
                    'negative',
                    'Payment approved by user but failed to process'
                  ),
                null
              );
              refreshData();

              await notifier(
                new PaymentStatus.Failed({
                  reason: 'Payment failed: ' + err,
                })
              );
            }
          })().catch(err => {
            console.error('Error processing payment:', err);
          });
          break;
        case 'subscription':
          // Add subscription activity
          try {
            // Convert BigInt to number if needed
            const req = request.metadata as RecurringPaymentRequest;

            (async () => {
              const serviceName = await getServiceNameWithFallback(
                nostrService,
                (request.metadata as RecurringPaymentRequest).serviceKey
              );

              const rawAmount =
                typeof req.content.amount === 'bigint'
                  ? Number(req.content.amount)
                  : Number(req.content.amount ?? 0);

              let amount = rawAmount;
              let currency: string | null = null;
              const currencyObj = req.content.currency;
              let conversionSourceAmount = rawAmount;
              let conversionSourceCurrency = 'MSATS';
              switch (currencyObj.tag) {
                case Currency_Tags.Fiat:
                  {
                    const fiatCodeRaw = (currencyObj as any).inner;
                    const fiatCodeValue = Array.isArray(fiatCodeRaw) ? fiatCodeRaw[0] : fiatCodeRaw;
                    const fiatCode =
                      typeof fiatCodeValue === 'string'
                        ? String(fiatCodeValue).toUpperCase()
                        : 'UNKNOWN';
                    currency = fiatCode;
                    amount = rawAmount / 100;
                    conversionSourceAmount = rawAmount / 100;
                    conversionSourceCurrency = fiatCode;
                  }
                  break;
                case Currency_Tags.Millisats:
                  amount = amount / 1000; // Convert to sats for database storage
                  currency = 'SATS';
                  conversionSourceAmount = rawAmount;
                  conversionSourceCurrency = 'MSATS';
                  break;
              }

              // Convert currency for user's preferred currency using original amount
              let convertedAmount: number | null = null;
              let convertedCurrency: string | null = null;

              try {
                convertedAmount = await CurrencyConversionService.convertAmount(
                  conversionSourceAmount,
                  conversionSourceCurrency,
                  preferredCurrency // Currency enum values are already strings
                );
                convertedCurrency = preferredCurrency;
              } catch (error) {
                console.error('Currency conversion error during payment:', error);
                // Continue without conversion - convertedAmount will remain null
              }

              const subscriptionId = await addSubscriptionWithFallback({
                request_id: id,
                service_name: serviceName,
                service_key: (request.metadata as RecurringPaymentRequest).serviceKey,
                amount: amount,
                currency: currency ?? 'UNKNOWN',
                converted_amount: convertedAmount,
                converted_currency: convertedCurrency,
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
              console.error('Error processing subscription:', err);
            });
          } catch (err) {
            console.error('Error adding subscription activity:', err);
          }
          break;
        case 'ticket':
          // Handle Cashu requests (sending tokens only)
          try {
            const cashuEvent = request.metadata as any;

            // Only handle Cashu request events (sending tokens)
            if (cashuEvent.inner?.mintUrl && cashuEvent.inner?.amount) {
              // Get the wallet from ECash context
              const wallet = await eCashContext.getWallet(
                cashuEvent.inner.mintUrl,
                cashuEvent.inner.unit.toLowerCase() // Normalize unit name
              );
              if (!wallet) {
                console.error('No wallet available for Cashu request');
                request.result(new CashuResponseStatus.Rejected({ reason: 'No wallet available' }));
                return;
              }

              // Get the amount from the request
              const amount = cashuEvent.inner.amount;
              const walletBalance = await wallet.getBalance();

              // Ensure both values are BigInt for proper comparison
              const balanceBigInt =
                typeof walletBalance === 'bigint' ? walletBalance : BigInt(walletBalance);
              const amountBigInt = typeof amount === 'bigint' ? amount : BigInt(amount);

              console.log(
                `[Ticket Request] Balance check: balance=${balanceBigInt.toString()}, requested=${amountBigInt.toString()}, unit=${cashuEvent.inner.unit}`
              );

              if (balanceBigInt < amountBigInt) {
                console.warn(
                  `[Ticket Request] Insufficient balance: have ${balanceBigInt.toString()}, need ${amountBigInt.toString()}`
                );
                request.result(new CashuResponseStatus.InsufficientFunds());
                return;
              }

              // Send tokens from the wallet
              const token = await wallet.sendAmount(amount);

              // Emit event to notify that wallet balances have changed
              globalEvents.emit('walletBalancesChanged', {
                mintUrl: cashuEvent.inner.mintUrl,
                unit: cashuEvent.inner.unit.toLowerCase(),
              });

              // Get mint URL (this is the actual ticket mint, same as ticket_received)
              const mintUrl = cashuEvent.inner.mintUrl;

              // Get Nostr service key for resolving service name (the requestor's public key)
              const nostrServiceKey = cashuEvent.serviceKey || cashuEvent.mainKey || null;

              // Resolve service name from Nostr service key if available
              const serviceName = nostrServiceKey
                ? await getServiceNameWithFallback(nostrService, nostrServiceKey)
                : getServiceNameFromMintUrl(mintUrl);

              // Get ticket title for detail field
              // Try to find the wallet by mintUrl
              let ticketWallet = eCashContext.wallets[mintUrl];
              if (!ticketWallet) {
                // Try to find by any wallet that matches the unit
                const walletEntries = Object.entries(eCashContext.wallets);
                const matchingWallet = walletEntries.find(
                  ([_, wallet]) => wallet.unit() === cashuEvent.inner.unit
                );
                if (matchingWallet) {
                  ticketWallet = matchingWallet[1];
                }
              }

              const unitInfo =
                ticketWallet && ticketWallet.getUnitInfo
                  ? await ticketWallet.getUnitInfo()
                  : undefined;
              const ticketTitle =
                unitInfo?.title ||
                (ticketWallet ? ticketWallet.unit() : cashuEvent.inner.unit || 'Unknown Ticket');

              // Create activity for approved ticket request
              // Use unique request_id by appending activity type to ensure each action creates its own activity
              // Use mintUrl as service_key to match ticket_received activities
              await createTicketActivityWithRetry('ticket_approved', {
                mintUrl,
                serviceName,
                ticketTitle,
                amount: Number(amount),
                requestId: `${id}-approved`,
              });

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
        case 'nostrConnect':
          const connectEvent = request.metadata as NostrConnectRequestEvent;

          const requestedPermissions = connectEvent.params.at(2) ?? null;
          try {
            // whitelist the nostr client
            executeOperation(db =>
              db.addAllowedBunkerClient(
                keyToHex(connectEvent.nostrClientPubkey),
                null,
                requestedPermissions
              )
            );
          } catch (e) {
            console.error(e);
            addActivityWithFallback({
              type: 'auth',
              service_key: (request.metadata as NostrConnectRequestEvent).nostrClientPubkey,
              detail: 'Login with bunker failed',
              date: new Date(),
              service_name: 'Nostr client',
              amount: null,
              currency: null,
              converted_amount: null,
              converted_currency: null,
              request_id: id,
              subscription_id: null,
              status: 'negative',
            });
          }

          // Create NostrConnectResponseStatus for approved bunker connection
          request.result(new NostrConnectResponseStatus.Approved());
          addActivityWithFallback({
            type: 'auth',
            service_key: (request.metadata as NostrConnectRequestEvent).nostrClientPubkey,
            detail: 'User approved bunker login',
            date: new Date(),
            service_name: 'Nostr client',
            amount: null,
            currency: null,
            converted_amount: null,
            converted_currency: null,
            request_id: id,
            subscription_id: null,
            status: 'positive',
          });
          break;
      }
    },
    [
      getById,
      addActivityWithFallback,
      addSubscriptionWithFallback,
      createTicketActivityWithRetry,
      nostrService,
      eCashContext,
    ]
  );

  const deny = useCallback(
    async (id: string) => {
      const request = getById(id);
      if (!request) {
        console.warn('Request not found:', id);
        return;
      }

      appService.dismissPendingRequest(id);
      await executeOperation(db => db.storePendingRequest(id, false), null);

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
              converted_amount: null,
              converted_currency: null,
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
            const req = request.metadata as SinglePaymentRequest;
            const rawAmount =
              typeof req.content.amount === 'bigint'
                ? Number(req.content.amount)
                : Number(req.content.amount ?? 0);

            let amount = rawAmount;
            let currency: string | null = null;
            const currencyObj = req.content.currency;
            let conversionSourceAmount = rawAmount;
            let conversionSourceCurrency = 'MSATS';
            switch (currencyObj.tag) {
              case Currency_Tags.Fiat:
                {
                  const fiatCodeRaw = (currencyObj as any).inner;
                  const fiatCodeValue = Array.isArray(fiatCodeRaw) ? fiatCodeRaw[0] : fiatCodeRaw;
                  const fiatCode =
                    typeof fiatCodeValue === 'string'
                      ? String(fiatCodeValue).toUpperCase()
                      : 'UNKNOWN';
                  currency = fiatCode;
                  amount = rawAmount / 100;
                  conversionSourceAmount = rawAmount / 100;
                  conversionSourceCurrency = fiatCode;
                }
                break;
              case Currency_Tags.Millisats:
                amount = amount / 1000; // Convert to sats for database storage
                currency = 'SATS';
                conversionSourceAmount = rawAmount;
                conversionSourceCurrency = 'MSATS';
                break;
            }

            // Convert currency for user's preferred currency using original amount
            let convertedAmount: number | null = null;
            let convertedCurrency: string | null = null;

            try {
              convertedAmount = await CurrencyConversionService.convertAmount(
                conversionSourceAmount,
                conversionSourceCurrency,
                preferredCurrency // Currency enum values are already strings
              );
              convertedCurrency = preferredCurrency;
            } catch (error) {
              console.error('Currency conversion error during payment denial:', error);
              // Continue without conversion - convertedAmount will remain null
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
                  amount: amount,
                  currency: currency,
                  converted_amount: convertedAmount,
                  converted_currency: convertedCurrency,
                  request_id: id,
                  subscription_id: null,
                  status: 'negative',
                  invoice: (request.metadata as SinglePaymentRequest).content.invoice,
                });
              }),
            ]);
          } catch (err) {
            console.error('Error adding denied payment activity:', err);
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

            // Get mint URL (this is the actual ticket mint, same as ticket_received)
            const mintUrl = cashuEvent.inner?.mintUrl;

            // Get Nostr service key for resolving service name (the requestor's public key)
            const nostrServiceKey = cashuEvent.serviceKey || cashuEvent.mainKey || null;

            // Resolve service name from Nostr service key if available, otherwise use mint URL
            let serviceName = 'Unknown Service';
            try {
              serviceName = nostrServiceKey
                ? await getServiceNameWithFallback(nostrService, nostrServiceKey)
                : mintUrl
                  ? getServiceNameFromMintUrl(mintUrl)
                  : 'Unknown Service';
            } catch (serviceNameError) {
              console.error('[Deny Ticket] Error resolving service name:', serviceNameError);
              // Fallback to mint URL-based name or Unknown Service
              serviceName = mintUrl ? getServiceNameFromMintUrl(mintUrl) : 'Unknown Service';
            }

            // Get ticket title for detail field
            let ticketTitle = 'Unknown Ticket';
            let ticketAmount: number | null = null;

            // Try to get ticket information if available
            if (mintUrl && cashuEvent.inner?.amount) {
              ticketAmount = Number(cashuEvent.inner.amount);
              // Try to find the wallet by mintUrl
              let ticketWallet = eCashContext.wallets[mintUrl];
              if (!ticketWallet) {
                // Try to find by any wallet that matches the unit
                const walletEntries = Object.entries(eCashContext.wallets);
                const matchingWallet = walletEntries.find(
                  ([_, wallet]) => wallet.unit() === cashuEvent.inner.unit
                );
                if (matchingWallet) {
                  ticketWallet = matchingWallet[1];
                }
              }

              if (ticketWallet) {
                const deniedUnitInfo = ticketWallet.getUnitInfo
                  ? await ticketWallet.getUnitInfo()
                  : undefined;
                ticketTitle =
                  deniedUnitInfo?.title ||
                  (ticketWallet ? ticketWallet.unit() : cashuEvent.inner.unit || 'Unknown Ticket');
              } else if (cashuEvent.inner.unit) {
                ticketTitle = cashuEvent.inner.unit;
              }
            }

            // Always create activity for denied ticket request
            // Use unique request_id by appending activity type to ensure each action creates its own activity
            // Use mintUrl as service_key to match ticket_received activities
            await createTicketActivityWithRetry('ticket_denied', {
              mintUrl: mintUrl || null,
              serviceName,
              ticketTitle,
              amount: ticketAmount,
              requestId: `${id}-denied`,
            });

            request.result(new CashuResponseStatus.Rejected({ reason: 'User denied request' }));
          } catch (error: any) {
            console.error('Error processing Cashu denial:', error);
            // Even on error, try to create activity with minimal info
            try {
              const cashuEvent = request.metadata as any;
              const mintUrl = cashuEvent?.inner?.mintUrl;
              const nostrServiceKey = cashuEvent?.serviceKey || cashuEvent?.mainKey || null;

              const serviceName = nostrServiceKey
                ? await getServiceNameWithFallback(nostrService, nostrServiceKey).catch(() =>
                    mintUrl ? getServiceNameFromMintUrl(mintUrl) : 'Unknown Service'
                  )
                : mintUrl
                  ? getServiceNameFromMintUrl(mintUrl)
                  : 'Unknown Service';

              await createTicketActivityWithRetry('ticket_denied', {
                mintUrl: mintUrl || null,
                serviceName,
                ticketTitle: 'Ticket request denied',
                amount: null,
                requestId: `${id}-denied`,
              });
            } catch (activityError) {
              console.error(
                'Failed to create activity for denied ticket in error handler:',
                activityError
              );
            }
            request.result(
              new CashuResponseStatus.Rejected({
                reason: error.message || 'Failed to process Cashu denial',
              })
            );
          }
          break;
        case 'nostrConnect':
          request.result(
            new NostrConnectResponseStatus.Declined({
              reason: 'Declined by the user',
            })
          );
          addActivityWithFallback({
            type: 'auth',
            service_key: (request.metadata as NostrConnectRequestEvent).nostrClientPubkey,
            detail: 'User declined bunker login',
            date: new Date(),
            service_name: 'Nostr client',
            amount: null,
            currency: null,
            converted_amount: null,
            converted_currency: null,
            request_id: id,
            subscription_id: null,
            status: 'negative',
          });
          break;
      }
    },
    [
      getById,
      addActivityWithFallback,
      createTicketActivityWithRetry,
      nostrService,
      eCashContext,
      appService,
    ]
  );

  // Show skeleton loader and set timeout for request
  const showSkeletonLoader = useCallback(
    (parsedUrl: KeyHandshakeUrl) => {
      if (parsedUrl.noRequest) {
        return;
      }
      // Clean up any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      setIsLoadingRequest(true);
      setPendingUrl(parsedUrl);
      setRequestFailed(false);

      // Set new timeout for 15 seconds
      const newTimeoutId = setTimeout(() => {
        setIsLoadingRequest(false);
        setRequestFailed(true);
      }, 15000);

      timeoutRef.current = newTimeoutId;
      setTimeoutId(newTimeoutId);
    },
    [timeoutId]
  );

  const cancelSkeletonLoader = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setTimeoutId(null);

    setIsLoadingRequest(false);
    setRequestFailed(false);
  }, []);

  // Check for expected pending requests and clear skeleton loader
  useEffect(() => {
    // Check for removing skeleton when we get the expected request
    for (const request of Object.values(appService.pendingRequests)) {
      const serviceKey = (request.metadata as SinglePaymentRequest).serviceKey;

      if (serviceKey === pendingUrl?.mainKey) {
        cancelSkeletonLoader();
      }
    }
  }, [appService.pendingRequests, pendingUrl, timeoutId]);

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
