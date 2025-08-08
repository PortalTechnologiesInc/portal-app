import { AuthChallengeEvent, AuthResponseStatus, CloseRecurringPaymentResponse, PaymentResponseContent, RecurringPaymentRequest, RecurringPaymentResponseContent, SinglePaymentRequest, PaymentStatus, Nwc, parseCalendar, PortalAppInterface } from "portal-app-lib";
import { DatabaseService, fromUnixSeconds, SubscriptionWithDates } from "./database";
import { getWalletUrl } from "./SecureStorageService";

export async function handleAuthChallenge(event: AuthChallengeEvent, database: DatabaseService, resolve: (status: AuthResponseStatus) => void): Promise<boolean> {
  return true;
}

export async function handleSinglePaymentRequest(request: SinglePaymentRequest, database: DatabaseService, resolve: (status: PaymentStatus) => void, getServiceName: (serviceKey: string, app?: PortalAppInterface | null) => Promise<string | null>, app: PortalAppInterface): Promise<boolean> {
  const walletUrl = await getWalletUrl();
  try {
    let wallet: Nwc | undefined;
    let balance: number | undefined;

    if (walletUrl) {
      wallet = new Nwc(walletUrl);
      await wallet.getInfo();
      balance = Number((await wallet.getBalance()));
    }

    let subId = request.content.subscriptionId;
    if (!subId) {
      return true;
    }

    let subscription: SubscriptionWithDates;
    try {
      let subscriptionFromDb = await database.getSubscription(subId);
      if (!subscriptionFromDb) {
        resolve(
          new PaymentStatus.Rejected({
            reason: `Subscription with ID ${subId} not found in database`
          })
        );
        return false;
      }
      subscription = subscriptionFromDb;
    } catch (e) {
      resolve(
        new PaymentStatus.Rejected({
          reason: 'Failed to retrieve subscription from database. Please try again or contact support if the issue persists.'
        })
      );
      return false;
    }

    let serviceName = "Unknown Service";
    try {
      serviceName = await getServiceName(request.serviceKey, app) || "Unknown Service";
    } catch (e) {
      console.error('Error getting service name:', e);
    }

    // TODO: take into account other currencies
    const amountSats = request.content.amount / 1000n;
    if (amountSats != BigInt(subscription.amount)) {
      resolve(new PaymentStatus.Rejected({
        reason: `Payment amount does not match subscription amount.\nExpected: ${subscription.amount} ${subscription.currency}\nReceived: ${amountSats} ${request.content.currency}`
      }));
      return false;
    }

    // If no payment has been executed, the nextOccurrence is the first payment due time
    let nextOccurrence: bigint | undefined = BigInt(subscription.recurrence_first_payment_due.getTime() / 1000);
    if (subscription.last_payment_date) {
      let lastPayment = BigInt(subscription.last_payment_date.getTime() / 1000);
      nextOccurrence = parseCalendar(subscription.recurrence_calendar).nextOccurrence(lastPayment);
    }
    console.log('next occurrence', nextOccurrence);

    if (!nextOccurrence || fromUnixSeconds(nextOccurrence) > new Date()) {
      resolve(new PaymentStatus.Rejected({
        reason: 'Payment is not due yet. Please wait till the next payment is scheduled.'
      }));
      return false
    }

    if (balance && request.content.amount > balance) {
      database.addActivity({
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
      });

      resolve(
        new PaymentStatus.Rejected({
          reason: 'Recurrent payment failed: insufficient wallet balance.'
        })
      );

      return false;
    }

    if (wallet) {
      // Save the payment
      const id = await database.addActivity({
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
      });

      resolve(
        new PaymentStatus.Approved,
      );

      await database.addPaymentStatusEntry(
        request.content.invoice,
        'payment_started',
      );

      // make the payment with nwc
      try {
        const preimage = await wallet.payInvoice(request.content.invoice);

        await database.addPaymentStatusEntry(
          request.content.invoice,
          'payment_completed',
        );

        // Update the subscription last payment date
        await database.updateSubscriptionLastPayment(subscription.id, new Date());

        // Update the activity status to positive
        await database.updateActivityStatus(id, 'positive');

        resolve(new PaymentStatus.Success({
          preimage,
        }));
      } catch (error) {
        console.error('Error paying invoice:', error);

        await database.addPaymentStatusEntry(
          request.content.invoice,
          'payment_failed',
        );

        // Update the activity status to negative
        await database.updateActivityStatus(id, 'negative');

        resolve(new PaymentStatus.Failed({
          reason: 'Payment failed: ' + error,
        }));
      }
    } else {
      database.addActivity({
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
      });

      resolve(
        new PaymentStatus.Rejected({
          reason: 'Recurring payment failed: user has no wallet linked'
        })
      );

      return false;
    }

    return false;
  } catch (e) {
    resolve(
      new PaymentStatus.Rejected({
        reason: `An unexpected error occurred while processing the payment: ${e}.\nPlease try again or contact support if the issue persists.`
      })
    );
    return false;
  }
}

export async function handleRecurringPaymentRequest(request: RecurringPaymentRequest, database: DatabaseService, resolve: (status: RecurringPaymentResponseContent) => void): Promise<boolean> {
  return true;
}

export async function handleCloseRecurringPaymentResponse(response: CloseRecurringPaymentResponse, database: DatabaseService, resolve: () => void): Promise<boolean> {
  try {
    await database.updateSubscriptionStatus(response.content.subscriptionId, 'cancelled');

    // Refresh UI to reflect the subscription status change
    console.log('Refreshing subscriptions UI after subscription closure');
    // Import the global event emitter to notify ActivitiesProvider
    const { globalEvents } = await import('@/utils/index');
    globalEvents.emit('subscriptionStatusChanged', {
      subscriptionId: response.content.subscriptionId,
      status: 'cancelled'
    });
  } catch (error) {
    console.error('Error setting closed recurring payment', error);
  }

  resolve();
  return false;
}
