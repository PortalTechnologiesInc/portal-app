import { AuthChallengeEvent, PaymentRequestEvent, RecurringPaymentRequest } from "portal-app-lib";

export interface PendingRequest {
  id: string;
  type: AuthChallengeEvent | PaymentRequestEvent | RecurringPaymentRequest;
  status: 'pending' | 'approved' | 'denied';
  timestamp: string;
}