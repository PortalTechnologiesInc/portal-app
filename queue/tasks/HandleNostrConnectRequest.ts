import {
  keyToHex,
  type NostrConnectEvent,
  NostrConnectMethod,
  type NostrConnectRequest,
  NostrConnectResponseStatus,
  type PortalAppInterface,
} from 'portal-app-lib';
import type { PendingRequest } from '@/models/PendingRequest';
import type { AllowedBunkerClientWithDates, DatabaseService } from '@/services/DatabaseService';
import { getMethodString } from '@/utils/nip46';
import type { PromptUserProvider } from '../providers/PromptUser';
import type { RelayStatusesProvider } from '../providers/RelayStatus';
import { Task, TransactionalTask } from '../WorkQueue';
import { SaveActivityTask } from './SaveActivity';

export class HandleNostrConnectRequestTask extends Task<[NostrConnectEvent, string], [], void> {
  constructor(
    private readonly event: NostrConnectEvent,
    private readonly signerPubkey: string
  ) {
    super([], event, signerPubkey);
  }

  declineRequest(event: NostrConnectEvent, reason: string): Promise<void> {
    return new SendNostrConnectResponseTask(
      event,
      new NostrConnectResponseStatus.Declined({
        reason: reason,
      })
    ).run();
  }

  async taskLogic(_: {}, event: NostrConnectEvent, signerPubkey: string): Promise<void> {
    const message = event.message.inner[0];
    if ('method' in message === false) {
      // if the message in the nostr connect event contains a response we just ignore it
      // the app doesn't send requests that expect responses.
      return;
    }
    message as NostrConnectRequest;

    if (message.method === NostrConnectMethod.Connect) {
      const eventSignerPubkey = message.params.at(0);
      const secret = message.params.at(1);

      if (!eventSignerPubkey) {
        await this.declineRequest(event, 'No params');
        return;
      }

      if (eventSignerPubkey !== signerPubkey) {
        await this.declineRequest(
          event,
          'Connect request contains a pubkey different from this signer'
        );
        return;
      }

      if (!secret) {
        await this.declineRequest(event, 'Secret param is undefined');
        return;
      }

      const isSecretValid = await new UseBunkerSecretTransactionalTask(secret).run();
      if (!isSecretValid) {
        console.log('[HandleNostrConnectRequestTask] Connect request has invalid secret');
        await this.declineRequest(event, 'Secret param is invalid');
        return;
      }

      console.warn('[HandleNostrConnectRequestTask] Connect request requires user approval');
      const responseStatus = await new RequireNostrConnectUserApprovalTask(
        event,
        'Authentication Request',
        'Authentication request requires approval'
      ).run();

      console.log('[HandleNostrConnectRequestTask] User approval result:', responseStatus);
      if (responseStatus) {
        return await new SendNostrConnectResponseTask(event, responseStatus).run();
      }

      return;
    }

    try {
      const nostrClient = await new GetBunkerClientTask(event.nostrClientPubkey).run();
      // check that the key is abilitated and not revoked
      if (!nostrClient || nostrClient.revoked) {
        this.declineRequest(event, 'Nostr client is not whitelisted or is revoked.');
        return;
      }

      // check that the method has a granted permission
      const permissions = nostrClient.granted_permissions
        .split(',')
        .map(p => p.trim())
        .filter(Boolean);

      // getting method specific permissions with paramethers
      const methodString = getMethodString(message.method);
      const eventSpecificPermissions = permissions.filter(p => p.startsWith(methodString));

      // rejecting if there's none
      if (eventSpecificPermissions.length === 0) {
        this.declineRequest(event, `'${methodString}' permission not granted`);
        return;
      }

      // given that this method has a permission granted continue with specific logic for sign_event
      // sign_event is special because we also need to check that we can sign that specific event kind
      if (message.method === NostrConnectMethod.SignEvent) {
        // Check if permission is exactly "sign_event" (allows all kinds) or has specific kinds like "sign_event:1"
        const isUnrestricted =
          eventSpecificPermissions.length === 1 && eventSpecificPermissions[0] === methodString;
        if (!isUnrestricted) {
          // grabbing the event to sign and checking if exists
          const serializedEventToSign = message.params.at(0);

          if (!serializedEventToSign) {
            this.declineRequest(event, 'No event to sign in the parameters.');
            return;
          }

          // getting the kind and checking if is allowed
          const eventToSignObj = JSON.parse(serializedEventToSign);
          const eventToSignKind = eventToSignObj.kind;
          if (!eventToSignKind) {
            this.declineRequest(
              event,
              'No event to sign in the parameters. Event to sign has no kind'
            );
            return;
          }

          // Extract specific allowed kinds from permissions like "sign_event:1", "sign_event:2"
          const allowedKinds = eventSpecificPermissions.map(p => p.replace('sign_event:', ''));

          const eventToSignKindStr = String(eventToSignKind);
          if (!allowedKinds.includes(eventToSignKindStr)) {
            this.declineRequest(
              event,
              `Event kind ${eventToSignKind} is not permitted. Allowed kinds: ${allowedKinds.join(', ')}`
            );
            return;
          }
        }
      }

      new SaveActivityAndUpdateClientLastSeenTransactionalTask(
        event.nostrClientPubkey,
        methodString,
        nostrClient.client_name ?? 'Nostr client',
        message.id
      ).run();

      return new SendNostrConnectResponseTask(
        event,
        new NostrConnectResponseStatus.Approved()
      ).run();
    } catch (_e) {
      this.declineRequest(event, 'Error while checking client permissions');
      return;
    }
  }
}
Task.register(HandleNostrConnectRequestTask);

class RequireNostrConnectUserApprovalTask extends Task<
  [NostrConnectEvent, string, string],
  ['PromptUserProvider'],
  NostrConnectResponseStatus | null
> {
  constructor(
    private readonly event: NostrConnectEvent,
    private readonly title: string,
    private readonly body: string
  ) {
    super(['PromptUserProvider'], event, title, body);
  }

  async taskLogic(
    { PromptUserProvider }: { PromptUserProvider: PromptUserProvider },
    event: NostrConnectEvent,
    title: string,
    body: string
  ): Promise<NostrConnectResponseStatus | null> {
    console.log('[RequireNostrConnectUserApprovalTask] Requesting user approval for:', {
      id: event,
      type: 'nostrConnect',
    });
    console.log(
      '[RequireNostrConnectUserApprovalTask] SetPendingRequestsProvider available:',
      !!PromptUserProvider
    );
    return new Promise<NostrConnectResponseStatus | null>(resolve => {
      const id = event.message.inner[0].id;
      // in the PromptUserProvider the promise will be immediatly resolved as null when the app is offline
      // hence a notification should be shown instead of a pending request and the flow should stop
      const newPendingRequest: PendingRequest = {
        id: id,
        metadata: event,
        timestamp: new Date(),
        type: 'nostrConnect',
        result: resolve,
      };

      const newNotification = {
        title: title,
        body: body,
        data: {
          type: 'authentication_request',
          requestId: id,
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
Task.register(RequireNostrConnectUserApprovalTask);

class SendNostrConnectResponseTask extends Task<
  [NostrConnectEvent, NostrConnectResponseStatus],
  ['PortalAppInterface', 'RelayStatusesProvider'],
  void
> {
  constructor(
    private readonly event: NostrConnectEvent,
    private readonly response: NostrConnectResponseStatus
  ) {
    super(['PortalAppInterface', 'RelayStatusesProvider'], event, response);
  }

  async taskLogic(
    {
      PortalAppInterface,
      RelayStatusesProvider,
    }: { PortalAppInterface: PortalAppInterface; RelayStatusesProvider: RelayStatusesProvider },
    event: NostrConnectEvent,
    response: NostrConnectResponseStatus
  ): Promise<void> {
    await RelayStatusesProvider.waitForRelaysConnected();
    return await PortalAppInterface.replyNip46Request(event, response);
  }
}
Task.register(SendNostrConnectResponseTask);

// returns true if the secret was valid and marked as used, false otherwise
class UseBunkerSecretTransactionalTask extends TransactionalTask<
  [string],
  ['DatabaseService'],
  boolean
> {
  constructor(private readonly secret: string) {
    console.log('[UseSecretTask] starting task');
    super(['DatabaseService'], secret);
    this.expiry = new Date(Date.now());
  }

  async taskLogic(
    { DatabaseService }: { DatabaseService: DatabaseService },
    secret: string
  ): Promise<boolean> {
    const secretRecord = await DatabaseService.getBunkerSecretOrNull(secret);
    const isSecretValid: boolean = !(secretRecord?.used ?? true);

    if (isSecretValid) {
      await DatabaseService.markBunkerSecretAsUsed(secret);
    }

    return isSecretValid;
  }
}
Task.register(UseBunkerSecretTransactionalTask);

class GetBunkerClientTask extends TransactionalTask<
  [string],
  ['DatabaseService'],
  AllowedBunkerClientWithDates | null
> {
  constructor(private readonly npub: string) {
    console.log('[GetBunkerClientTask] starting task');
    super(['DatabaseService'], npub);
    this.expiry = new Date(Date.now());
  }

  async taskLogic(
    { DatabaseService }: { DatabaseService: DatabaseService },
    npub: string
  ): Promise<AllowedBunkerClientWithDates | null> {
    const hexPubkey = keyToHex(npub);
    const client = await DatabaseService.getBunkerClientOrNull(hexPubkey);
    return client;
  }
}
Task.register(GetBunkerClientTask);

class SaveActivityAndUpdateClientLastSeenTransactionalTask extends TransactionalTask<
  [string, string, string, string],
  ['DatabaseService'],
  void
> {
  constructor(
    private readonly clientNpub: string,
    private readonly methodString: string,
    private readonly clientName: string,
    private readonly requestId: string
  ) {
    console.log('[SaveActivityAndUpdateClientLastSeenTransactionalTask] starting task');
    super(['DatabaseService'], clientNpub, methodString, clientName, requestId);
  }

  async taskLogic(
    { DatabaseService }: { DatabaseService: DatabaseService },

    clientNpub: string,
    methodString: string,
    clientName: string,
    requestId: string
  ): Promise<void> {
    const hexPubkey = keyToHex(clientNpub);
    await DatabaseService.updateBunkerClientLastSeen(hexPubkey);
    await new SaveActivityTask({
      type: 'auth',
      service_key: clientNpub,
      detail: `Approved nostr activity for: ${methodString}`,
      date: new Date(),
      service_name: clientName,
      amount: null,
      currency: null,
      converted_amount: null,
      converted_currency: null,
      request_id: requestId,
      subscription_id: null,
      status: 'positive',
    });
  }
}
Task.register(SaveActivityAndUpdateClientLastSeenTransactionalTask);
