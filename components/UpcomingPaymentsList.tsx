import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from './ThemedText';
import type { UpcomingPayment } from '@/utils/types';
import { useActivities } from '@/context/ActivitiesContext';
import { parseCalendar } from 'portal-app-lib';
import { fromUnixSeconds } from '@/services/database';
import { BanknoteIcon } from 'lucide-react-native';
import { useThemeColor } from '@/hooks/useThemeColor';

export const UpcomingPaymentsList: React.FC = () => {
  // Initialize with empty array - will be populated with real data later
  const [upcomingPayments, SetUpcomingPayments] = useState<UpcomingPayment[]>([]);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<string>('USD');

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
    const payments = activeSubscriptions
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
      });

    SetUpcomingPayments(payments);
    
    // Calculate total amount and set currency
    if (payments.length > 0) {
      const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
      setTotalAmount(total);
      // Use the first payment's currency as the display currency
      setCurrency(payments[0].currency);
    } else {
      setTotalAmount(0);
      setCurrency('USD');
    }
  }, [activeSubscriptions]);

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

      <TouchableOpacity
        style={[styles.summaryCard, { backgroundColor: cardBackgroundColor }]}
        activeOpacity={0.7}
        onPress={() => router.push('/(tabs)/Subscriptions')}
      >
        <View style={[styles.iconContainer, { backgroundColor: iconBackgroundColor }]}>
          <BanknoteIcon size={24} color={iconColor} />
        </View>
        <View style={styles.summaryInfo}>
          <ThemedText type="subtitle" style={{ color: primaryTextColor }}>
            {totalAmount > 0 ? `$${totalAmount.toFixed(2)} expected in the next two weeks` : 'No upcoming payments'}
          </ThemedText>
          <ThemedText style={[styles.summarySubtext, { color: secondaryTextColor }]}>
            {upcomingPayments.length > 0 
              ? `${upcomingPayments.length} payment${upcomingPayments.length === 1 ? '' : 's'} due`
              : 'All caught up on payments'
            }
          </ThemedText>
        </View>
      </TouchableOpacity>
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
  summaryCard: {
    flexDirection: 'row',
    // backgroundColor handled by theme
    borderRadius: 20,
    padding: 16,
    minHeight: 80,
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    // backgroundColor handled by theme
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    alignSelf: 'center',
  },
  summaryInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  summarySubtext: {
    fontSize: 14,
    marginTop: 4,
  },
});
