import { PendingRequest } from "@/utils/types";
import { Task } from "../WorkQueue";
import { AuthChallengeEvent, AuthResponseStatus, PortalAppInterface, Profile } from "portal-app-lib";
import { getServiceNameFromProfile } from "@/utils/nostrHelper";
import { ActivityWithDates, DatabaseService } from "@/services/DatabaseService";
import { PromptUserProvider } from "../providers/PromptUser";
import { WaitForRelaysConnectedTask } from "./WaitForRelaysConnected";
import { SaveActivityTask } from "./SaveActivity";

export class ProcessAuthRequestTask extends Task<[AuthChallengeEvent], [], void> {
  constructor(event: AuthChallengeEvent) {
    super([event], [], async ([], event) => {

      const authResponse = await new RequireAuthUserApprovalTask(event).run();
      console.log('[ProcessIncomingRequestTask] User approval result:', authResponse);

      if (!authResponse) {
        // if null the app is offline, so a notification has already been scheduled
        return;
      }

      await new SendAuthChallengeResponseTask(event, authResponse).run();

      const eventId = event.eventId
      console.log('[ProcessIncomingRequestTask] Task started for request:', {
        id: eventId,
        type: 'login',
      });

      const serviceKey = event.serviceKey;
      console.log('[ProcessIncomingRequestTask] Fetching profile for serviceKey:', serviceKey);
      const profile = await new FetchServiceNameTask(serviceKey).run();
      const name = getServiceNameFromProfile(profile);
      console.log('[ProcessIncomingRequestTask] Service name resolved:', name);
      console.log('[ProcessIncomingRequestTask] Calling RequireAuthUserApprovalTask');

      await new SaveActivityTask({
        type: 'auth',
        service_key: serviceKey,
        detail: 'User approved login',
        date: new Date(),
        service_name: name || 'Unknown Service',
        amount: null,
        currency: null,
        converted_amount: null,
        converted_currency: null,
        request_id: eventId,
        subscription_id: null,
        status: authResponse ? 'positive' : 'negative',
      }).run();

      console.log('saved activity');
    });

    this.expiry = new Date(Number(event.expiresAt * 1000n));
  }
}
Task.register(ProcessAuthRequestTask);

class FetchServiceNameTask extends Task<[string], [PortalAppInterface], Profile | undefined> {
  constructor(key: string) {
    console.log('[FetchServiceNameTask] getting PortalAppInterface');
    super([key], ['PortalAppInterface'], async ([portal], key) => {
      await new WaitForRelaysConnectedTask().run();
      return await portal.fetchProfile(key);
    });
    this.expiry = new Date(Date.now() + 1000 * 60 * 60 * 24);
  }
}
Task.register(FetchServiceNameTask);

class RequireAuthUserApprovalTask extends Task<[AuthChallengeEvent], [PromptUserProvider], AuthResponseStatus | null> {
  constructor(event: AuthChallengeEvent) {
    super([event], ['PromptUserProvider'], async ([promptUserProvider], event) => {
      console.log('[RequireAuthUserApprovalTask] Requesting user approval for:', {
        id: event.eventId,
        type: 'login',
      });
      console.log('[RequireAuthUserApprovalTask] SetPendingRequestsProvider available:', !!promptUserProvider);
      return new Promise<AuthResponseStatus | null>(resolve => {
        // in the PromptUserProvider the promise will be immediatly resolved as null when the app is offline
        // hence a notification should be shown instead of a pending request and the flow should stop
        const newPendingRequest: PendingRequest = {
          id: event.eventId,
          metadata: event,
          timestamp: new Date(),
          type: 'login',
          result: resolve,
        };

        const newNotification = {
          title: 'Authentication Request',
          body: `Authentication request requires approval`,
          data: {
            type: 'authentication_request',
            requestId: event.eventId,
          }
        }

        console.log('[RequireAuthUserApprovalTask] Calling addPendingRequest for:', newPendingRequest.id);
        promptUserProvider.promptUser({
          pendingRequest: newPendingRequest, notification: newNotification
        });
        console.log('[RequireAuthUserApprovalTask] addPendingRequest called, waiting for user approval');
      });
    });
  }
}
Task.register(RequireAuthUserApprovalTask);

class SendAuthChallengeResponseTask extends Task<[AuthChallengeEvent, AuthResponseStatus], [PortalAppInterface], void> {
  constructor(event: AuthChallengeEvent, response: AuthResponseStatus) {
    super([event, response], ['PortalAppInterface'], async ([portalApp], event, response) => {
      await new WaitForRelaysConnectedTask().run();
      return await portalApp.replyAuthChallenge(event, response);
    });
  }
}
Task.register(SendAuthChallengeResponseTask);