import type { ActivityWithDates, DatabaseService } from '@/services/DatabaseService';
import { globalEvents } from '@/utils/common';
import { Task, TransactionalTask } from '../WorkQueue';

export type SaveActivityArgs = Omit<ActivityWithDates, 'id' | 'created_at'>;
export class SaveActivityTask extends Task<[SaveActivityArgs], ['DatabaseService'], string> {
  constructor(activity: SaveActivityArgs) {
    super(['DatabaseService'], activity);
  }

  async taskLogic(
    { DatabaseService }: { DatabaseService: DatabaseService },
    activity: SaveActivityArgs
  ): Promise<string> {
    const activityId = await DatabaseService.addActivity(activity);
    globalEvents.emit('activityAdded', { activityId });
    return activityId;
  }
}
Task.register(SaveActivityTask);
