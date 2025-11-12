import {
  AuthChallengeEvent,
  AuthResponseStatus,
  CloseRecurringPaymentResponse,
  RecurringPaymentRequest,
  RecurringPaymentResponseContent,
  SinglePaymentRequest,
  PaymentStatus,
  Nwc,
  parseCalendar,
  PortalAppInterface,
  parseBolt11,
  Currency_Tags,
} from 'portal-app-lib';
import * as Notifications from 'expo-notifications';
import { DatabaseService, fromUnixSeconds, SubscriptionWithDates } from './DatabaseService';
import { CurrencyConversionService } from './CurrencyConversionService';
import { globalEvents } from '@/utils/common';
import { Currency, CurrencyHelpers } from '@/utils/currency';

/**
 * Sends a local notification for payment-related events with human-readable formatting
 * @param title - Notification title
 * @param amount - Payment amount
 * @param currency - Currency string (e.g., 'sats', 'USD')
 * @param serviceName - Name of the service
 * @param convertedAmount - Optional converted amount in user's preferred currency
 * @param convertedCurrency - Optional converted currency
 */
async function sendPaymentNotification(
  title: string,
  amount: number,
  currency: string,
  serviceName: string,
): Promise<void> {
  try {
    // Format the amount - prefer converted amount if available
    let formattedAmount: string;
    // Use converted amount with proper formatting
    const currencyEnum = currency as Currency;
    const symbol = CurrencyHelpers.getSymbol(currencyEnum);

    if (currencyEnum === Currency.SATS) {
      formattedAmount = `${Math.round(amount)} ${symbol}`;
    } else if (currencyEnum === Currency.BTC) {
      const fixed = amount.toFixed(8);
      const trimmed = fixed.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1');
      formattedAmount = `${symbol}${trimmed}`;
    } else {
      formattedAmount = `${symbol}${amount.toFixed(2)}`;
    }
    const body = `${serviceName}: ${formattedAmount}`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: 'payment',
        },
      },
      trigger: null, // Show immediately
    });
  } catch (error) {
    // Silently fail - notification errors shouldn't break payment flow
    console.error('Failed to send payment notification:', error);
  }
}

export async function handleAuthChallenge(
  event: AuthChallengeEvent,
  executeOperation: <T>(operation: (db: DatabaseService) => Promise<T>, fallback?: T) => Promise<T>,
  resolve: (status: AuthResponseStatus) => void
): Promise<boolean> {
  return true;
}

export async function handleSinglePaymentRequest(
  wallet: Nwc | null,
  request: SinglePaymentRequest,
  preferredCurrency: Currency,
  executeOperation: <T>(operation: (db: DatabaseService) => Promise<T>, fallback?: T) => Promise<T>,
  resolve: (status: PaymentStatus) => void,
  sendNotification: boolean = false
): Promise<boolean> {
  let subId = request.content.subscriptionId;
  try {
    //clean old stale subs
    await executeOperation((db) => db.deleteStaleProcessingSubscriptions());

    let invoiceData = parseBolt11(request.content.invoice);

    // Deduplication guard: skip if an activity with the same request/event id already exists
    try {
      const alreadyExists = await executeOperation(
        db => db.hasActivityWithRequestId(request.eventId),
        false
      );
      if (alreadyExists) {
        console.warn(`🔁 Skipping duplicate payment activity for request_id/eventId: ${request.eventId}`);
        return false;
      }
    } catch (e) {
      // If the check fails, proceed without blocking, but log the error
      console.error('Failed to check duplicate activity:', e);
    }

    const checkAmount = async () => {
      const invoiceAmountMsat = Number(invoiceData.amountMsat);
      console.warn("TASDASDASAS 22222222", invoiceData.amountMsat);
      // 1% tolerance for amounts up to 10,000,000 msats, 0.5% for larger amounts
      const TOLERANCE_PERCENT = invoiceAmountMsat <= 10_000_000 ? 0.01 : 0.005;

      if (request.content.currency.tag === Currency_Tags.Millisats) {
        const requestAmountMsat = Number(request.content.amount);
        const difference = Math.abs(invoiceAmountMsat - requestAmountMsat);
        const tolerance = invoiceAmountMsat * TOLERANCE_PERCENT;
        return difference <= tolerance;
      } else if (request.content.currency.tag === Currency_Tags.Fiat) {
        // Convert fiat amount to msat for comparison
        const fiatCurrencyRaw = (request.content.currency as any).inner;
        const fiatCurrencyValue = Array.isArray(fiatCurrencyRaw)
          ? fiatCurrencyRaw[0]
          : fiatCurrencyRaw;
        const fiatCurrency =
          typeof fiatCurrencyValue === 'string'
            ? String(fiatCurrencyValue).toUpperCase()
            : 'UNKNOWN';
        const rawFiatAmount = Number(request.content.amount);
        const normalizedFiatAmount = rawFiatAmount / 100; // incoming amount is in minor units (e.g., cents)
        const amountInMsat = await CurrencyConversionService.convertAmount(
          normalizedFiatAmount,
          fiatCurrency,
          'MSATS'
        );
        const requestAmountMsat = Math.round(amountInMsat);
        console.warn("TASDASDASAS 11111111", requestAmountMsat, invoiceAmountMsat);
        const difference = Math.abs(invoiceAmountMsat - requestAmountMsat);
        const tolerance = invoiceAmountMsat * TOLERANCE_PERCENT;
        console.warn("TASDASDASAS", requestAmountMsat, difference, tolerance);
        return difference <= tolerance;
      }
      return false;
    };

    if (!(await checkAmount())) {
      resolve(
        new PaymentStatus.Rejected({
          reason: `Invoice amount does not match the requested amount.`,
        })
      );
      console.warn(`🚫 Payment rejected! The invoice amount do not match the requested amount.\nReceived ${invoiceData.amountMsat}\nRequired ${request.content.amount}`);
      return false;
    }

    let amount =
      typeof request.content.amount === 'bigint'
        ? Number(request.content.amount)
        : request.content.amount;

    // Store original amount for currency conversion
    const originalAmount = amount;

    // Extract currency symbol from the Currency object and convert amount for storage
    let currency: string | null = null;
    const currencyObj = request.content.currency;
    switch (currencyObj.tag) {
      case Currency_Tags.Fiat:
        {
          const fiatCurrencyRaw = (currencyObj as any).inner;
          const fiatCurrencyValue = Array.isArray(fiatCurrencyRaw)
            ? fiatCurrencyRaw[0]
            : fiatCurrencyRaw;
          currency =
            typeof fiatCurrencyValue === 'string'
              ? String(fiatCurrencyValue).toUpperCase()
              : 'UNKNOWN';
          // Normalize fiat amount from minor units (cents) to major units (dollars) for storage
          amount = amount / 100;
        }
        break;
      case Currency_Tags.Millisats:
        amount = amount / 1000; // Convert to sats for database storage
        currency = 'sats';
        break;
    }

    // Convert currency for user's preferred currency using original amount
    let convertedAmount: number | null = null;
    let convertedCurrency: string | null = null;

    try {
      let sourceCurrency: string;
      let conversionAmount: number;

      if (currencyObj?.tag === Currency_Tags.Fiat) {
        const fiatCurrencyRaw = (currencyObj as any).inner;
        const fiatCurrencyValue = Array.isArray(fiatCurrencyRaw)
          ? fiatCurrencyRaw[0]
          : fiatCurrencyRaw;
        sourceCurrency =
          typeof fiatCurrencyValue === 'string'
            ? String(fiatCurrencyValue).toUpperCase()
            : 'UNKNOWN';
        // Normalize fiat amount from minor units (cents) to major units (dollars)
        conversionAmount = originalAmount / 100;
      } else {
        sourceCurrency = 'MSATS';
        conversionAmount = originalAmount; // Already in millisats
      }

      convertedAmount = await CurrencyConversionService.convertAmount(
        conversionAmount,
        sourceCurrency,
        preferredCurrency // Currency enum values are already strings
      );
      convertedCurrency = preferredCurrency;
    } catch (error) {
      console.error('Currency conversion error during payment:', error);
      // Continue without conversion - convertedAmount will remain null
      return false;
    }

    if (!subId) {
      console.log(`👤 Not a subscription, required user interaction!`);

      if (sendNotification) {
        await sendPaymentNotification(
          'Payment Request',
          convertedAmount,
          convertedCurrency,
          'Payment request',
        );
      }

      return true;
    }

    let lockTry = 0;
    while (true) {
      const lockAcquired = (await executeOperation((db) => db.markSubscriptionAsProcessing(subId))) > 0;
      if (lockAcquired) {
        console.log(`💂 Lock acquired!. Processing subscription with id ${subId}`);
        break;
      } else if (lockTry > 4) {
        console.warn(`💂 Execution terminated. Could not acquire lock on subscription processing`);
        return false;
      }
      lockTry++;
      console.warn(`💂 Execution delayed. Subscription with id ${subId} is already processing`);
      await new Promise(resolve => setTimeout(resolve, 600));
    }

    console.log(`🤖 The request is from a subscription with id ${subId}. Checking to make automatic action.`);
    let subscription: SubscriptionWithDates;
    let subscriptionServiceName: string;
    try {
      let subscriptionFromDb = await executeOperation(db => db.getSubscription(subId), null);
      if (!subscriptionFromDb) {
        resolve(
          new PaymentStatus.Rejected({
            reason: `Subscription with ID ${subId} not found in database`,
          })
        );
        console.warn(`🚫 Payment rejected! The request is a subscription payment, but no subscription found with id ${subId}`);
        return false;
      }
      subscription = subscriptionFromDb;
      subscriptionServiceName = subscriptionFromDb.service_name;
    } catch (e) {
      resolve(
        new PaymentStatus.Rejected({
          reason:
            'Failed to retrieve subscription from database. Please try again or contact support if the issue persists.',
        })
      );
      console.warn(`🚫 Payment rejected! Failing to connect to database.`);
      return false;
    }

    if (amount != subscription.amount || currency != subscription.currency) {
      resolve(
        new PaymentStatus.Rejected({
          reason: `Payment amount does not match subscription amount.\nExpected: ${subscription.amount} ${subscription.currency}\nReceived: ${amount} ${request.content.currency}`,
        })
      );
      console.warn(`🚫 Payment rejected! Amount does not match subscription amount.\nExpected: ${subscription.amount} ${subscription.currency}\nReceived: ${amount} ${request.content.currency}`);
      return false;
    }

    // If no payment has been executed, the nextOccurrence is the first payment due time
    let nextOccurrence: bigint | undefined = BigInt(
      subscription.recurrence_first_payment_due.getTime() / 1000
    );
    if (subscription.last_payment_date) {
      let lastPayment = BigInt(subscription.last_payment_date.getTime() / 1000);
      nextOccurrence = parseCalendar(subscription.recurrence_calendar).nextOccurrence(lastPayment);
    }

    if (!nextOccurrence || fromUnixSeconds(nextOccurrence) > new Date()) {
      resolve(
        new PaymentStatus.Rejected({
          reason: 'Payment is not due yet. Please wait till the next payment is scheduled.',
        })
      );
      console.warn(`🚫 Payment rejected! The request arrived too soon.\nNext occurrence is: ${fromUnixSeconds(nextOccurrence!)}\nBut today is: ${new Date()}`);
      return false;
    }

    if (wallet) {
      // Save the payment
      const id = await executeOperation(
        db =>
          db.addActivity({
            type: 'pay',
            service_key: request.serviceKey,
            service_name: subscriptionServiceName,
            detail: 'Recurrent payment',
            date: new Date(),
            amount: amount,
            currency: currency,
            converted_amount: convertedAmount,
            converted_currency: convertedCurrency,
            request_id: request.eventId,
            status: 'pending',
            subscription_id: request.content.subscriptionId || null,
            invoice: request.content.invoice
          }),
        null
      );

      globalEvents.emit('activityAdded', { activityId: id });

      resolve(new PaymentStatus.Approved());

      await executeOperation(
        db => db.addPaymentStatusEntry(request.content.invoice, 'payment_started'),
        null
      );

      // make the payment with nwc
      try {
        const preimage = await wallet.payInvoice(request.content.invoice);
        console.log("🧾 Invoice paid!");

        // Send notification to user about successful payment
        await sendPaymentNotification(
          'Payment Successful',
          convertedAmount,
          convertedCurrency,
          subscriptionServiceName,
        );

        // Update the subscription last payment date
        await executeOperation(
          db => db.updateSubscriptionLastPayment(subscription.id, new Date()),
          null
        );

        // Update the activity status to positive
        if (id) {
          await executeOperation(
            db => db.updateActivityStatus(id, 'positive', 'Payment completed'),
            null
          );
        }
        globalEvents.emit('activityUpdated', { activityId: id });

        resolve(
          new PaymentStatus.Success({
            preimage,
          })
        );
      } catch (error: any) {
        console.error('Error paying invoice:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

        await executeOperation(
          db => db.addPaymentStatusEntry(request.content.invoice, 'payment_failed'),
          null
        );

        // Update the activity status to negative
        if (id) {
          await executeOperation(
            db =>
              db.updateActivityStatus(
                id,
                'negative',
                'Payment approved failed to process'
              ),
            null
          );
        }

        resolve(
          new PaymentStatus.Failed({
            reason: 'Payment failed: ' + error,
          })
        );
        console.warn(`🚫 Payment failed! Error is: ${error}`);
      }
    } else {
      const id = await executeOperation(
        db =>
          db.addActivity({
            type: 'pay',
            service_key: request.serviceKey,
            service_name: subscriptionServiceName,
            detail: 'Recurrent payment failed: no wallet is connected.',
            date: new Date(),
            amount: amount,
            currency: currency,
            converted_amount: convertedAmount,
            converted_currency: convertedCurrency,
            request_id: request.eventId,
            status: 'negative',
            subscription_id: request.content.subscriptionId || null,
            invoice: request.content.invoice
          }),
        null
      );
      globalEvents.emit('activityAdded', { activityId: id });

      resolve(
        new PaymentStatus.Rejected({
          reason: 'Recurring payment failed: user has no linked wallet',
        })
      );
      console.warn(`🚫 Payment rejected! No wallet.`);

      return false;
    }

    return false;
  } catch (e) {
    resolve(
      new PaymentStatus.Rejected({
        reason: `An unexpected error occurred while processing the payment: ${e}.\nPlease try again or contact support if the issue persists.`,
      })
    );
    console.warn(`🚫 Payment rejected! Error is: ${e}`);
    return false;
  } finally {
    if (subId) {
      await executeOperation((db) => db.deleteProcessingSubscription(subId));
      console.log(`💂 Lock is freed. Subscription with id ${subId} is removed from processing list.`);
    }
  }
}

export async function handleRecurringPaymentRequest(
  request: RecurringPaymentRequest,
  executeOperation: <T>(operation: (db: DatabaseService) => Promise<T>, fallback?: T) => Promise<T>,
  resolve: (status: RecurringPaymentResponseContent) => void
): Promise<boolean> {
  return true;
}

export async function handleCloseRecurringPaymentResponse(
  response: CloseRecurringPaymentResponse,
  executeOperation: <T>(operation: (db: DatabaseService) => Promise<T>, fallback?: T) => Promise<T>,
  resolve: () => void
): Promise<boolean> {
  try {
    await executeOperation(
      db => db.updateSubscriptionStatus(response.content.subscriptionId, 'cancelled'),
      null
    );

    // Refresh UI to reflect the subscription status change
    console.log('Refreshing subscriptions UI after subscription closure');
    // Use the global event emitter to notify ActivitiesProvider
    globalEvents.emit('subscriptionStatusChanged', {
      subscriptionId: response.content.subscriptionId,
      status: 'cancelled',
    });
  } catch (error) {
    console.error('Error setting closed recurring payment', error);
  }

  resolve();
  return false;
}
