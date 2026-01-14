import { DatabaseService, PaymentAction } from "@/services/DatabaseService";
import { Task } from "../WorkQueue";
import { SaveActivityArgs, SaveActivityTask } from "./SaveActivity";
import { PaymentStatus, SinglePaymentRequest } from "portal-app-lib";
import { ActiveWalletProvider } from "../providers/ActiveWallet";
import { SendSinglePaymentResponseTask } from "./HandleSinglePaymentRequest";
import { globalEvents } from "@/utils/common";
import { RelayStatusesProvider } from "../providers/RelayStatus";

export class StartPaymentTask extends Task<[SaveActivityArgs, SinglePaymentRequest, string], [RelayStatusesProvider], void> {
  constructor(private readonly initialActivityData: SaveActivityArgs, private readonly request: SinglePaymentRequest, private readonly subsctiptionId: string) {
    super([initialActivityData, request, subsctiptionId], ['RelayStatusesProvider'], async ([relayStatusesProvider], initialActivityData, request, subscriptionId) => {
      await relayStatusesProvider.waitForRelaysConnected();

      const id = await new SaveActivityTask(initialActivityData).run();

      await new SendSinglePaymentResponseTask(request, new PaymentStatus.Approved()).run();
      await new AddPaymentStatusTask(request.content.invoice, 'payment_started').run();

      try {
        const preimage = await new PayInvoiceTask(request.content.invoice, request.content.amount).run();
        if (!preimage) {
          await new UpdateActivityStatusTask(id, 'negative', 'Recurrent payment failed: no wallet is connected.').run();
          await new SendSinglePaymentResponseTask(request, new PaymentStatus.Failed({
            reason: 'Recurring payment failed: user has no linked wallet',
          })).run();
          return
        }
        await new SendSinglePaymentResponseTask(request, new PaymentStatus.Success({ preimage })).run();

        await new UpdateSubscriptionLastPaymentTask(subscriptionId).run();
        await new AddPaymentStatusTask(request.content.invoice, 'payment_completed').run();
        await new UpdateActivityStatusTask(id, 'positive', 'Payment completed').run();
      } catch (error) {
        console.error(
          'Error paying invoice:',
          JSON.stringify(error, Object.getOwnPropertyNames(error))
        );
        await new AddPaymentStatusTask(request.content.invoice, 'payment_failed').run();
        await new UpdateActivityStatusTask(id, 'negative', 'Payment approved but failed to process').run();
        await new SendSinglePaymentResponseTask(request, new PaymentStatus.Failed({
          reason: 'Payment failed: ' + error,
        })).run();
        console.warn(`🚫 Payment failed! Error is: ${error}`);
      }

    });
    this.expiry = new Date(Date.now() + 1000 * 60 * 60 * 24);
  }
}
Task.register(StartPaymentTask);

class AddPaymentStatusTask extends Task<[string, PaymentAction], [DatabaseService], void> {
  constructor(private readonly invoice: string, action: PaymentAction) {
    console.log('[AddPaymentStatusTask] getting DatabaseService');
    super([invoice, action], ['DatabaseService'], async ([db], invoice, action) => {
      await db.addPaymentStatusEntry(invoice, action);
    });
  }
}
Task.register(AddPaymentStatusTask);

// returns the invoice preimage
class PayInvoiceTask extends Task<[string, bigint], [ActiveWalletProvider], string | undefined> {
  constructor(private readonly invoice: string, private readonly amount: bigint) {
    console.log('[PayInvoiceTask] getting Wallet');
    super([invoice, amount], ['ActiveWalletProvider'], async ([activeWalletProvider], invoice, amount) => {
      const preimage = await activeWalletProvider.getWallet()?.sendPayment(invoice, amount);
      console.log('🧾 Invoice paid!');
      return preimage;
    });
  }
}
Task.register(PayInvoiceTask);

class UpdateSubscriptionLastPaymentTask extends Task<[string], [DatabaseService], void> {
  constructor(private readonly subscriptionId: string) {
    console.log('[UpdateSubsctiptionLastPaymentTask] getting DatabaseService');
    super([subscriptionId], ['DatabaseService'], async ([db], subsctiptionId) => {
      await db.updateSubscriptionLastPayment(subscriptionId, new Date());
    });
  }
}
Task.register(UpdateSubscriptionLastPaymentTask);

type ActivityPaymentStatus = 'neutral' | 'positive' | 'negative' | 'pending';
class UpdateActivityStatusTask extends Task<[string, ActivityPaymentStatus, string], [DatabaseService], void> {
  constructor(private readonly id: string, private readonly status: ActivityPaymentStatus, private readonly statusDetail: string) {
    console.log('[UpdateActivityStatusTask] getting DatabaseService');
    super([id, status, statusDetail], ['DatabaseService'], async ([db], id, status, statusDetail) => {
      await db.updateActivityStatus(id, status, statusDetail);
      globalEvents.emit('activityUpdated', { activityId: id });
    });
  }
}
Task.register(UpdateActivityStatusTask);