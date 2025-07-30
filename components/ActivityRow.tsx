import type React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Key, BanknoteIcon, Ticket } from 'lucide-react-native';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { Colors } from '@/constants/Colors';
import { formatRelativeTime, ActivityType } from '@/utils';
import type { ActivityWithDates } from '@/services/database';
import { router } from 'expo-router';
import { useThemeColor } from '@/hooks/useThemeColor';
import { getActivityStatus, getStatusColor } from '@/utils/activityHelpers';

interface ActivityRowProps {
  activity: ActivityWithDates;
}

export const ActivityRow: React.FC<ActivityRowProps> = ({ activity }) => {
  const handlePress = () => {
    router.push(`/activity/${activity.id}`);
  };

  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const iconBackgroundColor = useThemeColor({}, 'surfaceSecondary');
  const iconColor = useThemeColor({}, 'icon');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');

  const statusConnectedColor = useThemeColor({}, 'statusConnected');
  const statusWarningColor = useThemeColor({}, 'statusWarning');
  const statusErrorColor = useThemeColor({}, 'statusError');
  const borderPrimaryColor = useThemeColor({}, 'borderPrimary');

  const statusColors = {
    statusConnected: statusConnectedColor,
    statusWarning: statusWarningColor,
    statusError: statusErrorColor,
    textSecondary: borderPrimaryColor,
  };

  const activityStatus = getActivityStatus(activity);
  const statusColor = getStatusColor(activityStatus, statusColors);

  const getActivityIcon = () => {
    switch (activity.type) {
      case ActivityType.Auth:
        return <Key size={20} color={iconColor} />;
      case ActivityType.Pay:
        return <BanknoteIcon size={20} color={iconColor} />;
      case 'ticket':
      case 'ticket_approved':
      case 'ticket_denied':
      case 'ticket_received':
        return <Ticket size={20} color={iconColor} />;
      default:
        return <BanknoteIcon size={20} color={iconColor} />;
    }
  };

  const getActivityTypeText = () => {
    switch (activity.type) {
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

  // Format ticket title with quantity if amount > 1
  const formatTicketTitle = () => {
    if (
      activity.type === 'ticket' ||
      activity.type === 'ticket_approved' ||
      activity.type === 'ticket_denied' ||
      activity.type === 'ticket_received'
    ) {
      const amount = activity.amount;
      if (amount && amount > 1) {
        return `${activity.detail} x ${amount}`;
      }
    }
    return activity.detail;
  };

  return (
    <TouchableOpacity
      style={[
        styles.activityCard,
        { borderLeftWidth: 3, borderLeftColor: statusColor, backgroundColor: cardBackgroundColor },
      ]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: iconBackgroundColor }]}>
        {getActivityIcon()}
      </View>
      <View style={styles.activityInfo}>
        <ThemedText type="subtitle" style={{ color: primaryTextColor }}>
          {activity.type === 'ticket' ? activity.detail : activity.service_name}
        </ThemedText>
        <ThemedText style={[styles.typeText, { color: secondaryTextColor }]}>
          {getActivityTypeText()}
        </ThemedText>
      </View>
      <View style={styles.activityDetails}>
        {activity.type === ActivityType.Pay && activity.amount !== null && (
          <ThemedText style={[styles.amount, { color: primaryTextColor }]}>
            {activity.amount} sats
          </ThemedText>
        )}
        {(activity.type === 'ticket' ||
          activity.type === 'ticket_approved' ||
          activity.type === 'ticket_denied' ||
          activity.type === 'ticket_received') &&
          activity.amount !== null &&
          activity.amount > 1 && (
            <ThemedText style={[styles.amount, { color: primaryTextColor }]}>
              x {activity.amount}
            </ThemedText>
          )}
        <ThemedText style={[styles.timeAgo, { color: secondaryTextColor }]}>
          {formatRelativeTime(activity.date)}
        </ThemedText>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  activityCard: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 14,
    marginBottom: 10,
    minHeight: 72,
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    alignSelf: 'center',
  },
  activityInfo: {
    flex: 1,
    justifyContent: 'center',
  },

  activityDetails: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 80,
  },
  typeText: {
    fontSize: 12,
    marginTop: 4,
  },
  amount: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  timeAgo: {
    fontSize: 12,
    marginTop: 4,
  },
});
