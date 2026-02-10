import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type InvoiceRequestContentWithKey,
  InvoiceResponse,
  type PortalAppInterface,
} from 'portal-app-lib';
import {
  Currency,
  CurrencyHelpers,
  convertLibCurrencyAmount,
  normalizeCurrencyForComparison,
} from '@/utils/currency';
import { getServiceNameFromProfile } from '@/utils/nostrHelper';
import { ActivityStatus, ActivityType } from '@/utils/types';
import { Task } from '../WorkQueue';
import { FetchServiceProfileTask } from './HandleAuthRequest';
import { ConvertCurrencyTask } from './HandleSinglePaymentRequest';
import { type SaveActivityArgs } from './SaveActivity';
import { SaveActivityAndAddPaymentStatusTransactionalTask } from './StartPayment';
import { GetActivityFromInvoiceTask } from './GetActivity';
import type { RelayStatusesProvider } from '../providers/RelayStatus';
import type { ActiveWalletProvider } from '../providers/ActiveWallet';

export class HandleInvoiceRequestTask extends Task<[InvoiceRequestContentWithKey], [], void> {
  constructor(event: InvoiceRequestContentWithKey) {
    super([], event);
    this.expiry = new Date(Number(event.inner.expiresAt * 1000n));
  }

  async taskLogic(_: {}, event: InvoiceRequestContentWithKey): Promise<void> {
    console.log('[HandleInvoiceRequestTask] Invoice request received:', event);

    const eventId = event.inner.requestId;
    console.log('[HandleInvoiceRequestTask] Task started for request:', {
      id: eventId,
      type: 'invoiceRequest',
    });

    const serviceKey = event.mainKey;
    console.log('[HandleInvoiceRequestTask] Fetching profile for serviceKey:', serviceKey);
    const name = await new FetchServiceProfileTask(serviceKey)
      .run()
      .then(profile => getServiceNameFromProfile(profile));
    console.log('[HandleInvoiceRequestTask] Calling SaveActivityTask');

    const [amount, currency] = convertLibCurrencyAmount(event.inner.amount, event.inner.currency);
    let convertedAmount = null;
    let convertedCurrency = null;
    let preferredCurrency = await AsyncStorage.getItem('preferred_currency');
    if (!preferredCurrency || !CurrencyHelpers.isValidCurrency(preferredCurrency)) {
      preferredCurrency = Currency.USD;
    }
    // Normalize stored currency for comparison (handle "sats" -> "SATS")
    const normalizedStoredCurrency = normalizeCurrencyForComparison(currency);
    const normalizedPreferredCurrency = normalizeCurrencyForComparison(preferredCurrency);

    // Skip conversion if currencies are the same (case-insensitive, with sats normalization)
    if (
      !(
        normalizedStoredCurrency &&
        normalizedPreferredCurrency &&
        normalizedStoredCurrency === normalizedPreferredCurrency
      )
    ) {
      // Perform conversion
      try {
        convertedAmount = await new ConvertCurrencyTask(amount, currency, preferredCurrency).run();
        convertedCurrency = preferredCurrency;
      } catch (error) {
        console.error('Currency conversion error payment/refund processing:', error);
        // Continue without conversion - convertedAmount will remain null
        return;
      }
    }

    let isRefund = false;
    let isPartialRefund = false;
    const invoiceToBeRefunded = event.inner.refundInvoice;
    let activityToBeRefunded = null;

    if (invoiceToBeRefunded) {
      activityToBeRefunded = await new GetActivityFromInvoiceTask(invoiceToBeRefunded).run();
      if (!activityToBeRefunded) {
        console.warn('[HandleInvoiceRequestTask] Receiving refund for invoice not found in database.', {
          invoiceToBeRefunded,
        });
      }

      const [activityAmount, activityCurrency] = [activityToBeRefunded?.amount ?? 0, activityToBeRefunded?.currency ?? ''];
      if (
        !(BigInt(activityAmount) === BigInt(event.inner.amount) &&
          normalizeCurrencyForComparison(activityCurrency) === normalizeCurrencyForComparison(currency))
      ) {
        console.warn('[HandleInvoiceRequestTask] Refund invoice request recieved but there is an amount/currency mismatch. Proceeding anyway.', {
          requestedAmount: event.inner.amount,
          requestedCurrency: event.inner.currency,
          oldAmount: activityAmount,
          oldCurrency: activityCurrency,
        });
        isPartialRefund = true;
      }
    }

    // todo: create invoice and send the response to the library
    const invoice = await new CreateInvoiceTask(event.inner.amount, event.inner.description).run();

    await new SendInvoiceResponseTask(event, {
      request: event,
      invoice: invoice,
      paymentHash: undefined,
    }).run();

    const activity: SaveActivityArgs = {
      type: isRefund ? ActivityType.Refund : ActivityType.Receive,
      service_key: serviceKey,
      detail: isRefund
        ? (
          isPartialRefund
            ? 'Waiting for partial refund'
            : 'Waiting for full refund'
        )
        : 'Waiting to receive payment',
      date: new Date(),
      service_name: name ?? 'Unknown Service',
      amount: amount,
      currency: currency,
      converted_amount: convertedAmount,
      converted_currency: convertedCurrency,
      request_id: eventId,
      subscription_id: null,
      status: ActivityStatus.Pending,
      refunded_activity_id: activityToBeRefunded?.id ?? null,
    };

    await new SaveActivityAndAddPaymentStatusTransactionalTask(
      activity,
      invoice,
    ).run();

    console.log('saved activity');
  }
}
Task.register(HandleInvoiceRequestTask);

export class SendInvoiceResponseTask extends Task<
  [InvoiceRequestContentWithKey, InvoiceResponse],
  ['PortalAppInterface', 'RelayStatusesProvider'],
  void
> {
  constructor(
    private readonly request: InvoiceRequestContentWithKey,
    private readonly response: InvoiceResponse
  ) {
    super(['PortalAppInterface', 'RelayStatusesProvider'], request, response);
  }

  async taskLogic(
    {
      PortalAppInterface,
      RelayStatusesProvider,
    }: { PortalAppInterface: PortalAppInterface; RelayStatusesProvider: RelayStatusesProvider },
    request: InvoiceRequestContentWithKey,
    response: InvoiceResponse
  ): Promise<void> {
    await RelayStatusesProvider.waitForRelaysConnected();
    return await PortalAppInterface.replyInvoiceRequest(request, response);
  }
}
Task.register(SendInvoiceResponseTask);

export class CreateInvoiceTask extends Task<[bigint, string | undefined], ['ActiveWalletProvider'], string> {
  constructor(private readonly amount: bigint, private readonly description?: string | undefined) {
    super(['ActiveWalletProvider'], amount, description);
  }

  async taskLogic(
    { ActiveWalletProvider }: { ActiveWalletProvider: ActiveWalletProvider },
    amount: bigint,
    description?: string | undefined): Promise<string> {
    const wallet = ActiveWalletProvider.getWallet();
    if (!wallet) {
      console.error('No wallet found');
      throw new Error('No wallet found');
    }
    return await wallet.receivePayment(amount, description);
  }
}