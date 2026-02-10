import type { ActivityWithDates, DatabaseService } from '@/services/DatabaseService';
import { Task } from '../WorkQueue';

export class GetActivityFromInvoiceTask extends Task<[string], ['DatabaseService'], ActivityWithDates | null> {
  constructor(invoice: string) {
    super(['DatabaseService'], invoice);
  }

  async taskLogic(
    { DatabaseService }: { DatabaseService: DatabaseService },
    invoice: string
  ): Promise<ActivityWithDates | null> {
    const activity = await DatabaseService.getActivityFromInvoice(invoice);
    return activity;
  }
}
Task.register(GetActivityFromInvoiceTask);
