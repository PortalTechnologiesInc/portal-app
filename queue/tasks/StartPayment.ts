import { PaymentStatus, type SinglePaymentRequest } from 'portal-app-lib';
import { DatabaseService } from '@/services/DatabaseService';
import { PaymentAction } from '@/utils/types';
import { ActivityStatus, globalEvents } from '@/utils/common';
import type { ActiveWalletProvider } from '../providers/ActiveWallet';
import type { RelayStatusesProvider } from '../providers/RelayStatus';
import { Task, TransactionalTask } from '../WorkQueue';
import { SendSinglePaymentResponseTask } from './HandleSinglePaymentRequest';
import { type SaveActivityArgs, SaveActivityTask } from './SaveActivity';

export class StartPaymentTask extends Task<
  [SaveActivityArgs, SinglePaymentRequest, string],
  ['RelayStatusesProvider'],
  void
> {
  constructor(
    private readonly initialActivityData: SaveActivityArgs,
    private readonly request: SinglePaymentRequest,
    private readonly subsctiptionId: string
  ) {
    super(['RelayStatusesProvider'], initialActivityData, request, subsctiptionId);
    this.expiry = new Date(Date.now() + 1000 * 60 * 60 * 24);
  }

  async taskLogic(
    { RelayStatusesProvider }: { RelayStatusesProvider: RelayStatusesProvider },
    initialActivityData: SaveActivityArgs,
    request: SinglePaymentRequest,
    subscriptionId: string
  ): Promise<void> {
    await RelayStatusesProvider.waitForRelaysConnected();

    const id = await new SaveActivityAndAddPaymentStatusTransactionalTask(
      initialActivityData,
      request.content.invoice,
      PaymentAction.PaymentStarted
    ).run();
    await new SendSinglePaymentResponseTask(request, new PaymentStatus.Approved()).run();

    try {
      const preimage = await new PayInvoiceTask(
        request.content.invoice,
        request.content.amount
      ).run();
      if (!preimage) {
        await new UpdateActivityStatusTask(
          id,
          ActivityStatus.Negative,
          'Recurrent payment failed: no wallet is connected.'
        ).run();
        await new SendSinglePaymentResponseTask(
          request,
          new PaymentStatus.Failed({
            reason: 'Recurring payment failed: user has no linked wallet',
          })
        ).run();
        return;
      }
      await new SendSinglePaymentResponseTask(
        request,
        new PaymentStatus.Success({ preimage })
      ).run();

      await new UpdatePaymentResultTransactionalTask(
        id,
        ActivityStatus.Positive,
        'Payment Completed',
        request.content.invoice,
        PaymentAction.PaymentCompleted,
        subscriptionId
      ).run();
    } catch (error) {
      console.error(
        'Error paying invoice:',
        JSON.stringify(error, Object.getOwnPropertyNames(error))
      );

      await new UpdatePaymentResultTransactionalTask(
        id,
        ActivityStatus.Negative,
        'Payment approved but failed to process',
        request.content.invoice,
        PaymentAction.PaymentFailed,
        null
      ).run();

      await new SendSinglePaymentResponseTask(
        request,
        new PaymentStatus.Failed({
          reason: 'Payment failed: ' + error,
        })
      ).run();
      console.warn(`🚫 Payment failed! Error is: ${error}`);
    }
  }
}
Task.register(StartPaymentTask);

export class SaveActivityAndAddPaymentStatusTransactionalTask extends TransactionalTask<
  [SaveActivityArgs, string, string | undefined],
  [],
  string
> {
  constructor(
    private readonly activity: SaveActivityArgs,
    private readonly invoice: string,
    private readonly invoiceToBeRefunded?: string | undefined,
  ) {
    console.log('[SaveActivityAndAddPaymentStatusTransactionalTask] starting task');
    super([], activity, invoice, invoiceToBeRefunded);
  }

  async taskLogic(
    _: {},
    activity: SaveActivityArgs,
    invoice: string,
    invoiceToBeRefunded?: string | undefined,
  ): Promise<string> {
    await new AddPaymentStatusTask(invoice, PaymentAction.PaymentStarted).run();
    if (invoiceToBeRefunded) {
      await new AddPaymentStatusTask(invoiceToBeRefunded, PaymentAction.RefundStarted).run();
    }
    const id = await new SaveActivityTask(activity).run();
    return id;
  }
}
Task.register(SaveActivityAndAddPaymentStatusTransactionalTask);

export class UpdatePaymentResultTransactionalTask extends TransactionalTask<
  [string, ActivityStatus, string, string, PaymentAction, string | null],
  [],
  void
> {
  constructor(
    private readonly activityId: string,
    private readonly activityStatus: ActivityStatus,
    private readonly statusDesctiption: string,
    private readonly invoice: string,
    private readonly action: PaymentAction,
    private readonly subscriptionId: string | null
  ) {
    console.log('[SaveActivityAndAddPaymentStatusTransactionalTask] starting task');
    super([], activityId, activityStatus, statusDesctiption, invoice, action, subscriptionId);
  }

  async taskLogic(
    _: {},
    activityId: string,
    activityStatus: ActivityStatus,
    statusDesctiption: string,
    invoice: string,
    action: PaymentAction,
    subscriptionId: string | null
  ): Promise<void> {
    await new AddPaymentStatusTask(invoice, action).run();
    await new UpdateActivityStatusTask(activityId, activityStatus, statusDesctiption).run();

    if (subscriptionId) {
      await new UpdateSubscriptionLastPaymentTask(subscriptionId).run();
    }
  }
}
Task.register(UpdatePaymentResultTransactionalTask);

class AddPaymentStatusTask extends Task<[string, PaymentAction], ['DatabaseService'], void> {
  constructor(
    private readonly invoice: string,
    private readonly action: PaymentAction
  ) {
    console.log('[AddPaymentStatusTask] getting DatabaseService');
    super(['DatabaseService'], invoice, action);
  }

  async taskLogic(
    { DatabaseService }: { DatabaseService: DatabaseService },
    invoice: string,
    action: PaymentAction
  ): Promise<void> {
    await DatabaseService.addPaymentStatusEntry(invoice, action);
  }
}
Task.register(AddPaymentStatusTask);

// returns the invoice preimage
class PayInvoiceTask extends Task<[string, bigint], ['ActiveWalletProvider'], string | undefined> {
  constructor(
    private readonly invoice: string,
    private readonly amount: bigint
  ) {
    console.log('[PayInvoiceTask] getting Wallet');
    super(['ActiveWalletProvider'], invoice, amount);
  }

  async taskLogic(
    { ActiveWalletProvider }: { ActiveWalletProvider: ActiveWalletProvider },
    invoice: string,
    amount: bigint
  ): Promise<string | undefined> {
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

  async taskLogic(
    { DatabaseService }: { DatabaseService: DatabaseService },
    subscriptionId: string
  ): Promise<void> {
    await DatabaseService.updateSubscriptionLastPayment(subscriptionId, new Date());
  }
}
Task.register(UpdateSubscriptionLastPaymentTask);

class UpdateActivityStatusTask extends Task<
  [string, ActivityStatus, string],
  ['DatabaseService'],
  void
> {
  constructor(
    private readonly id: string,
    private readonly status: ActivityStatus,
    private readonly statusDetail: string
  ) {
    console.log('[UpdateActivityStatusTask] getting DatabaseService');
    super(['DatabaseService'], id, status, statusDetail);
  }

  async taskLogic(
    { DatabaseService }: { DatabaseService: DatabaseService },
    id: string,
    status: ActivityStatus,
    statusDetail: string
  ): Promise<void> {
    await DatabaseService.updateActivityStatus(id, status, statusDetail);
    globalEvents.emit('activityUpdated', { activityId: id });
  }
}
Task.register(UpdateActivityStatusTask);
