import type {
  PortalAppInterface,
  RecurringPaymentRequest,
  RecurringPaymentResponseContent,
} from 'portal-app-lib';
import type { PendingRequest } from '@/utils/types';
import type { PromptUserProvider } from '../providers/PromptUser';
import type { RelayStatusesProvider } from '../providers/RelayStatus';
import { Task } from '../WorkQueue';

export class HandleRecurringPaymentRequestTask extends Task<[RecurringPaymentRequest], [], void> {
  constructor(private readonly request: RecurringPaymentRequest) {
    super([], request);
    this.expiry = new Date(Number(request.expiresAt * 1000n));
  }

  async taskLogic(_: {}, request: RecurringPaymentRequest): Promise<void> {
    const subResponse = await new RequireRecurringPaymentUserApprovalTask(
      request,
      'Subscription Request',
      `Subscription request`
    ).run();
    console.log('[ProcessIncomingRequestTask] User approval result:', subResponse);

    await new SendRecurringPaymentResponseTask(request, subResponse).run();

    const eventId = request.eventId;
    console.log('[ProcessIncomingRequestTask] Task started for subscription request:', {
      id: eventId,
      type: 'subsctiption',
    });
  }
}
Task.register(HandleRecurringPaymentRequestTask);

class RequireRecurringPaymentUserApprovalTask extends Task<
  [RecurringPaymentRequest, string, string],
  ['PromptUserProvider'],
  RecurringPaymentResponseContent
> {
  constructor(
    private readonly request: RecurringPaymentRequest,
    private readonly title: string,
    private readonly body: string
  ) {
    super(['PromptUserProvider'], request, title, body);
  }

  async taskLogic(
    { PromptUserProvider }: { PromptUserProvider: PromptUserProvider },
    request: RecurringPaymentRequest,
    title: string,
    body: string
  ): Promise<RecurringPaymentResponseContent> {
    console.log('[RequireRecurringPaymentUserApprovalTask] Requesting user approval for:', {
      id: request.eventId,
      type: 'subscription',
    });
    console.log(
      '[RequireRecurringPaymentUserApprovalTask] SetPendingRequestsProvider available:',
      !!PromptUserProvider
    );
    return new Promise<RecurringPaymentResponseContent>(resolve => {
      // in the PromptUserProvider the promise will never be resolved when the app is offline.
      // that's ok because a notification is sent and the task must be resumed when the app is opened
      // starting from this task (prompting user with a pending instead of a notification).
      const newPendingRequest: PendingRequest = {
        id: request.eventId,
        metadata: request,
        timestamp: new Date(),
        type: 'subscription',
        result: resolve,
      };

      const newNotification = {
        title: title,
        body: body,
        data: {
          type: 'subscription',
        },
      };

      console.log(
        '[RequireRecurringPaymentUserApprovalTask] Calling addPendingRequest for:',
        newPendingRequest.id
      );
      PromptUserProvider.promptUser({
        pendingRequest: newPendingRequest,
        notification: newNotification,
      });
      console.log(
        '[RequireRecurringPaymentUserApprovalTask] addPendingRequest called, waiting for user approval'
      );
    });
  }
}
Task.register(RequireRecurringPaymentUserApprovalTask);

export class SendRecurringPaymentResponseTask extends Task<
  [RecurringPaymentRequest, RecurringPaymentResponseContent],
  ['PortalAppInterface', 'RelayStatusesProvider'],
  void
> {
  constructor(
    private readonly request: RecurringPaymentRequest,
    private readonly response: RecurringPaymentResponseContent
  ) {
    super(['PortalAppInterface', 'RelayStatusesProvider'], request, response);
  }

  async taskLogic(
    {
      PortalAppInterface,
      RelayStatusesProvider,
    }: { PortalAppInterface: PortalAppInterface; RelayStatusesProvider: RelayStatusesProvider },
    request: RecurringPaymentRequest,
    response: RecurringPaymentResponseContent
  ): Promise<void> {
    await RelayStatusesProvider.waitForRelaysConnected();
    return await PortalAppInterface.replyRecurringPaymentRequest(request, response);
  }
}
Task.register(SendRecurringPaymentResponseTask);
