import { DatabaseService, PaymentAction } from "@/services/DatabaseService";
import { Task } from "../WorkQueue";
import { SaveActivityArgs, SaveActivityTask } from "./SaveActivity";
import { PaymentStatus, SinglePaymentRequest } from "portal-app-lib";
import { ActiveWalletProvider } from "../providers/ActiveWallet";
import { SendSinglePaymentResponseTask } from "./HandleSinglePaymentRequest";
import { globalEvents } from "@/utils/common";
import { RelayStatusesProvider } from "../providers/RelayStatus";

export class StartPaymentTask extends Task<[SaveActivityArgs, SinglePaymentRequest, string], ['RelayStatusesProvider'], void> {
  constructor(private readonly initialActivityData: SaveActivityArgs, private readonly request: SinglePaymentRequest, private readonly subsctiptionId: string) {
    super(['RelayStatusesProvider'], initialActivityData, request, subsctiptionId);
    this.expiry = new Date(Date.now() + 1000 * 60 * 60 * 24);
  }

  async taskLogic({ RelayStatusesProvider }: { RelayStatusesProvider: RelayStatusesProvider }, initialActivityData: SaveActivityArgs, request: SinglePaymentRequest, subscriptionId: string): Promise<void> {
    await RelayStatusesProvider.waitForRelaysConnected();

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
  }
}
Task.register(StartPaymentTask);

class AddPaymentStatusTask extends Task<[string, PaymentAction], ['DatabaseService'], void> {
  constructor(private readonly invoice: string, action: PaymentAction) {
    console.log('[AddPaymentStatusTask] getting DatabaseService');
    super(['DatabaseService'], invoice, action);
  }

  async taskLogic({ DatabaseService }: { DatabaseService: DatabaseService }, invoice: string, action: PaymentAction): Promise<void> {
    await DatabaseService.addPaymentStatusEntry(invoice, action);
  }
}
Task.register(AddPaymentStatusTask);

// returns the invoice preimage
class PayInvoiceTask extends Task<[string, bigint], ['ActiveWalletProvider'], string | undefined> {
  constructor(private readonly invoice: string, private readonly amount: bigint) {
    console.log('[PayInvoiceTask] getting Wallet');
    super(['ActiveWalletProvider'], invoice, amount);
  }

  async taskLogic({ ActiveWalletProvider }: { ActiveWalletProvider: ActiveWalletProvider }, invoice: string, amount: bigint): Promise<string | undefined> {
    const preimage = await ActiveWalletProvider.getWallet()?.sendPayment(invoice, amount);
    console.log('🧾 Invoice paid!');
    return preimage;
  }
}
Task.register(PayInvoiceTask);

class UpdateSubscriptionLastPaymentTask extends Task<[string], ['DatabaseService'], void> {
  constructor(private readonly subscriptionId: string) {
    console.log('[UpdateSubsctiptionLastPaymentTask] getting DatabaseService');
    super(['DatabaseService'], subscriptionId);
  }

  async taskLogic({ DatabaseService }: { DatabaseService: DatabaseService }, subscriptionId: string): Promise<void> {
    await DatabaseService.updateSubscriptionLastPayment(subscriptionId, new Date());
  }
}
Task.register(UpdateSubscriptionLastPaymentTask);

type ActivityPaymentStatus = 'neutral' | 'positive' | 'negative' | 'pending';
class UpdateActivityStatusTask extends Task<[string, ActivityPaymentStatus, string], ['DatabaseService'], void> {
  constructor(private readonly id: string, private readonly status: ActivityPaymentStatus, private readonly statusDetail: string) {
    console.log('[UpdateActivityStatusTask] getting DatabaseService');
    super(['DatabaseService'], id, status, statusDetail);
  }

  async taskLogic({ DatabaseService }: { DatabaseService: DatabaseService }, id: string, status: ActivityPaymentStatus, statusDetail: string): Promise<void> {
    await DatabaseService.updateActivityStatus(id, status, statusDetail);
    globalEvents.emit('activityUpdated', { activityId: id });
  }
}
Task.register(UpdateActivityStatusTask);