import {
  CashuRequestContentWithKey, CashuResponseStatus,
  type PortalAppInterface,
} from 'portal-app-lib';
import { Task } from "../WorkQueue";
import { CashuWalletMethodsProvider } from "../providers/CashuWallets";
import { PendingRequest } from "@/utils/types";
import { PromptUserProvider } from "../providers/PromptUser";
import type { RelayStatusesProvider } from '../providers/RelayStatus';

export class HandleCashuBurnRequestTask extends Task<
  [CashuRequestContentWithKey],
  ['NostrStoreService', 'CashuWalletMethodsProvider'],
  void
> {
  constructor(private readonly event: CashuRequestContentWithKey) {
    super(['NostrStoreService', 'CashuWalletMethodsProvider'], event);
  }

  async taskLogic(
    { CashuWalletMethodsProvider }: { CashuWalletMethodsProvider: CashuWalletMethodsProvider },
    event: CashuRequestContentWithKey
  ): Promise<void> {
    // Declare wallet in outer scope
    let wallet;
    // Check if we have the required unit before creating pending request
    try {
      const requiredMintUrl = event.inner.mintUrl;
      const requiredUnit = event.inner.unit.toLowerCase(); // Normalize unit name
      const requiredAmount = event.inner.amount;

      // Check if we have a wallet for this mint and unit
      wallet = await CashuWalletMethodsProvider.getWallet(requiredMintUrl, requiredUnit);

      // If wallet not found in ECashContext, try to create it
      if (!wallet) {
        try {
          wallet = await CashuWalletMethodsProvider.addWallet(requiredMintUrl, requiredUnit);
        } catch (error) {
          console.error(`Error creating wallet for ${requiredMintUrl}-${requiredUnit}:`, error);
        }
      }

      if (!wallet) {
        return await new SendCashuResponseStatusTask(
          event,
          new CashuResponseStatus.InsufficientFunds()
        ).run();
      }

      // Check if we have sufficient balance
      const balance = await wallet.getBalance();
      if (balance < requiredAmount) {
        return await new SendCashuResponseStatusTask(
          event,
          new CashuResponseStatus.InsufficientFunds()
        ).run();
      }
    } catch (error) {
      console.error('Error checking wallet availability:', error);
      return await new SendCashuResponseStatusTask(
        event,
        new CashuResponseStatus.InsufficientFunds()
      ).run();
    }

    // Get the ticket title for pending requests
    let ticketTitle = 'Unknown Ticket';
    if (wallet) {
      let unitInfo;
      try {
        unitInfo = wallet.getUnitInfo ? await wallet.getUnitInfo() : undefined;
      } catch {
        unitInfo = undefined;
      }
      ticketTitle = unitInfo?.title || wallet.unit();
    }

    const status = await new RequireTicketBurnUserApprovalTask(event).run();
    if (!status) {
      // if null the app is offline, so a notification might already been scheduled
      return;
    }
    return await new SendCashuResponseStatusTask(
      event,
      status,
    ).run();
  }
}
Task.register(HandleCashuBurnRequestTask)

class RequireTicketBurnUserApprovalTask extends Task<
  [CashuRequestContentWithKey],
  ['PromptUserProvider'],
  CashuResponseStatus | null
> {
  constructor(
    private readonly request: CashuRequestContentWithKey,
  ) {
    super(['PromptUserProvider'], request);
  }

  async taskLogic(
    { PromptUserProvider }: { PromptUserProvider: PromptUserProvider },
    event: CashuRequestContentWithKey,
  ): Promise<CashuResponseStatus | null> {
    console.log('[RequireTicketBurnUserApprovalTask] Requesting user approval for:', {
      id: event.inner.requestId,
      type: 'ticket',
    });
    console.log(
      '[RequireTicketBurnUserApprovalTask] PromptUserProvider available:',
      !!PromptUserProvider
    );
    return new Promise<CashuResponseStatus | null>(resolve => {
      // in the PromptUserProvider the promise will be immediatly resolved as null when the app is offline
      // hence a notification should be shown instead of a pending request and the flow should stop
      const newPendingRequest: PendingRequest = {
        id: event.inner.requestId,
        metadata: event,
        timestamp: new Date(),
        type: 'ticket',
        result: resolve,
        ticketTitle: 'Ticket',
      };

      console.log(
        '[RequireTicketBurnUserApprovalTask] Calling addPendingRequest for:',
        newPendingRequest.id
      );
      PromptUserProvider.promptUser({
        pendingRequest: newPendingRequest,
        notification: {}, // no notification for tickets
      });
      console.log(
        '[RequireTicketBurnUserApprovalTask] addPendingRequest called, waiting for user approval'
      );
    });
  }
}
Task.register(RequireTicketBurnUserApprovalTask);

class SendCashuResponseStatusTask extends Task<
  [CashuRequestContentWithKey, CashuResponseStatus],
  ['PortalAppInterface', 'RelayStatusesProvider'],
  void
> {
  constructor(
    private readonly event: CashuRequestContentWithKey,
    private readonly status: CashuResponseStatus,
  ) {
    super(['PortalAppInterface', 'RelayStatusesProvider'], event, status);
  }

  async taskLogic(
    {
      PortalAppInterface,
      RelayStatusesProvider,
    }: { PortalAppInterface: PortalAppInterface; RelayStatusesProvider: RelayStatusesProvider },
    event: CashuRequestContentWithKey,
    status: CashuResponseStatus,
  ): Promise<void> {
    await RelayStatusesProvider.waitForRelaysConnected();
    return await PortalAppInterface.replyCashuRequest(event, status);
  }
}
Task.register(SendCashuResponseStatusTask);
