import { ActivityWithDates, DatabaseService } from "@/services/DatabaseService";
import { Task } from "../WorkQueue";
import { GlobalEventsEmitterProvider } from "../providers/GlobalEventsEmitter";

export type SaveActivityArgs = Omit<ActivityWithDates, 'id' | 'created_at'>;
export class SaveActivityTask extends Task<[SaveActivityArgs], [GlobalEventsEmitterProvider, DatabaseService], string> {
  constructor(private readonly activity: SaveActivityArgs) {
    super([activity], ['GlobalEventsEmitterProvider', 'DatabaseService'], async ([geep, db], activity) => {
      const activityId = await db.addActivity(activity);
      geep.emit('activityAdded', { activityId });
      return activityId;
    });
  }
}
Task.register(SaveActivityTask);