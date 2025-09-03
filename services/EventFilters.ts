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
} from 'portal-app-lib';
import { DatabaseService, fromUnixSeconds, SubscriptionWithDates } from './DatabaseService';

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
  executeOperation: <T>(operation: (db: DatabaseService) => Promise<T>, fallback?: T) => Promise<T>,
  resolve: (status: PaymentStatus) => void,
  getServiceName: (app: PortalAppInterface, serviceKey: string) => Promise<string | null>,
  app: PortalAppInterface
): Promise<boolean> {
  try {
    let invoiceData = parseBolt11(request.content.invoice);

    if (invoiceData.amountMsat != request.content.amount) {
      resolve(
        new PaymentStatus.Rejected({
          reason: `Invoice amount does not match the requested amount.`,
        })
      );
      return false;
    }

    let subId = request.content.subscriptionId;
    if (!subId) {
      return true;
    }

    let subscription: SubscriptionWithDates;
    try {
      let subscriptionFromDb = await executeOperation(db => db.getSubscription(subId), null);
      if (!subscriptionFromDb) {
        resolve(
          new PaymentStatus.Rejected({
            reason: `Subscription with ID ${subId} not found in database`,
          })
        );
        return false;
      }
      subscription = subscriptionFromDb;
    } catch (e) {
      resolve(
        new PaymentStatus.Rejected({
          reason:
            'Failed to retrieve subscription from database. Please try again or contact support if the issue persists.',
        })
      );
      return false;
    }

    let serviceName = 'Unknown Service';
    try {
      serviceName = (await getServiceName(app, request.serviceKey)) || 'Unknown Service';
    } catch (e) {
      console.error('Error getting service name:', e);
    }

    // TODO: take into account other currencies
    const amountSats = request.content.amount / 1000n;
    if (amountSats != BigInt(subscription.amount)) {
      resolve(
        new PaymentStatus.Rejected({
          reason: `Payment amount does not match subscription amount.\nExpected: ${subscription.amount} ${subscription.currency}\nReceived: ${amountSats} ${request.content.currency}`,
        })
      );
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
    console.log('next occurrence', nextOccurrence);

    if (!nextOccurrence || fromUnixSeconds(nextOccurrence) > new Date()) {
      resolve(
        new PaymentStatus.Rejected({
          reason: 'Payment is not due yet. Please wait till the next payment is scheduled.',
        })
      );
      return false;
    }

    let balance: number | undefined;

    if (wallet) {
      await wallet.getInfo();
      balance = Number(await wallet.getBalance());
    }

    if (balance && request.content.amount > balance) {
      executeOperation(
        db =>
          db.addActivity({
            type: 'pay',
            service_key: request.serviceKey,
            service_name: serviceName,
            detail: 'Recurrent payment failed: insufficient wallet balance.',
            date: new Date(),
            amount: Number(amountSats),
            currency: request.content.currency.tag,
            request_id: request.eventId,
            status: 'negative',
            subscription_id: request.content.subscriptionId || null,
          }),
        null
      );

      resolve(
        new PaymentStatus.Rejected({
          reason: 'Recurrent payment failed: insufficient wallet balance.',
        })
      );

      return false;
    }

    if (wallet) {
      // Save the payment
      const id = await executeOperation(
        db =>
          db.addActivity({
            type: 'pay',
            service_key: request.serviceKey,
            service_name: serviceName,
            detail: 'Recurrent payment',
            date: new Date(),
            amount: Number(amountSats),
            currency: request.content.currency.tag,
            request_id: request.eventId,
            status: 'pending',
            subscription_id: request.content.subscriptionId || null,
          }),
        null
      );

      resolve(new PaymentStatus.Approved());

      await executeOperation(
        db => db.addPaymentStatusEntry(request.content.invoice, 'payment_started'),
        null
      );

      // make the payment with nwc
      try {
        const preimage = await wallet.payInvoice(request.content.invoice);

        await executeOperation(
          db => db.addPaymentStatusEntry(request.content.invoice, 'payment_completed'),
          null
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

        resolve(
          new PaymentStatus.Success({
            preimage,
          })
        );
      } catch (error) {
        console.error('Error paying invoice:', error);

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
                'Payment approved by user but failed to process'
              ),
            null
          );
        }

        resolve(
          new PaymentStatus.Failed({
            reason: 'Payment failed: ' + error,
          })
        );
      }
    } else {
      executeOperation(
        db =>
          db.addActivity({
            type: 'pay',
            service_key: request.serviceKey,
            service_name: serviceName,
            detail: 'Recurrent payment failed: no wallet is connected.',
            date: new Date(),
            amount: Number(amountSats),
            currency: request.content.currency.tag,
            request_id: request.eventId,
            status: 'negative',
            subscription_id: request.content.subscriptionId || null,
          }),
        null
      );

      resolve(
        new PaymentStatus.Rejected({
          reason: 'Recurring payment failed: user has no wallet linked',
        })
      );

      return false;
    }

    return false;
  } catch (e) {
    resolve(
      new PaymentStatus.Rejected({
        reason: `An unexpected error occurred while processing the payment: ${e}.\nPlease try again or contact support if the issue persists.`,
      })
    );
    return false;
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
