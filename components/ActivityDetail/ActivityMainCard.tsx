import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Key, BanknoteIcon } from 'lucide-react-native';
import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { ActivityType } from '@/utils';
import { getStatusIcon, getStatusColor, getStatusText, getActivityDescription, formatSatsToUSD, type ActivityStatus } from '@/utils/activityHelpers';

interface ActivityMainCardProps {
  serviceName: string;
  activityType: string;
  activityStatus: ActivityStatus;
  detail: string;
  amount?: number | null;
}

export const ActivityMainCard: React.FC<ActivityMainCardProps> = ({
  serviceName,
  activityType,
  activityStatus,
  detail,
  amount,
}) => {
  const surfaceSecondaryColor = useThemeColor({}, 'surfaceSecondary');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonSecondaryColor = useThemeColor({}, 'buttonSecondary');
  const statusConnectedColor = useThemeColor({}, 'statusConnected');
  const statusWarningColor = useThemeColor({}, 'statusWarning');
  const statusErrorColor = useThemeColor({}, 'statusError');

  const isAuth = activityType === ActivityType.Auth;
  const isPayment = activityType === ActivityType.Pay;

  const statusColors = {
    statusConnected: statusConnectedColor,
    statusWarning: statusWarningColor,
    statusError: statusErrorColor,
    textSecondary: secondaryTextColor,
  };

  const getIconBackgroundColor = () => {
    if (activityStatus === 'failed') {
      return statusErrorColor;
    }
    if (activityStatus === 'pending') {
      return statusWarningColor;
    }
    // Success or default case
    return isAuth ? statusConnectedColor : buttonSecondaryColor;
  };

  return (
    <View style={[styles.mainCard, { backgroundColor: surfaceSecondaryColor }]}>
      <View
        style={[
          styles.activityIconContainer,
          { backgroundColor: getIconBackgroundColor() },
        ]}
      >
        {isAuth ? (
          <Key size={32} color={primaryTextColor} />
        ) : (
          <BanknoteIcon size={32} color={primaryTextColor} />
        )}
      </View>

      <ThemedText type="title" style={[styles.serviceName, { color: primaryTextColor }]}>
        {serviceName}
      </ThemedText>

      <View style={[styles.statusContainer, { backgroundColor: surfaceSecondaryColor }]}>
        {getStatusIcon(activityStatus, statusColors)}
        <ThemedText style={[styles.statusText, { color: getStatusColor(activityStatus, statusColors) }]}>
          {getStatusText(activityStatus)}
        </ThemedText>
      </View>

      {isPayment && amount && (
        <View style={styles.amountContainer}>
          <ThemedText style={[styles.amount, { color: primaryTextColor }]}>
            {amount.toLocaleString()} sats
          </ThemedText>
          <ThemedText style={[styles.amountSubtext, { color: secondaryTextColor }]}>
            {formatSatsToUSD(amount)}
          </ThemedText>
        </View>
      )}

      <ThemedText style={[styles.description, { color: secondaryTextColor }]}>
        {getActivityDescription(activityType, activityStatus, detail)}
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
  },
  amountSubtext: {
    fontSize: 16,
    marginTop: 4,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
}); 