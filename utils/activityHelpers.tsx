import React from 'react';
import { CheckCircle, Clock, XCircle, AlertCircle, Info } from 'lucide-react-native';
import { ActivityType } from '@/utils';

export type ActivityStatus = 'success' | 'failed' | 'pending' | 'received';

export const getActivityStatus = (detail: string, type?: string): ActivityStatus => {
  const lowerDetail = detail.toLowerCase();

  // For ticket activities, determine status based on type
  if (type === 'ticket_received') {
    return 'received'; // Neutral status for received tickets
  } else if (type === 'ticket_approved') {
    return 'success'; // Approved tickets are success
  } else if (type === 'ticket_denied') {
    return 'failed'; // Denied tickets are failed
  } else if (type === 'ticket') {
    return 'pending'; // Legacy ticket type (if any) are pending
  }

  if (lowerDetail.includes('approved') || lowerDetail.includes('success')) {
    return 'success';
  } else if (
    lowerDetail.includes('failed') ||
    lowerDetail.includes('denied') ||
    lowerDetail.includes('error') ||
    lowerDetail.includes('rejected')
  ) {
    return 'failed';
  } else {
    return 'pending';
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
  size: number = 16
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
  detail: string
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

export const formatSatsToUSD = (sats: number, conversionRate: number = 0.0004): string => {
  return `≈ $${(sats * conversionRate).toFixed(2)} USD`;
};
