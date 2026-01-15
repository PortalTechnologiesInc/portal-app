import { PortalAppInterface, RecurringPaymentRequest, RecurringPaymentResponseContent } from "portal-app-lib";
import { Task } from "../WorkQueue";
import { PromptUserProvider } from "../providers/PromptUser";
import { PendingRequest } from "@/utils/types";
import { RelayStatusesProvider } from "../providers/RelayStatus";

export class HandleRecurringPaymentRequestTask extends Task<[RecurringPaymentRequest], [], void> {
  constructor(private readonly request: RecurringPaymentRequest) {
    super([], request);
    this.expiry = new Date(Number(request.expiresAt * 1000n));
  }

  async taskLogic(_: {}, request: RecurringPaymentRequest): Promise<void> {
    const subResponse = await new RequireRecurringPaymentUserApprovalTask(
      request,
      'Subscription Request',
      `Subscription request`,
    ).run();
    console.log('[ProcessIncomingRequestTask] User approval result:', subResponse);

    if (!subResponse) {
      // if null the app is offline, so a notification has already been scheduled
      return;
    }

    await new SendRecurringPaymentResponseTask(request, subResponse).run();

    const eventId = request.eventId
    console.log('[ProcessIncomingRequestTask] Task started for subscription request:', {
      id: eventId,
      type: 'subsctiption',
    });
  }
}
Task.register(HandleRecurringPaymentRequestTask);

class RequireRecurringPaymentUserApprovalTask extends Task<[RecurringPaymentRequest, string, string], ['PromptUserProvider'], RecurringPaymentResponseContent | null> {
  constructor(private readonly request: RecurringPaymentRequest, private readonly title: string, private readonly body: string) {
    super(['PromptUserProvider'], request, title, body);
  }

  async taskLogic({ PromptUserProvider }: { PromptUserProvider: PromptUserProvider }, request: RecurringPaymentRequest, title: string, body: string): Promise<RecurringPaymentResponseContent | null> {
    console.log('[RequireRecurringPaymentUserApprovalTask] Requesting user approval for:', {
      id: request.eventId,
      type: 'subscription',
    });
    console.log('[RequireRecurringPaymentUserApprovalTask] SetPendingRequestsProvider available:', !!PromptUserProvider);
    return new Promise<RecurringPaymentResponseContent | null>(resolve => {
      // in the PromptUserProvider the promise will be immediatly resolved as null when the app is offline
      // hence a notification should be shown instead of a pending request and the flow should stop
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
        }
      }

      console.log('[RequireRecurringPaymentUserApprovalTask] Calling addPendingRequest for:', newPendingRequest.id);
      PromptUserProvider.promptUser({
        pendingRequest: newPendingRequest, notification: newNotification
      });
      console.log('[RequireRecurringPaymentUserApprovalTask] addPendingRequest called, waiting for user approval');
    });
  }
}
Task.register(RequireRecurringPaymentUserApprovalTask);


export class SendRecurringPaymentResponseTask extends Task<[RecurringPaymentRequest, RecurringPaymentResponseContent], ['PortalAppInterface', 'RelayStatusesProvider'], void> {
  constructor(private readonly request: RecurringPaymentRequest, private readonly response: RecurringPaymentResponseContent) {
    super(['PortalAppInterface', 'RelayStatusesProvider'], request, response);
  }

  async taskLogic({ PortalAppInterface, RelayStatusesProvider }: { PortalAppInterface: PortalAppInterface, RelayStatusesProvider: RelayStatusesProvider }, request: RecurringPaymentRequest, response: RecurringPaymentResponseContent): Promise<void> {
    await RelayStatusesProvider.waitForRelaysConnected();
    return await PortalAppInterface.replyRecurringPaymentRequest(
      request,
      response,
    );
  }
}
Task.register(SendRecurringPaymentResponseTask);