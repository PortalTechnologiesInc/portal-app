import type { NotificationContentInput } from 'expo-notifications';

export class NotificationProvider {
  constructor(private readonly cb: (nci: NotificationContentInput) => void) {}

  sendNotification(nci: NotificationContentInput): void {
    this.cb(nci);
  }
}
