import { PortalAppInterface, RecurringPaymentRequest, RecurringPaymentResponseContent } from "portal-app-lib";
import { Task } from "../WorkQueue";
import { PromptUserProvider } from "../providers/PromptUser";
import { PendingRequest } from "@/utils/types";
import { WaitForRelaysConnectedTask } from "./WaitForRelaysConnected";

export class HandleRecurringPaymentRequestTask extends Task<[RecurringPaymentRequest], [], void> {
  constructor(request: RecurringPaymentRequest) {
    super([request], [], async ([], request) => {

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
    });

    this.expiry = new Date(Number(request.expiresAt * 1000n));
  }
}
Task.register(HandleRecurringPaymentRequestTask);

class RequireRecurringPaymentUserApprovalTask extends Task<[RecurringPaymentRequest, string, string], [PromptUserProvider], RecurringPaymentResponseContent | null> {
  constructor(request: RecurringPaymentRequest, title: string, body: string) {
    super([request, title, body], ['PromptUserProvider'], async ([promptUserProvider], request, title, body) => {
      console.log('[RequireRecurringPaymentUserApprovalTask] Requesting user approval for:', {
        id: request.eventId,
        type: 'subscription',
      });
      console.log('[RequireRecurringPaymentUserApprovalTask] SetPendingRequestsProvider available:', !!promptUserProvider);
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
        promptUserProvider.promptUser({
          pendingRequest: newPendingRequest, notification: newNotification
        });
        console.log('[RequireRecurringPaymentUserApprovalTask] addPendingRequest called, waiting for user approval');
      });
    });
  }
}
Task.register(RequireRecurringPaymentUserApprovalTask);


export class SendRecurringPaymentResponseTask extends Task<[RecurringPaymentRequest, RecurringPaymentResponseContent], [PortalAppInterface], void> {
  constructor(request: RecurringPaymentRequest, response: RecurringPaymentResponseContent) {
    super([request, response], ['PortalAppInterface'], async ([portalApp], request, response) => {
      await new WaitForRelaysConnectedTask().run();
      return await portalApp.replyRecurringPaymentRequest(
        request,
        response,
      );
    });
  }
}
Task.register(SendRecurringPaymentResponseTask);