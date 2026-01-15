import { ActivityWithDates, DatabaseService } from "@/services/DatabaseService";
import { Task } from "../WorkQueue";
import { globalEvents } from "@/utils/common";

export type SaveActivityArgs = Omit<ActivityWithDates, 'id' | 'created_at'>;
export class SaveActivityTask extends Task<[SaveActivityArgs], { 'DatabaseService': DatabaseService }, string> {
  constructor(activity: SaveActivityArgs) {
    super(['DatabaseService'], activity);
  }

  async taskLogic({ DatabaseService }: { 'DatabaseService': DatabaseService }, activity: SaveActivityArgs): Promise<string> {
    const activityId = await DatabaseService.addActivity(activity);
    globalEvents.emit('activityAdded', { activityId });
    return activityId;
  }
}
Task.register(SaveActivityTask);