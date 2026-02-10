import { router } from 'expo-router';
import { parseCalendar } from 'portal-app-lib';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useActivities } from '@/context/ActivitiesContext';
import { useCurrency } from '@/context/CurrencyContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { CurrencyConversionService } from '@/services/CurrencyConversionService';
import { fromUnixSeconds } from '@/services/DatabaseService';
import { formatActivityAmount, normalizeCurrencyForComparison } from '@/utils/currency';
import type { Frequency, UpcomingPayment } from '@/utils/types';
import { ThemedText } from './ThemedText';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const FREQUENCIES: Frequency[] = [
  'Every minute',
  'Every hour',
  'Daily',
  'Weekly',
  'Monthly',
  'Yearly',
];

function isFrequency(str: string): str is Frequency {
  return (FREQUENCIES as string[]).includes(str);
}

/** Count how many payments occur in a window of windowMs starting from the next payment. */
function countPaymentsInWeek(frequency: Frequency, windowMs: number): number {
  const MINUTE_MS = 60 * 1000;
  const HOUR_MS = 60 * MINUTE_MS;
  const DAY_MS = 24 * HOUR_MS;
  const WEEK_MS = 7 * DAY_MS;

  switch (frequency) {
    case 'Every minute':
      return Math.floor(windowMs / MINUTE_MS);
    case 'Every hour':
      return Math.floor(windowMs / HOUR_MS);
    case 'Daily':
      return Math.floor(windowMs / DAY_MS);
    case 'Weekly':
      return Math.floor(windowMs / WEEK_MS);
    case 'Monthly':
    case 'Yearly':
      return Math.min(1, Math.floor(windowMs / WEEK_MS));
    default:
      return 1;
  }
}

export const UpcomingPaymentsList: React.FC = () => {
  const [upcomingPayments, setUpcomingPayments] = useState<UpcomingPayment[]>([]);
  const [summaryTotal, setSummaryTotal] = useState<number | null>(null);

  const { activeSubscriptions } = useActivities();
  const { preferredCurrency } = useCurrency();

  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');

  const handleSeeAll = useCallback(() => {
    router.push('/(tabs)/Subscriptions');
  }, []);

  useEffect(() => {
    setUpcomingPayments(
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

          const frequencyStr = parsedCalendar.toHumanReadable(false);
          const frequency: Frequency = isFrequency(frequencyStr) ? frequencyStr : 'Weekly';
          const paymentCountInWeek = countPaymentsInWeek(frequency, ONE_WEEK_MS);

          return {
            id: sub.id,
            serviceName: sub.service_name,
            dueDate: nextPayment,
            amount: sub.amount,
            currency: sub.currency,
            convertedAmount: sub.converted_amount,
            convertedCurrency: sub.converted_currency,
            paymentCountInWeek,
          };
        })
        .filter(sub => sub.dueDate < new Date(Date.now() + ONE_WEEK_MS))
    );
  }, [activeSubscriptions]);

  useEffect(() => {
    let cancelled = false;
    const preferred = preferredCurrency;

    if (upcomingPayments.length === 0) {
      setSummaryTotal(null);
      return;
    }

    (async () => {
      try {
        let total = 0;
        const preferredNorm = normalizeCurrencyForComparison(preferred) ?? preferred;

        for (const p of upcomingPayments) {
          const convertedNorm = normalizeCurrencyForComparison(p.convertedCurrency);
          const useConverted =
            p.convertedAmount != null &&
            Number.isFinite(p.convertedAmount) &&
            convertedNorm === preferredNorm;

          const amountInPreferred = useConverted
            ? p.convertedAmount!
            : await CurrencyConversionService.convertAmount(p.amount, p.currency, preferred);

          if (!cancelled) total += amountInPreferred * p.paymentCountInWeek;
        }
        if (!cancelled) setSummaryTotal(total);
      } catch {
        if (!cancelled) setSummaryTotal(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [upcomingPayments, preferredCurrency]);

  return (
    <TouchableOpacity style={styles.container} onPress={handleSeeAll} activeOpacity={0.7}>
      <View style={styles.header}>
        <ThemedText type="title" style={[styles.title, { color: primaryTextColor }]}>
          Upcoming Payments
        </ThemedText>
        <ThemedText style={[styles.seeAll, { color: secondaryTextColor }]}>See all &gt;</ThemedText>
      </View>

      {upcomingPayments.length === 0 ? (
        <View style={[styles.emptyContainer, { backgroundColor: cardBackgroundColor }]}>
          <ThemedText style={[styles.emptyText, { color: secondaryTextColor }]}>
            No upcoming payments
          </ThemedText>
        </View>
      ) : summaryTotal !== null ? (
        <View style={[styles.summaryContainer, { backgroundColor: cardBackgroundColor }]}>
          <View style={styles.activityInfo}>
            <ThemedText type="subtitle" style={{ color: primaryTextColor }}>
              You're expected to pay:
            </ThemedText>
          </View>
          <View style={styles.activityDetails}>
            <ThemedText style={[styles.amount, { color: primaryTextColor }]}>
              {formatActivityAmount(summaryTotal, preferredCurrency)}
            </ThemedText>
            <ThemedText style={[styles.timeAgo, { color: secondaryTextColor }]}>
              in the next week
            </ThemedText>
          </View>
        </View>
      ) : null}
    </TouchableOpacity>
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
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  emptyContainer: {
    borderRadius: 20,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 72,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  summaryContainer: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 14,
    minHeight: 72,
    alignItems: 'center',
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
