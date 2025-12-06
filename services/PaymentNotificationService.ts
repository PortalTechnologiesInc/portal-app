import type {
  SinglePaymentRequest,
  PortalAppInterface,
} from 'portal-app-lib';
import type { DatabaseService } from './DatabaseService';
import {
  AMOUNT_MISMATCH_REJECTION_REASON,
  sendPaymentAmountMismatchNotification,
} from './NotificationService';

export { AMOUNT_MISMATCH_REJECTION_REASON };

export async function sendPaymentAmountMismatchNotificationForForeground(
  request: SinglePaymentRequest,
  executeOperation: <T>(
    operation: (db: DatabaseService) => Promise<T>,
    fallback?: T
  ) => Promise<T>,
  app: PortalAppInterface
): Promise<void> {
  await sendPaymentAmountMismatchNotification(request, executeOperation, app);
}


