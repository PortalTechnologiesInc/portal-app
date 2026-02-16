import { type CashuDirectContentWithKey, parseCashuToken, type TokenInfo } from 'portal-app-lib';
import type NostrStoreService from '@/services/NostrStoreService';
import { globalEvents } from '@/utils/common';
import { showToast } from '@/utils/Toast';
import type { DatabaseService } from '../../services/DatabaseService';
import type { CashuWalletMethodsProvider } from '../providers/CashuWallets';
import { Task } from '../WorkQueue';
import { SaveActivityTask } from './SaveActivity';

export class HandleCashuDirectContentTask extends Task<
  [CashuDirectContentWithKey],
  ['NostrStoreService', 'CashuWalletMethodsProvider'],
  void
> {
  constructor(private readonly event: CashuDirectContentWithKey) {
    super(['NostrStoreService', 'CashuWalletMethodsProvider'], event);
  }

  async taskLogic(
    {
      NostrStoreService,
      CashuWalletMethodsProvider,
    }: {
      NostrStoreService: NostrStoreService;
      CashuWalletMethodsProvider: CashuWalletMethodsProvider;
    },
    event: CashuDirectContentWithKey
  ): Promise<void> {
    try {
      // Auto-process the Cashu token (receiving tokens)
      const token = event.inner.token;

      const tokenInfo = await new ParseCashuTokenTask(token).run();
      const isProcessed = await new MarkCashuTokenAsProcessedTask(token).run();
      if (isProcessed === true) {
        return;
      }

      const wallet = await CashuWalletMethodsProvider.addWallet(
        tokenInfo.mintUrl,
        tokenInfo.unit.toLowerCase()
      );
      await wallet.receiveToken(token);

      let mintsList = await NostrStoreService.readMints();
      // Convert to Set to prevent duplicates, then back to array
      const mintsSet = new Set([tokenInfo.mintUrl, ...mintsList]);
      mintsList = Array.from(mintsSet);

      NostrStoreService.storeMints(mintsList);
      console.log('Cashu token processed successfully');

      // Emit event to notify that wallet balances have changed
      globalEvents.emit('walletBalancesChanged', {
        mintUrl: tokenInfo.mintUrl,
        unit: tokenInfo.unit.toLowerCase(),
      });
      console.log('walletBalancesChanged event emitted');

      // Record activity for token receipt
      try {
        // For Cashu direct, use mint URL as service identifier
        const serviceKey = tokenInfo.mintUrl;
        const unitInfo = await wallet.getUnitInfo();
        const ticketTitle = unitInfo?.title || wallet.unit();

        const activity = {
          type: 'ticket_received' as const,
          service_key: serviceKey,
          service_name: ticketTitle, // Always use ticket title
          detail: ticketTitle, // Always use ticket title
          date: new Date(),
          amount: Number(tokenInfo.amount),
          currency: null,
          request_id: `cashu-direct-${Date.now()}`,
          subscription_id: null,
          status: 'neutral' as const,
          converted_amount: null,
          converted_currency: null,
        };

        const activityId = await new SaveActivityTask(activity).run();

        if (activityId) {
          // Emit event for UI updates
          globalEvents.emit('activityAdded', activity);
          // Provide lightweight user feedback
          const amountStr = tokenInfo.amount ? ` x${Number(tokenInfo.amount)}` : '';
          showToast(`Ticket received: ${ticketTitle}${amountStr}`, 'success');
        } else {
          console.warn('Failed to record Cashu token activity due to database issues');
        }
      } catch (activityError) {
        console.error('Error recording Cashu direct activity:', activityError);
      }
    } catch (error: any) {
      console.error('Error processing Cashu token:', error.inner);
    }

    return;
  }
}
Task.register(HandleCashuDirectContentTask);

export class MarkCashuTokenAsProcessedTask extends Task<[string], ['DatabaseService'], boolean> {
  constructor(private readonly token: string) {
    super(['DatabaseService'], token);
  }

  async taskLogic(
    { DatabaseService }: { DatabaseService: DatabaseService },
    token: string
  ): Promise<boolean> {
    const tokenInfo = await new ParseCashuTokenTask(token).run();
    return DatabaseService.markCashuTokenAsProcessed(
      token,
      tokenInfo.mintUrl,
      tokenInfo.unit,
      Number(tokenInfo.amount)
    );
  }
}
Task.register(MarkCashuTokenAsProcessedTask);

export class ParseCashuTokenTask extends Task<[string], [], TokenInfo> {
  constructor(private readonly token: string) {
    super([], token);
  }

  taskLogic(_: {}, token: string): Promise<TokenInfo> {
    return parseCashuToken(token);
  }
}
Task.register(ParseCashuTokenTask);
