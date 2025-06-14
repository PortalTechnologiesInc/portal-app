import type {
  AuthChallengeEvent,
  PaymentResponseContent,
  RecurringPaymentRequest,
  RecurringPaymentResponseContent,
  SinglePaymentRequest,
  AuthResponseStatus,
} from 'portal-app-lib';

export type PendingRequestType = 'login' | 'payment' | 'certificate' | 'identity' | 'subscription';

export interface PendingRequest {
  id: string;
  metadata: AuthChallengeEvent | RecurringPaymentRequest | SinglePaymentRequest;
  type: PendingRequestType;
  timestamp: Date;
  result: (
    value: AuthResponseStatus | PaymentResponseContent | RecurringPaymentResponseContent
  ) => void;
}
