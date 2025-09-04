import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { formatDayAndDate } from '@/utils';
import { FontAwesome6 } from '@expo/vector-icons';
import { useActivities } from '@/context/ActivitiesContext';
import { parseCalendar } from 'portal-app-lib';

import { DatabaseService, fromUnixSeconds, type SubscriptionWithDates } from '@/services/database';
import { useThemeColor } from '@/hooks/useThemeColor';
import { PortalAppManager } from '@/services/PortalAppManager';
import { CircleX, Hourglass } from 'lucide-react-native';
import { useDatabase } from '@/context/DatabaseContextProvider';

// Mock payment history for a subscription
interface PaymentHistory {
  id: string;
  amount: number;
  currency: string;
  status: 'completed' | 'pending' | 'failed';
  date: number;
}

export default function SubscriptionDetailScreen() {
  const { id } = useLocalSearchParams();
  const { subscriptions, refreshData } = useActivities();
  const [subscription, setSubscription] = useState<SubscriptionWithDates | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistory[]>([]);
  const [loading, setLoading] = useState(true);

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonDangerColor = useThemeColor({}, 'buttonDanger');
  const buttonDangerTextColor = useThemeColor({}, 'buttonDangerText');
  const statusConnectedColor = useThemeColor({}, 'statusConnected');
  const statusWarningColor = useThemeColor({}, 'statusWarning');
  const statusErrorColor = useThemeColor({}, 'statusError');
  const orangeColor = Colors.orange;

  const { executeOperation } = useDatabase();

  useEffect(() => {
    const refreshData = async () => {
      setLoading(true);

      const foundSubscription = subscriptions.find(sub => sub.id === id);

      if (foundSubscription) {
        setSubscription(foundSubscription);

        try {
          const payments = await executeOperation(
            db => db.getSubscriptionPayments(id as string),
            []
          );
          setPaymentHistory(
            payments.map(payment => ({
              id: payment.id,
              amount: payment.amount ?? 0,
              currency: payment.currency ?? 'sats',
              status: 'completed',
              date: payment.date.getTime(),
            }))
          );
        } catch (error) {
          console.error('Error fetching subscription payments:', error);
        }
      }

      setLoading(false);
    };

    refreshData();
  }, [id, subscriptions, executeOperation]); // Simplified dependencies

  const handleBackPress = () => {
    router.back();
  };

  const handleStopSubscription = () => {
    if (!subscription) return;

    Alert.alert(
      'Cancel Subscription',
      `Are you sure you want to cancel your subscription to ${subscription.service_name}?`,
      [
        {
          text: 'No',
          style: 'cancel',
        },
        {
          text: 'Yes, Cancel',
          onPress: async () => {
            try {
              await executeOperation(
                db => db.updateSubscriptionStatus(subscription.id, 'cancelled'),
                null
              );
              refreshData();
              PortalAppManager.tryGetInstance().closeRecurringPayment(
                subscription.service_key,
                subscription.id
              );
            } catch (error) {
              console.error(error);
            }
            // In a real app, this would call an API to cancel the subscription
            Alert.alert(
              'Subscription Cancelled',
              'Your subscription has been cancelled successfully.'
            );
            router.back();
          },
          style: 'destructive',
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return statusConnectedColor;
      case 'pending':
        return statusWarningColor;
      case 'failed':
        return statusErrorColor;
      default:
        return secondaryTextColor;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
        <ThemedView style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={primaryTextColor} />
        </ThemedView>
      </SafeAreaView>
    );
  }

  if (!subscription) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
        <ThemedView style={styles.container}>
          <View style={styles.header}>
            <FontAwesome6
              name="arrow-left"
              size={24}
              color={primaryTextColor}
              onPress={handleBackPress}
              style={styles.backButton}
            />
            <ThemedText type="title" style={[styles.title, { color: primaryTextColor }]}>
              Subscription Not Found
            </ThemedText>
          </View>
          <ThemedText style={[styles.noDataText, { color: secondaryTextColor }]}>
            The subscription you're looking for doesn't exist.
          </ThemedText>
        </ThemedView>
      </SafeAreaView>
    );
  }

  const parsedCalendar = parseCalendar(subscription.recurrence_calendar);
  const nextPayment =
    subscription.recurrence_first_payment_due > new Date() || !subscription.last_payment_date
      ? subscription.recurrence_first_payment_due
      : fromUnixSeconds(
          parsedCalendar.nextOccurrence(
            BigInt((subscription.last_payment_date?.getTime() ?? 0) / 1000)
          ) ?? 0
        );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <FontAwesome6
            name="arrow-left"
            size={24}
            color={primaryTextColor}
            onPress={handleBackPress}
            style={styles.backButton}
          />
          <ThemedText type="title" style={[styles.title, { color: primaryTextColor }]}>
            Subscription Details
          </ThemedText>
        </View>

        <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          <View style={[styles.card, { backgroundColor: cardBackgroundColor }]}>
            <View style={styles.serviceHeader}>
              <ThemedText type="subtitle" style={[styles.serviceName, { color: primaryTextColor }]}>
                {subscription.service_name}
              </ThemedText>
              <ThemedText style={[styles.amount, { color: primaryTextColor }]}>
                {subscription.amount} {subscription.currency}
              </ThemedText>
            </View>

            <View style={styles.recurrencyBadge}>
              <ThemedText
                style={[styles.recurrency, { color: secondaryTextColor }]}
                type="defaultSemiBold"
              >
                {parsedCalendar.toHumanReadable(false)}
              </ThemedText>
            </View>

            <View style={styles.detailsContainer}>
              <ThemedText style={[styles.detail, { color: secondaryTextColor }]}>
                First payment:{' '}
                {formatDayAndDate(new Date(subscription.recurrence_first_payment_due))}
              </ThemedText>
              {subscription.status === 'active' && (
                <ThemedText style={[styles.detail, { color: secondaryTextColor }]}>
                  Next payment: {formatDayAndDate(nextPayment)}
                </ThemedText>
              )}
              {subscription.status === 'cancelled' && (
                <ThemedText style={[styles.detailOrange, { color: orangeColor }]}>
                  <View style={[styles.iconContainer]}>
                    <CircleX size={20} color={orangeColor} />
                  </View>
                  Subscription cancelled
                </ThemedText>
              )}
              {subscription.status === 'expired' && (
                <ThemedText style={[styles.detail, { color: orangeColor }]}>
                  <View style={[styles.iconContainer]}>
                    <Hourglass size={20} color={orangeColor} />
                  </View>
                  Subscription expired
                </ThemedText>
              )}
              {subscription.recurrence_max_payments && (
                <ThemedText style={[styles.detail, { color: secondaryTextColor }]}>
                  {subscription.recurrence_max_payments - paymentHistory.length} payments left
                </ThemedText>
              )}
              {subscription.recurrence_until && (
                <ThemedText style={[styles.detail, { color: secondaryTextColor }]}>
                  Until: {formatDayAndDate(new Date(subscription.recurrence_until ?? 0))}
                </ThemedText>
              )}
            </View>
          </View>

          {subscription.status != 'cancelled' && (
            <TouchableOpacity
              style={[styles.stopButton, { backgroundColor: buttonDangerColor }]}
              onPress={handleStopSubscription}
              activeOpacity={0.7}
            >
              <View style={styles.stopButtonContent}>
                <FontAwesome6
                  name="stop-circle"
                  size={18}
                  color={buttonDangerTextColor}
                  style={styles.stopIcon}
                />
                <ThemedText style={[styles.stopButtonText, { color: buttonDangerTextColor }]}>
                  Stop Subscription
                </ThemedText>
              </View>
            </TouchableOpacity>
          )}

          <View style={styles.paymentHistoryContainer}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: primaryTextColor }]}>
              Payment History
            </ThemedText>

            {paymentHistory.length > 0 ? (
              paymentHistory.map(payment => (
                <View
                  key={payment.id}
                  style={[styles.paymentItem, { backgroundColor: cardBackgroundColor }]}
                >
                  <View style={styles.paymentInfo}>
                    <ThemedText style={[styles.paymentDate, { color: primaryTextColor }]}>
                      {formatDayAndDate(new Date(payment.date))}
                    </ThemedText>
                    <ThemedText
                      style={[styles.paymentStatus, { color: getStatusColor(payment.status) }]}
                    >
                      {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.paymentAmount, { color: primaryTextColor }]}>
                    {payment.amount} {payment.currency}
                  </ThemedText>
                </View>
              ))
            ) : (
              <ThemedText style={[styles.noDataText, { color: secondaryTextColor }]}>
                No payment history available
              </ThemedText>
            )}
          </View>
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    // backgroundColor handled by theme
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    // backgroundColor handled by theme
  },
  container: {
    flex: 1,
    // backgroundColor handled by theme
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    // color handled by theme
  },
  scrollContainer: {
    flex: 1,
  },
  card: {
    // backgroundColor handled by theme
    borderRadius: 20,
    padding: 20,
    marginTop: 16,
    marginBottom: 24,
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  serviceName: {
    fontSize: 20,
    // color handled by theme
  },
  amount: {
    fontSize: 20,
    fontWeight: '300',
    // color handled by theme
  },
  recurrencyBadge: {
    marginBottom: 16,
  },
  recurrency: {
    marginVertical: 8,
    // color handled by theme
  },
  detailsContainer: {
    marginTop: 8,
  },
  detail: {
    marginVertical: 4,
    // color handled by theme
  },
  detailOrange: {
    marginVertical: 4,
    fontWeight: 'bold',
    // color handled by theme
  },
  paymentHistoryContainer: {
    marginBottom: 32,
  },
  sectionTitle: {
    marginBottom: 16,
    // color handled by theme
  },
  paymentItem: {
    // backgroundColor handled by theme
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  paymentInfo: {
    flex: 1,
  },
  paymentDate: {
    fontSize: 16,
    fontWeight: '500',
    // color handled by theme
    marginBottom: 4,
  },
  paymentStatus: {
    fontSize: 14,
    fontWeight: '600',
    // color handled by theme
  },
  paymentAmount: {
    fontSize: 16,
    fontWeight: '500',
    // color handled by theme
  },
  noDataText: {
    textAlign: 'center',
    marginTop: 24,
    // color handled by theme
  },
  stopButton: {
    // backgroundColor handled by theme
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  stopButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopIcon: {
    marginRight: 8,
  },
  stopButtonText: {
    fontSize: 16,
    fontWeight: '600',
    // color handled by theme
  },
  iconContainer: {
    width: 30,
  },
});
