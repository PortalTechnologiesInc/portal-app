import type { CloseRecurringPaymentResponse } from 'portal-app-lib';
import type { DatabaseService } from '@/services/DatabaseService';
import { globalEvents } from '@/utils/common';
import { Task } from '../WorkQueue';

export class HandleCancelSubscriptionResponseTask extends Task<
  [CloseRecurringPaymentResponse],
  ['DatabaseService'],
  void
> {
  constructor(private readonly response: CloseRecurringPaymentResponse) {
    super(['DatabaseService'], response);
  }

  async taskLogic(
    { DatabaseService }: { DatabaseService: DatabaseService },
    response: CloseRecurringPaymentResponse
  ): Promise<void> {
    try {
      await DatabaseService.updateSubscriptionStatus(response.content.subscriptionId, 'cancelled');
      globalEvents.emit('subscriptionStatusChanged', {
        subscriptionId: response.content.subscriptionId,
        status: 'cancelled',
      });
    } catch (error) {
      console.error(error);
    }
  }
}
Task.register(HandleCancelSubscriptionResponseTask);
