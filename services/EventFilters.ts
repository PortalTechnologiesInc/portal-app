import { AuthChallengeEvent, AuthResponseStatus, CloseRecurringPaymentResponse, PaymentResponseContent, RecurringPaymentRequest, RecurringPaymentResponseContent, SinglePaymentRequest, PaymentStatus, Nwc, parseCalendar } from "portal-app-lib";
import { DatabaseService, fromUnixSeconds, SubscriptionWithDates } from "./database";
import { getWalletUrl } from "./SecureStorageService";

export async function handleAuthChallenge(event: AuthChallengeEvent, database: DatabaseService, resolve: (status: AuthResponseStatus) => void): Promise<boolean> {
  return true;
}

export async function handleSinglePaymentRequest(serviceName: string, request: SinglePaymentRequest, database: DatabaseService, resolve: (status: PaymentStatus) => void): Promise<boolean> {
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

    if (request.content.amount != BigInt(subscription.amount)) {
      resolve(new PaymentStatus.Rejected({
        reason: `Payment amount does not match subscription amount.\nExpected: ${subscription.amount} ${subscription.currency}\nReceived: ${request.content.amount} ${request.content.currency}`
      }));
      return false;
    }

    // we assume that if the last_payment_date is null no payment has been executed yet, so we look for the first payment due.
    let lastPayment = BigInt((subscription.last_payment_date?.getTime() ?? subscription.recurrence_first_payment_due.getTime()) / 1000);
    let nextOccurence = parseCalendar(subscription.recurrence_calendar).nextOccurrence(lastPayment)

    if (!nextOccurence || fromUnixSeconds(nextOccurence) > new Date()) {
      resolve(new PaymentStatus.Rejected({
        reason: 'Payment is not due yet. Please wait till the next payment is scheduled.'
      }));
      return false
    }

    if (balance && request.content.amount < balance) {
      database.addActivity({
        type: 'pay',
        service_key: request.serviceKey,
        service_name: serviceName,
        detail: 'Recurrent payment failed: insufficient wallet balance.',
        date: new Date(),
        amount: Number(request.content.amount),
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
      // make the payment with nwc
      await wallet.payInvoice(request.content.invoice);
    }

    // if the payment is succesful then update the sub last payment
    database.updateSubscriptionLastPayment(subscription.id, Date.now());


    resolve(
      new PaymentStatus.Approved,
    );
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
