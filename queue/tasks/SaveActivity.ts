import { ActivityWithDates, DatabaseService } from "@/services/DatabaseService";
import { Task } from "../WorkQueue";
import { globalEvents } from "@/utils/common";

export type SaveActivityArgs = Omit<ActivityWithDates, 'id' | 'created_at'>;
export class SaveActivityTask extends Task<[SaveActivityArgs], [DatabaseService], string> {
  constructor(private readonly activity: SaveActivityArgs) {
    super([activity], ['DatabaseService'], async ([db], activity) => {
      const activityId = await db.addActivity(activity);
      globalEvents.emit('activityAdded', { activityId });
      return activityId;
    });
  }
}
Task.register(SaveActivityTask);