import { PendingRequest } from "@/utils/types";
import { NotificationContentInput, NotificationRequestInput } from "expo-notifications";

type UserPromptData = {
  notification: NotificationContentInput,
  pendingRequest: PendingRequest,
}

export interface PromptUserProvider {
  promptUser(promptData: UserPromptData): void;
}

export class PromptUserWithPendingCard implements PromptUserProvider {
  constructor(private readonly cb: (update: (prev: { [key: string]: PendingRequest }) => { [key: string]: PendingRequest }) => void) { }

  promptUser(promptData: UserPromptData): void {
    const request = promptData.pendingRequest;

    console.log('[SetPendingRequestsForeground] addPendingRequest called for:', {
      id: request.id,
      type: request.type,
    });
    this.cb(prev => {
      if (prev[request.id]) {
        console.log('[SetPendingRequestsForeground] Request already exists, skipping:', request.id);
        return prev;
      }
      console.log('[SetPendingRequestsForeground] Adding new request to state:', request.id);
      const newState = { ...prev, [request.id]: request };
      console.log('[SetPendingRequestsForeground] New state has', Object.keys(newState).length, 'requests');
      return newState;
    });
  }
}

export class PromptUserWithNotification implements PromptUserProvider {
  constructor(private readonly sendNotification: (nci: NotificationContentInput) => void) { }

  promptUser(promptData: UserPromptData): void {
    const notificationData = promptData.notification;

    this.sendNotification(notificationData)

    // return null in the promise so that the flow stops
    promptData.pendingRequest.result(null);
  }
}
