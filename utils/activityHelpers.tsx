import { AlertCircle, CheckCircle, Clock, Info, XCircle } from 'lucide-react-native';
import type React from 'react';
import type { ActivityWithDates } from '@/services/DatabaseService';
import { ActivityType } from '@/utils/common';

export type ActivityStatus = 'success' | 'failed' | 'pending' | 'received';

export const getActivityStatus = (activity: ActivityWithDates): ActivityStatus => {
  // Map database status to ActivityStatus
  switch (activity.status) {
    case 'positive':
      return 'success';
    case 'negative':
      return 'failed';
    case 'pending':
      return 'pending';
    default:
      // For ticket activities, determine status based on type
      if (activity.type === 'ticket_received') {
        return 'received'; // Neutral status for received tickets
      } else if (activity.type === 'ticket_approved') {
        return 'success'; // Approved tickets are success
      } else if (activity.type === 'ticket_denied') {
        return 'failed'; // Denied tickets are failed
      } else if (activity.type === 'ticket') {
        return 'pending'; // Legacy ticket type (if any) are pending
      }
      return 'pending'; // Default for neutral status
  }
};

export const getStatusColor = (
  status: ActivityStatus,
  colors: {
    statusConnected: string;
    statusWarning: string;
    statusError: string;
    textSecondary: string;
  }
): string => {
  switch (status) {
    case 'success':
      return colors.statusConnected;
    case 'pending':
      return colors.statusWarning;
    case 'failed':
      return colors.statusError;
    case 'received':
      return colors.textSecondary; // Neutral color for received
    default:
      return colors.textSecondary;
  }
};

export const getStatusIcon = (
  status: ActivityStatus,
  colors: {
    statusConnected: string;
    statusWarning: string;
    statusError: string;
    textSecondary: string;
  },
  size = 16
): React.ReactElement => {
  switch (status) {
    case 'success':
      return <CheckCircle size={size} color={colors.statusConnected} />;
    case 'pending':
      return <Clock size={size} color={colors.statusWarning} />;
    case 'failed':
      return <XCircle size={size} color={colors.statusError} />;
    case 'received':
      return <Info size={size} color={colors.textSecondary} />;
    default:
      return <AlertCircle size={size} color={colors.textSecondary} />;
  }
};

export const getStatusText = (status: ActivityStatus): string => {
  switch (status) {
    case 'success':
      return 'Completed';
    case 'pending':
      return 'Pending';
    case 'failed':
      return 'Failed';
    case 'received':
      return 'Received';
    default:
      return 'Unknown';
  }
};

export const getActivityTypeText = (type: string): string => {
  switch (type) {
    case ActivityType.Auth:
      return 'Login Request';
    case ActivityType.Pay:
      return 'Payment';
    case 'ticket':
    case 'ticket_approved':
    case 'ticket_denied':
    case 'ticket_received':
      return 'Ticket';
    default:
      return 'Activity';
  }
};

export const getActivityDescription = (
  type: string,
  status: ActivityStatus,
  detail: string,
  amount?: number | null
): string => {
  if (type === ActivityType.Auth) {
    switch (status) {
      case 'success':
        return 'You successfully authenticated with this service';
      case 'failed':
        if (detail.toLowerCase().includes('denied')) {
          return 'You denied the authentication request';
        }
        return 'Authentication was denied or failed';
      case 'pending':
        return 'Authentication is being processed';
      default:
        return 'Authentication request';
    }
  } else if (
    type === 'ticket' ||
    type === 'ticket_approved' ||
    type === 'ticket_denied' ||
    type === 'ticket_received'
  ) {
    if (amount && amount > 1) {
      switch (status) {
        case 'success':
          return 'Tickets were successfully processed';
        case 'failed':
          return 'Tickets processing failed';
        case 'pending':
          return 'Tickets are being processed';
        case 'received':
          return 'Tickets were received and stored';
        default:
          return 'Tickets activity';
      }
    }
    switch (status) {
      case 'success':
        return 'Ticket was successfully processed';
      case 'failed':
        return 'Ticket processing failed';
      case 'pending':
        return 'Ticket is being processed';
      case 'received':
        return 'Ticket was received and stored';
      default:
        return 'Ticket activity';
    }
  } else {
    switch (status) {
      case 'success':
        return 'Payment was successfully processed';
      case 'failed':
        if (detail.toLowerCase().includes('insufficient')) {
          return 'Payment failed due to insufficient funds';
        }
        return 'Payment was declined or failed';
      case 'pending':
        return 'Payment is being processed';
      default:
        return 'Payment activity';
    }
  }
};

export const formatSatsToUSD = (sats: number, conversionRate = 0.0004): string => {
  return `≈ $${(sats * conversionRate).toFixed(2)} USD`;
};
