import { AlertCircle, CheckCircle, Clock, Info, XCircle } from 'lucide-react-native';
import type React from 'react';
import type { ActivityWithDates } from '@/services/DatabaseService';
import { ActivityStatus, ActivityType } from '@/utils/common';

export const getActivityStatus = (activity: ActivityWithDates): ActivityStatus => {
  // For ticket activities, determine status based on type
  if (activity.type === ActivityType.TicketReceived) {
    return ActivityStatus.Neutral; // Neutral status for received tickets
  } else if (activity.type === ActivityType.TicketApproved) {
    return ActivityStatus.Positive; // Approved tickets are success
  } else if (activity.type === ActivityType.TicketDenied) {
    return ActivityStatus.Negative; // Denied tickets are failed
  } else if (activity.type === ActivityType.Ticket) {
    return ActivityStatus.Pending; // Legacy ticket type (if any) are pending
  }
  return activity.status; // Default to normal status
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
    case ActivityStatus.Positive:
      return colors.statusConnected;
    case ActivityStatus.Pending:
      return colors.statusWarning;
    case ActivityStatus.Negative:
      return colors.statusError;
    case ActivityStatus.Neutral:
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
    case ActivityStatus.Positive:
      return <CheckCircle size={size} color={colors.statusConnected} />;
    case ActivityStatus.Pending:
      return <Clock size={size} color={colors.statusWarning} />;
    case ActivityStatus.Negative:
      return <XCircle size={size} color={colors.statusError} />;
    case ActivityStatus.Neutral:
      return <Info size={size} color={colors.textSecondary} />;
    default:
      return <AlertCircle size={size} color={colors.textSecondary} />;
  }
};

export const getStatusText = (status: ActivityStatus): string => {
  switch (status) {
    case ActivityStatus.Positive:
      return 'Completed';
    case ActivityStatus.Pending:
      return 'Pending';
    case ActivityStatus.Negative:
      return 'Failed';
    case ActivityStatus.Neutral:
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
      case ActivityStatus.Positive:
        return 'You successfully authenticated with this service';
      case ActivityStatus.Negative:
        if (detail.toLowerCase().includes('denied')) {
          return 'You denied the authentication request';
        }
        return 'Authentication was denied or failed';
      case ActivityStatus.Pending:
        return 'Authentication is being processed';
      default:
        return 'Authentication request';
    }
  } else if (
    type === ActivityType.Ticket ||
    type === ActivityType.TicketApproved ||
    type === ActivityType.TicketDenied ||
    type === ActivityType.TicketReceived
  ) {
    if (amount && amount > 1) {
      switch (status) {
        case ActivityStatus.Positive:
          return 'Tickets were successfully processed';
        case ActivityStatus.Negative:
          return 'Tickets processing failed';
        case ActivityStatus.Pending:
          return 'Tickets are being processed';
        case ActivityStatus.Neutral:
          return 'Tickets were received and stored';
        default:
          return 'Tickets activity';
      }
    }
    switch (status) {
      case ActivityStatus.Positive:
        return 'Ticket was successfully processed';
      case ActivityStatus.Negative:
        return 'Ticket processing failed';
      case ActivityStatus.Pending:
        return 'Ticket is being processed';
      case ActivityStatus.Neutral:
        return 'Ticket was received and stored';
      default:
        return 'Ticket activity';
    }
  } else if (type === ActivityType.Receive) {
    switch (status) {
      case ActivityStatus.Positive:
        return 'Payment was successfully received';
      case ActivityStatus.Negative:
        return 'Payment could not be received';
      case ActivityStatus.Pending:
        return 'Payment is being received';
      default:
        return 'Incoming payment';
    }
  } else {
    switch (status) {
      case ActivityStatus.Positive:
        return 'Payment was successfully processed';
      case ActivityStatus.Negative:
        if (detail.toLowerCase().includes('insufficient')) {
          return 'Payment failed due to insufficient funds';
        }
        return 'Payment was declined or failed';
      case ActivityStatus.Pending:
        return 'Payment is being processed';
      default:
        return 'Payment activity';
    }
  }
};

export const formatSatsToUSD = (sats: number, conversionRate = 0.0004): string => {
  return `≈ $${(sats * conversionRate).toFixed(2)} USD`;
};
