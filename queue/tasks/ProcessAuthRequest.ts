import { PendingRequest } from "@/utils/types";
import { Task } from "../WorkQueue";
import { AuthChallengeEvent, AuthResponseStatus, PortalApp, PortalAppInterface, Profile } from "portal-app-lib";
import { getServiceNameFromProfile } from "@/utils/nostrHelper";
import { PromptUserProvider } from "../providers/PromptUser";
import { SaveActivityTask } from "./SaveActivity";
import { RelayStatusesProvider } from "../providers/RelayStatus";

export class ProcessAuthRequestTask extends Task<[AuthChallengeEvent], [], void> {
  constructor(event: AuthChallengeEvent) {
    super([], event)
    this.expiry = new Date(Number(event.expiresAt * 1000n));
  }

  async taskLogic(_: [], event: AuthChallengeEvent): Promise<void> {
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
  }
}
Task.register(ProcessAuthRequestTask);

class FetchServiceNameTask extends Task<[string], { PortalApp: PortalApp, RelayStatusesProvider: RelayStatusesProvider }, Profile | undefined> {
  constructor(key: string) {
    super(['PortalApp', 'RelayStatusesProvider'], key);
  }

  async taskLogic({ PortalApp, RelayStatusesProvider }: { PortalApp: PortalApp, RelayStatusesProvider: RelayStatusesProvider }, key: string): Promise<Profile | undefined> {
    this.expiry = new Date(Date.now() + 1000 * 60 * 60 * 24);

    await RelayStatusesProvider.waitForRelaysConnected();
    return await PortalApp.fetchProfile(key);
  }
}
Task.register(FetchServiceNameTask);

class RequireAuthUserApprovalTask extends Task<[AuthChallengeEvent], { PromptUserProvider: PromptUserProvider }, AuthResponseStatus | null> {
  constructor(event: AuthChallengeEvent) {
    super(['PromptUserProvider'], event)
  }

  async taskLogic({ PromptUserProvider }: { PromptUserProvider: PromptUserProvider; }, event: AuthChallengeEvent): Promise<AuthResponseStatus | null> {
    console.log('[RequireAuthUserApprovalTask] Requesting user approval for:', {
      id: event.eventId,
      type: 'login',
    });
    console.log('[RequireAuthUserApprovalTask] SetPendingRequestsProvider available:', !!PromptUserProvider);
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
      PromptUserProvider.promptUser({
        pendingRequest: newPendingRequest, notification: newNotification
      });
      console.log('[RequireAuthUserApprovalTask] addPendingRequest called, waiting for user approval');
    });
  }
}
Task.register(RequireAuthUserApprovalTask);

class SendAuthChallengeResponseTask extends Task<[AuthChallengeEvent, AuthResponseStatus], { PortalApp: PortalApp, RelayStatusesProvider: RelayStatusesProvider }, void> {
  constructor(event: AuthChallengeEvent, response: AuthResponseStatus) {
    super(['PortalApp', 'RelayStatusesProvider'], event, response)
  }
  async taskLogic({ PortalApp, RelayStatusesProvider }: { PortalApp: PortalApp; RelayStatusesProvider: RelayStatusesProvider; }, event: AuthChallengeEvent, response: AuthResponseStatus): Promise<void> {
    await RelayStatusesProvider.waitForRelaysConnected();
    return await PortalApp.replyAuthChallenge(event, response);
  }
}
Task.register(SendAuthChallengeResponseTask);