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
import { Currency } from '@/utils/currency';

const debugNotification = async (title: string, body = '') => {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
    },
    trigger: null, // Show immediately
  });
};

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

    // Fast in-memory dedup to avoid double-processing when invoked concurrently
    const requestKey = request.eventId;

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

    if (invoiceData.amountMsat != request.content.amount) {
      resolve(
        new PaymentStatus.Rejected({
          reason: `Invoice amount does not match the requested amount.`,
        })
      );
      console.warn(`🚫 Payment rejected! The invoice amount do not match the requested amount.\nReceived ${invoiceData.amountMsat}\nRequired ${request.content.amount}`);
      return false;
    }

    if (!subId) {
      console.log(`👤 Not a subscription, required user interaction!`);

      if (sendNotification) {
        // Show notification to user for manual approval
        // TODO: format currency and amount
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Payment Request',
            body: `Payment request for ${request.content.amount} ${request.content.currency.tag === Currency_Tags.Fiat ? request.content.currency.inner : 'msat'} requires approval`,
          },
          trigger: null, // Show immediately
        });
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
      await debugNotification('sub', JSON.stringify(subscriptionFromDb));
      if (!subscriptionFromDb) {
        resolve(
          new PaymentStatus.Rejected({
            reason: `Subscription with ID ${subId} not found in database`,
          })
        );
        console.warn(`🚫 Payment rejected! The request is a subscription payment, but no subscription found with id ${subId}`);
        await debugNotification('no subscription found with id', `${subId}`);
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
      await debugNotification('db failed', JSON.stringify(e));
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
        if (typeof currencyObj === 'string') {
          currency = currencyObj;
        } else {
          currency = 'unknown';
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
      const sourceCurrency =
        currencyObj?.tag === Currency_Tags.Fiat ? (currencyObj as any).inner : 'MSATS';

      convertedAmount = await CurrencyConversionService.convertAmount(
        originalAmount, // Use original millisats amount for conversion
        sourceCurrency,
        preferredCurrency // Currency enum values are already strings
      );
      convertedCurrency = preferredCurrency;
    } catch (error) {
      console.error('Currency conversion error during payment:', error);
      // Continue without conversion - convertedAmount will remain null
      await debugNotification('conversion falied', `${error}`);
      return false;
    }
    if (amount != subscription.amount || currency != subscription.currency) {
      resolve(
        new PaymentStatus.Rejected({
          reason: `Payment amount does not match subscription amount.\nExpected: ${subscription.amount} ${subscription.currency}\nReceived: ${amount} ${request.content.currency}`,
        })
      );
      await debugNotification('invalid amount', `${amount} ${currency}`);
      console.warn(`🚫 Payment rejected! Amount does not match subscription amount.\nExpected: ${subscription.amount} ${subscription.currency}\nReceived: ${amount} ${request.content.currency}`);
      return false;
    }
    await debugNotification('conversion done', '');

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
      await debugNotification('payment not due yet', `${nextOccurrence}`);
      console.warn(`🚫 Payment rejected! The request arrived too soon.\nNext occurrence is: ${fromUnixSeconds(nextOccurrence!)}\nBut today is: ${new Date()}`);
      return false;
    }

    if (wallet) {
      await debugNotification('starting payment', 'wallet is present');

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

      void import('@/utils/index').then(({ globalEvents }) => {
        globalEvents.emit('activityAdded', { activityId: id });
      });

      resolve(new PaymentStatus.Approved());

      await executeOperation(
        db => db.addPaymentStatusEntry(request.content.invoice, 'payment_started'),
        null
      );

      // make the payment with nwc
      try {
        const preimage = await wallet.payInvoice(request.content.invoice);
        await debugNotification('invoice paid', `${preimage}`);
        console.log("🧾 Invoice paid!");

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
        void import('@/utils/index').then(({ globalEvents }) => {
          globalEvents.emit('activityUpdated', { activityId: id });
        });

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
      void import('@/utils/index').then(({ globalEvents }) => {
        globalEvents.emit('activityAdded', { activityId: id });
      });

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
    await debugNotification('unexpected error', JSON.stringify(e));
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
    // Import the global event emitter to notify ActivitiesProvider
    const { globalEvents } = await import('@/utils/index');
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
