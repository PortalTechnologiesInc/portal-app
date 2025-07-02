import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from './ThemedText';
import type { UpcomingPayment } from '@/models/UpcomingPayment';
import { formatRelativeTime } from '@/utils';
import { useActivities } from '@/context/ActivitiesContext';
import { parseCalendar } from 'portal-app-lib';
import { fromUnixSeconds } from '@/services/database';
import { BanknoteIcon } from 'lucide-react-native';
import { useThemeColor } from '@/hooks/useThemeColor';

export const UpcomingPaymentsList: React.FC = () => {
  // Initialize with empty array - will be populated with real data later
  const [upcomingPayments, SetUpcomingPayments] = useState<UpcomingPayment[]>([]);

  const { activeSubscriptions } = useActivities();

  // Theme colors
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const iconBackgroundColor = useThemeColor({}, 'surfaceSecondary');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const iconColor = useThemeColor({}, 'icon');

  const handleSeeAll = useCallback(() => {
    // Will be implemented when we have a dedicated page
    // Currently just an alert or placeholder
    router.push('/(tabs)/Subscriptions');
  }, []);

  useEffect(() => {
    SetUpcomingPayments(
      activeSubscriptions
        .map(sub => {
          const parsedCalendar = parseCalendar(sub.recurrence_calendar);
          const nextPayment =
            sub.recurrence_first_payment_due > new Date() || !sub.last_payment_date
              ? sub.recurrence_first_payment_due
              : fromUnixSeconds(
                  parsedCalendar.nextOccurrence(
                    BigInt((sub.last_payment_date?.getTime() ?? 0) / 1000)
                  ) ?? 0
                );

          return {
            id: sub.id,
            serviceName: sub.service_name,
            dueDate: nextPayment,
            amount: sub.amount,
            currency: sub.currency,
          };
        })
        .filter(sub => {
          return sub.dueDate < new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        })
    );
  }, [activeSubscriptions]);

  const renderPaymentItem = useCallback(
    ({ item }: { item: UpcomingPayment }) => (
      <TouchableOpacity
        style={[styles.paymentCard, { backgroundColor: cardBackgroundColor }]}
        activeOpacity={0.7}
        onPress={() => router.push(`/subscription/${item.id}`)}
      >
        <View style={[styles.iconContainer, { backgroundColor: iconBackgroundColor }]}>
          <BanknoteIcon size={20} color={iconColor} />
        </View>
        <View style={styles.paymentInfo}>
          <ThemedText type="subtitle" style={{ color: primaryTextColor }}>
            {item.serviceName}
          </ThemedText>
          <ThemedText style={[styles.typeText, { color: secondaryTextColor }]}>
            Upcoming payment
          </ThemedText>
        </View>
        <View style={styles.paymentDetails}>
          <ThemedText style={[styles.amount, { color: primaryTextColor }]}>
            {item.amount} {item.currency}
          </ThemedText>
          <ThemedText style={[styles.dueDate, { color: secondaryTextColor }]}>
            {formatRelativeTime(item.dueDate)}
          </ThemedText>
        </View>
      </TouchableOpacity>
    ),
    [cardBackgroundColor, iconBackgroundColor, primaryTextColor, secondaryTextColor, iconColor]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title" style={[styles.title, { color: primaryTextColor }]}>
          Upcoming Payments
        </ThemedText>
        <TouchableOpacity onPress={handleSeeAll}>
          <ThemedText style={[styles.seeAll, { color: secondaryTextColor }]}>
            See all &gt;
          </ThemedText>
        </TouchableOpacity>
      </View>

      {upcomingPayments.length === 0 ? (
        <View style={[styles.emptyContainer, { backgroundColor: cardBackgroundColor }]}>
          <ThemedText style={[styles.emptyText, { color: secondaryTextColor }]}>
            No upcoming payments
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={upcomingPayments}
          keyExtractor={item => item.id}
          renderItem={renderPaymentItem}
          scrollEnabled={false}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  seeAll: {
    fontSize: 14,
  },
  paymentCard: {
    flexDirection: 'row',
    // backgroundColor handled by theme
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
    // backgroundColor handled by theme
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    alignSelf: 'center',
  },
  paymentInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  paymentDetails: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 80,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  amount: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  dueDate: {
    fontSize: 12,
  },
  typeText: {
    fontSize: 12,
    marginTop: 4,
  },
  emptyContainer: {
    // backgroundColor handled by theme
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
