import { BanknoteIcon, Key, Ticket } from 'lucide-react-native';
import type React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { CurrencyConversionService } from '@/services/CurrencyConversionService';
import {
  getActivityDescription,
  getStatusColor,
  getStatusIcon,
  getStatusText,
} from '@/utils/activityHelpers';
import { ActivityStatus, ActivityType } from '@/utils/common';
import { type Currency, formatActivityAmount, shouldShowConvertedAmount } from '@/utils/currency';

interface ActivityMainCardProps {
  serviceName: string;
  activityType: string;
  activityStatus: ActivityStatus;
  detail: string;
  amount?: number | null;
  currency?: string | null;
  converted_amount?: number | null;
  converted_currency?: string | null;
}

export const ActivityMainCard: React.FC<ActivityMainCardProps> = ({
  serviceName,
  activityType,
  activityStatus,
  detail,
  amount,
  currency,
  converted_amount,
  converted_currency,
}) => {
  const surfaceSecondaryColor = useThemeColor({}, 'surfaceSecondary');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonSecondaryColor = useThemeColor({}, 'buttonSecondary');
  const statusConnectedColor = useThemeColor({}, 'statusConnected');
  const statusWarningColor = useThemeColor({}, 'statusWarning');
  const statusErrorColor = useThemeColor({}, 'statusError');

  const isAuth = activityType === ActivityType.Auth;
  const isPayment = activityType === ActivityType.Pay || activityType === ActivityType.Receive;
  const isTicket =
    activityType === ActivityType.Ticket ||
    activityType === ActivityType.TicketApproved ||
    activityType === ActivityType.TicketDenied ||
    activityType === ActivityType.TicketReceived;

  const statusColors = {
    statusConnected: statusConnectedColor,
    statusWarning: statusWarningColor,
    statusError: statusErrorColor,
    textSecondary: secondaryTextColor,
  };

  const getIconBackgroundColor = () => {
    if (activityStatus === ActivityStatus.Negative) {
      return statusErrorColor;
    }
    if (activityStatus === ActivityStatus.Pending) {
      return statusWarningColor;
    }
    // Success or default case
    return isAuth ? statusConnectedColor : buttonSecondaryColor;
  };

  // Format ticket title with quantity if amount > 1
  const _formatTicketTitle = () => {
    if (isTicket && amount && amount > 1) {
      return `${detail} x ${amount}`;
    }
    return detail;
  };

  return (
    <View style={[styles.mainCard, { backgroundColor: surfaceSecondaryColor }]}>
      <View style={[styles.activityIconContainer, { backgroundColor: getIconBackgroundColor() }]}>
        {isAuth ? (
          <Key size={32} color={primaryTextColor} />
        ) : isTicket ? (
          <Ticket size={32} color={primaryTextColor} />
        ) : (
          <BanknoteIcon size={32} color={primaryTextColor} />
        )}
      </View>

      <ThemedText type="title" style={[styles.serviceName, { color: primaryTextColor }]}>
        {serviceName}
      </ThemedText>

      {isTicket && detail && (
        <ThemedText style={[styles.tokenName, { color: secondaryTextColor }]}>{detail}</ThemedText>
      )}

      <View style={[styles.statusContainer, { backgroundColor: surfaceSecondaryColor }]}>
        {getStatusIcon(activityStatus, statusColors)}
        <ThemedText
          style={[styles.statusText, { color: getStatusColor(activityStatus, statusColors) }]}
        >
          {getStatusText(activityStatus)}
        </ThemedText>
      </View>

      {isPayment && amount && (
        <View style={styles.amountContainer}>
          <ThemedText style={[styles.amount, { color: primaryTextColor }]}>
            {formatActivityAmount(amount, currency || null)}
          </ThemedText>
          {shouldShowConvertedAmount({
            amount: converted_amount,
            originalCurrency: currency || null,
            convertedCurrency: converted_currency || null,
          }) && (
            <ThemedText style={[styles.amountSubtext, { color: secondaryTextColor }]}>
              {CurrencyConversionService.formatConvertedAmountWithFallback(
                converted_amount,
                converted_currency as Currency
              )}
            </ThemedText>
          )}
        </View>
      )}

      <ThemedText style={[styles.description, { color: secondaryTextColor }]}>
        {getActivityDescription(activityType, activityStatus, detail, amount)}
      </ThemedText>
    </View>
  );
};

const styles = StyleSheet.create({
  mainCard: {
    borderRadius: 24,
    padding: 24,
    marginTop: 8,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  activityIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  serviceName: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
    marginBottom: 12,
  },
  tokenName: {
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
    width: '100%',
    marginBottom: 12,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 20,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  amountContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  amount: {
    fontSize: 32,
    fontWeight: '700',
    paddingVertical: 12,
  },
  amountSubtext: {
    fontSize: 16,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
});
