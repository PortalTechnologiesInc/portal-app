import type { Timestamp } from 'react-native-reanimated/lib/typescript/commonTypes';
import type { Currency } from '@/utils/currency';
import type { Frequency } from '@/utils/types';

export type { Frequency };

interface RecurringPaymentsRequestContent {
  amount: number;
  currency: Currency;
  recurrence: RecurrenceInfo;
  currentExchangeRate?: any;
  expiresAt: Timestamp;
  authToken?: string;
}
interface RecurrenceInfo {
  until?: Timestamp;
  calendar: Frequency;
  maxPayments?: number;
  firstPaymentDue: Timestamp;
}

export type Subscription = RecurringPaymentsRequestContent & {
  id: string;
  serviceName: string;
  servicePub: string;
};
