import { AuthChallengeEvent, AuthResponseStatus, CloseRecurringPaymentResponse, PaymentResponseContent, RecurringPaymentRequest, RecurringPaymentResponseContent, SinglePaymentRequest, PaymentStatus, Nwc } from "portal-app-lib";
import { DatabaseService } from "./database";
import { getWalletUrl } from "./SecureStorageService";

export async function handleAuthChallenge(event: AuthChallengeEvent, database: DatabaseService, resolve: (status: AuthResponseStatus) => void): Promise<boolean> {
  return true;
}

export async function handleSinglePaymentRequest(request: SinglePaymentRequest, database: DatabaseService, resolve: (status: PaymentResponseContent) => void): Promise<boolean> {
  const walletUrl = await getWalletUrl();
  try {
    let wallet: Nwc;
    let balance: number | undefined;

    if (walletUrl) {
      wallet = new Nwc(walletUrl);
      await wallet.getInfo();
      balance = Number((await wallet.getBalance()));
    }
    // TODO choose a strategy to present the balance error to the user

    let subId = request.content.subscriptionId;
    if (!subId || (balance && request.content.amount < balance)) {
      return true;
    }

    try {
      let subscription = await database.getSubscription(subId);
      if (!subscription) {
        resolve({
          status: new PaymentStatus.Rejected({
            reason: 'Subscription not found!'
          }),
          requestId: request.content.requestId,
        });
        return false;
      }
    } catch (e) {
      resolve({
        status: new PaymentStatus.Rejected({
          reason: 'Something went wrong when retrieving the subscription!'
        }),
        requestId: request.content.requestId,
      });
      return false;
    }

    resolve({
      status: new PaymentStatus.Pending,
      requestId: request.content.requestId,
    });
    return false;
  } catch (e) {
    resolve({
      status: new PaymentStatus.Rejected({
        reason: 'Something went wrong processing the payment!'
      }),
      requestId: request.content.requestId,
    });
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
