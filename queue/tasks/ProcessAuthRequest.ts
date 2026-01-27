import {
  type AuthChallengeEvent,
  type AuthResponseStatus,
  PortalApp,
  type PortalAppInterface,
  type Profile,
} from 'portal-app-lib';
import { getServiceNameFromProfile } from '@/utils/nostrHelper';
import type { PendingRequest } from '@/utils/types';
import type { PromptUserProvider } from '../providers/PromptUser';
import type { RelayStatusesProvider } from '../providers/RelayStatus';
import { Task } from '../WorkQueue';
import { SaveActivityTask } from './SaveActivity';

export class ProcessAuthRequestTask extends Task<[AuthChallengeEvent], [], void> {
  constructor(event: AuthChallengeEvent) {
    super([], event);
    this.expiry = new Date(Number(event.expiresAt * 1000n));
  }

  async taskLogic(_: {}, event: AuthChallengeEvent): Promise<void> {
    const authResponse = await new RequireAuthUserApprovalTask(event).run();
    console.log('[ProcessIncomingRequestTask] User approval result:', authResponse);

    if (!authResponse) {
      // if null the app is offline, so a notification has already been scheduled
      return;
    }

    await new SendAuthChallengeResponseTask(event, authResponse).run();

    const eventId = event.eventId;
    console.log('[ProcessIncomingRequestTask] Task started for request:', {
      id: eventId,
      type: 'login',
    });

    const serviceKey = event.serviceKey;
    console.log('[ProcessIncomingRequestTask] Fetching profile for serviceKey:', serviceKey);
    const name = await new FetchServiceProfileTask(serviceKey)
      .run()
      .then(profile => getServiceNameFromProfile(profile));
    console.log('[ProcessIncomingRequestTask] Calling RequireAuthUserApprovalTask');

    await new SaveActivityTask({
      type: 'auth',
      service_key: serviceKey,
      detail: 'User approved login',
      date: new Date(),
      service_name: name ?? 'Unknown Service',
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

export class FetchServiceProfileTask extends Task<
  [string],
  ['PortalAppInterface', 'RelayStatusesProvider'],
  Profile | undefined
> {
  constructor(key: string) {
    super(['PortalAppInterface', 'RelayStatusesProvider'], key);
    this.expiry = new Date(Date.now() + 1000 * 60 * 60 * 24);
  }

  async taskLogic(
    {
      PortalAppInterface,
      RelayStatusesProvider,
    }: { PortalAppInterface: PortalAppInterface; RelayStatusesProvider: RelayStatusesProvider },
    key: string
  ): Promise<Profile | undefined> {
    await RelayStatusesProvider.waitForRelaysConnected();
    return await PortalAppInterface.fetchProfile(key);
  }
}
Task.register(FetchServiceProfileTask);

class RequireAuthUserApprovalTask extends Task<
  [AuthChallengeEvent],
  ['PromptUserProvider'],
  AuthResponseStatus | null
> {
  constructor(event: AuthChallengeEvent) {
    super(['PromptUserProvider'], event);
  }

  async taskLogic(
    { PromptUserProvider }: { PromptUserProvider: PromptUserProvider },
    event: AuthChallengeEvent
  ): Promise<AuthResponseStatus | null> {
    console.log('[RequireAuthUserApprovalTask] Requesting user approval for:', {
      id: event.eventId,
      type: 'login',
    });
    console.log(
      '[RequireAuthUserApprovalTask] SetPendingRequestsProvider available:',
      !!PromptUserProvider
    );
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
Task.register(RequireAuthUserApprovalTask);

class SendAuthChallengeResponseTask extends Task<
  [AuthChallengeEvent, AuthResponseStatus],
  ['PortalAppInterface', 'RelayStatusesProvider'],
  void
> {
  constructor(event: AuthChallengeEvent, response: AuthResponseStatus) {
    super(['PortalAppInterface', 'RelayStatusesProvider'], event, response);
  }
  async taskLogic(
    {
      PortalAppInterface,
      RelayStatusesProvider,
    }: { PortalAppInterface: PortalAppInterface; RelayStatusesProvider: RelayStatusesProvider },
    event: AuthChallengeEvent,
    response: AuthResponseStatus
  ): Promise<void> {
    await RelayStatusesProvider.waitForRelaysConnected();
    return await PortalAppInterface.replyAuthChallenge(event, response);
  }
}
Task.register(SendAuthChallengeResponseTask);
