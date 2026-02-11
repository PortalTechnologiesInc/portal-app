import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Currency_Tags,
  PaymentStatus,
  type PortalAppInterface,
  parseBolt11,
  parseCalendar,
  type SinglePaymentRequest,
} from 'portal-app-lib';
import { CurrencyConversionService } from '@/services/CurrencyConversionService';
import {
  type DatabaseService,
  fromUnixSeconds,
  type SubscriptionWithDates,
} from '@/services/DatabaseService';
import { formatAmountToHumanReadable } from '@/utils/common';
import { Currency, CurrencyHelpers, normalizeCurrencyForComparison } from '@/utils/currency';
import type { PendingRequest } from '@/utils/types';
import type { ActiveWalletProvider } from '../providers/ActiveWallet';
import type { PromptUserProvider } from '../providers/PromptUser';
import type { RelayStatusesProvider } from '../providers/RelayStatus';
import { Task } from '../WorkQueue';
import { SaveActivityTask } from './SaveActivity';
import { StartPaymentTask } from './StartPayment';

export class HandleSinglePaymentRequestTask extends Task<
  [SinglePaymentRequest],
  ['DatabaseService', 'ActiveWalletProvider', 'RelayStatusesProvider'],
  void
> {
  constructor(private readonly request: SinglePaymentRequest) {
    super(['DatabaseService', 'ActiveWalletProvider', 'RelayStatusesProvider'], request);
    this.expiry = new Date(Number(request.expiresAt * 1000n));
  }

  async taskLogic(
    {
      DatabaseService,
      ActiveWalletProvider,
      RelayStatusesProvider,
    }: {
      DatabaseService: DatabaseService;
      ActiveWalletProvider: ActiveWalletProvider;
      RelayStatusesProvider: RelayStatusesProvider;
    },
    request: SinglePaymentRequest
  ): Promise<void> {
    const subId = request.content.subscriptionId;
    try {
      const checkAmount = await new CheckAmountTask(request).run();

      if (!checkAmount) {
        await new SendSinglePaymentResponseTask(
          request,
          new PaymentStatus.Rejected({
            reason: `Invoice amount does not match the requested amount.`,
          })
        );
        return;
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
          currency = 'SATS';
          break;
      }

      // Convert currency for user's preferred currency using original amount
      let convertedAmount: number | null = null;
      let convertedCurrency: string | null = null;

      // todo create utils methods for asyncstorage
      let preferredCurrency = await AsyncStorage.getItem('preferred_currency');
      if (!preferredCurrency || !CurrencyHelpers.isValidCurrency(preferredCurrency)) {
        preferredCurrency = Currency.USD;
      }
      // Normalize stored currency for comparison (handle "sats" -> "SATS")
      const normalizedStoredCurrency = normalizeCurrencyForComparison(currency);
      const normalizedPreferredCurrency = normalizeCurrencyForComparison(preferredCurrency);

      // Skip conversion if currencies are the same (case-insensitive, with sats normalization)
      if (
        normalizedStoredCurrency &&
        normalizedPreferredCurrency &&
        normalizedStoredCurrency === normalizedPreferredCurrency
      ) {
        // No conversion needed - currencies match
        convertedAmount = null;
        convertedCurrency = null;
      } else {
        // Perform conversion
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

          convertedAmount = await new ConvertCurrencyTask(
            conversionAmount,
            sourceCurrency,
            preferredCurrency
          ).run();

          convertedCurrency = preferredCurrency;
        } catch (error) {
          console.error('Currency conversion error during payment:', error);
          // Continue without conversion - convertedAmount will remain null
          return;
        }
      }

      const notificationAmount =
        convertedAmount !== null && convertedCurrency ? convertedAmount : amount;
      const notificationCurrency =
        convertedAmount !== null && convertedCurrency ? convertedCurrency : currency;

      if (!subId) {
        console.log(`👤 Not a subscription, required user interaction!`);

        const paymentResponse = await new RequireSinglePaymentUserApprovalTask(
          request,
          'Payment Request',
          `Payment request of: ${formatAmountToHumanReadable(notificationAmount, notificationCurrency)}`
        ).run();
        console.log('paymentResponse', paymentResponse);

        return await new SendSinglePaymentResponseTask(request, paymentResponse).run();
      }

      console.log(
        `🤖 The request is from a subscription with id ${subId}. Checking to make automatic action.`
      );
      let subscription: SubscriptionWithDates;
      let subscriptionServiceName: string;
      try {
        const subscriptionFromDb = await DatabaseService.getSubscription(subId);
        if (!subscriptionFromDb) {
          await new SendSinglePaymentResponseTask(
            request,
            new PaymentStatus.Rejected({
              reason: `Subscription with ID ${subId} not found in database`,
            })
          ).run();
          console.warn(
            `🚫 Payment rejected! The request is a subscription payment, but no subscription found with id ${subId}`
          );
          return;
        }
        subscription = subscriptionFromDb;
        subscriptionServiceName = subscriptionFromDb.service_name;
      } catch (e) {
        await new SendSinglePaymentResponseTask(
          request,
          new PaymentStatus.Rejected({
            reason:
              'Failed to retrieve subscription from database. Please try again or contact support if the issue persists.',
          })
        ).run();
        console.warn(`🚫 Payment rejected! Failing to connect to database.`);
        return;
      }

      if (amount != subscription.amount || currency != subscription.currency) {
        await new SendSinglePaymentResponseTask(
          request,
          new PaymentStatus.Rejected({
            reason: `Payment amount does not match subscription amount.\nExpected: ${subscription.amount} ${subscription.currency}\nReceived: ${amount} ${request.content.currency}`,
          })
        ).run();
        console.warn(
          `🚫 Payment rejected! Amount does not match subscription amount.\nExpected: ${subscription.amount} ${subscription.currency}\nReceived: ${amount} ${request.content.currency}`
        );
        return;
      }

      // If no payment has been executed, the nextOccurrence is the first payment due time
      let nextOccurrence: bigint | undefined = BigInt(
        subscription.recurrence_first_payment_due.getTime() / 1000
      );
      if (subscription.last_payment_date) {
        const lastPayment = BigInt(subscription.last_payment_date.getTime() / 1000);
        nextOccurrence = parseCalendar(subscription.recurrence_calendar).nextOccurrence(
          lastPayment
        );
      }

      if (!nextOccurrence || fromUnixSeconds(nextOccurrence) > new Date()) {
        await new SendSinglePaymentResponseTask(
          request,
          new PaymentStatus.Rejected({
            reason: 'Payment is not due yet. Please wait till the next payment is scheduled.',
          })
        ).run();
        return;
      }

      await RelayStatusesProvider.waitForRelaysConnected();
      const walletInfo = await ActiveWalletProvider.getWallet()?.getWalletInfo();

      if (!walletInfo) {
        console.error('Wallet not provided');
        await new SaveActivityTask({
          type: 'pay',
          service_key: request.serviceKey,
          service_name: subscriptionServiceName,
          detail: 'Recurrent payment failed: wallet not provided.',
          date: new Date(),
          amount: amount,
          currency: currency,
          converted_amount: convertedAmount,
          converted_currency: convertedCurrency,
          request_id: request.eventId,
          status: 'negative',
          subscription_id: request.content.subscriptionId || null,
        }).run();

        await new SendSinglePaymentResponseTask(
          request,
          new PaymentStatus.Rejected({
            reason: 'Recurrent payment failed: no wallet provided.',
          })
        ).run();

        return;
      }

      const balance = walletInfo.balanceInSats;
      const isBalanceEnough = balance && balance > BigInt(amount);

      if (!isBalanceEnough) {
        await new SaveActivityTask({
          type: 'pay',
          service_key: request.serviceKey,
          service_name: subscriptionServiceName,
          detail: 'Recurrent payment failed: insufficient wallet balance.',
          date: new Date(),
          amount: amount,
          currency: currency,
          converted_amount: convertedAmount,
          converted_currency: convertedCurrency,
          request_id: request.eventId,
          status: 'negative',
          subscription_id: request.content.subscriptionId || null,
        }).run();

        await new SendSinglePaymentResponseTask(
          request,
          new PaymentStatus.Rejected({
            reason: 'Recurrent payment failed: insufficient wallet balance.',
          })
        ).run();

        return;
      }

      await new StartPaymentTask(
        {
          type: 'pay',
          service_key: request.serviceKey,
          service_name: subscriptionServiceName,
          detail: 'Recurrent payment',
          // todo: remove dates from entity. created_at already exists
          date: new Date(),
          amount: amount,
          currency: currency,
          converted_amount: convertedAmount,
          converted_currency: convertedCurrency,
          request_id: request.eventId,
          status: 'pending',
          subscription_id: request.content.subscriptionId || null,
          invoice: request.content.invoice,
        },
        request,
        subId
      ).run();

      return;
    } catch (e) {
      await new SendSinglePaymentResponseTask(
        request,
        new PaymentStatus.Rejected({
          reason: `An unexpected error occurred while processing the payment: ${e}.\nPlease try again or contact support if the issue persists.`,
        })
      ).run();
      console.warn(`🚫 Payment rejected! Error is: ${e}`);
    }
  }
}
Task.register(HandleSinglePaymentRequestTask);

class CheckAmountTask extends Task<[SinglePaymentRequest], [], boolean> {
  constructor(private readonly request: SinglePaymentRequest) {
    super([], request);
  }

  async taskLogic(_: {}, request: SinglePaymentRequest): Promise<boolean> {
    const invoiceData = parseBolt11(request.content.invoice);

    const invoiceAmountMsat = Number(invoiceData.amountMsat);
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
        typeof fiatCurrencyValue === 'string' ? String(fiatCurrencyValue).toUpperCase() : 'UNKNOWN';
      const rawFiatAmount = Number(request.content.amount);
      const normalizedFiatAmount = rawFiatAmount / 100; // incoming amount is in minor units (e.g., cents)
      const amountInMsat = await CurrencyConversionService.convertAmount(
        normalizedFiatAmount,
        fiatCurrency,
        'MSATS'
      );
      const requestAmountMsat = Math.round(amountInMsat);
      const difference = Math.abs(invoiceAmountMsat - requestAmountMsat);
      const tolerance = invoiceAmountMsat * TOLERANCE_PERCENT;
      return difference <= tolerance;
    }
    console.warn(
      `🚫 Payment not due! The invoice amount do not match the requested amount.\nReceived ${invoiceData.amountMsat}\nRequired ${request.content.amount}`
    );
    return false;
  }
}
Task.register(CheckAmountTask);

export class SendSinglePaymentResponseTask extends Task<
  [SinglePaymentRequest, PaymentStatus],
  ['PortalAppInterface', 'RelayStatusesProvider'],
  void
> {
  constructor(
    private readonly request: SinglePaymentRequest,
    private readonly response: PaymentStatus
  ) {
    super(['PortalAppInterface', 'RelayStatusesProvider'], request, response);
  }

  async taskLogic(
    {
      PortalAppInterface,
      RelayStatusesProvider,
    }: { PortalAppInterface: PortalAppInterface; RelayStatusesProvider: RelayStatusesProvider },
    request: SinglePaymentRequest,
    response: PaymentStatus
  ): Promise<void> {
    await RelayStatusesProvider.waitForRelaysConnected();
    console.log('sending response', {
      requestId: request.eventId,
      status: response,
    });
    return await PortalAppInterface.replySinglePaymentRequest(request, {
      requestId: request.eventId,
      status: response,
    });
  }
}
Task.register(SendSinglePaymentResponseTask);

export class ConvertCurrencyTask extends Task<[number, string, string], [], number> {
  constructor(
    private readonly amount: number,
    private readonly fromCurreny: string,
    private readonly toCurrency: string
  ) {
    super([], amount, fromCurreny, toCurrency);
    this.expiry = new Date(Date.now() + 1000 * 60 * 4); // cache it for 4 min
  }

  async taskLogic(_: {}, amount: number, fromCurreny: string, toCurrency: string): Promise<number> {
    return CurrencyConversionService.convertAmount(amount, fromCurreny, toCurrency);
  }
}
Task.register(ConvertCurrencyTask);

class RequireSinglePaymentUserApprovalTask extends Task<
  [SinglePaymentRequest, string, string],
  ['PromptUserProvider'],
  PaymentStatus
> {
  constructor(
    private readonly request: SinglePaymentRequest,
    private readonly title: string,
    private readonly body: string
  ) {
    super(['PromptUserProvider'], request, title, body);
  }

  async taskLogic(
    { PromptUserProvider }: { PromptUserProvider: PromptUserProvider },
    request: SinglePaymentRequest,
    title: string,
    body: string
  ): Promise<PaymentStatus> {
    console.log('[RequireSinglePaymentUserApprovalTask] Requesting user approval for:', {
      id: request.eventId,
      type: 'payment',
    });
    console.log(
      '[RequireSinglePaymentUserApprovalTask] SetPendingRequestsProvider available:',
      !!PromptUserProvider
    );
    return new Promise<PaymentStatus>(resolve => {
      // in the PromptUserProvider the promise will never be resolved when the app is offline.
      // that's ok because a notification is sent and the task must be resumed when the app is opened
      // starting from this task (prompting user with a pending instead of a notification).
      const newPendingRequest: PendingRequest = {
        id: request.eventId,
        metadata: request,
        timestamp: new Date(),
        type: 'payment',
        result: resolve,
      };

      const newNotification = {
        title: title,
        body: body,
        data: {
          type: 'payment',
        },
      };

      console.log(
        '[RequireAuthUserApprovalTask] Calling addPendingRequest for:',
        newPendingRequest.id
      );
      PromptUserProvider.promptUser({
        pendingRequest: newPendingRequest,
        notification: newNotification,
      });
      console.log(
        '[RequireAuthUserApprovalTask] addPendingRequest called, waiting for user approval'
      );
    });
  }
}
Task.register(RequireSinglePaymentUserApprovalTask);
