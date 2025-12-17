import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import {
  AlertCircle,
  BanknoteIcon,
  Calendar,
  Coins,
  DollarSign,
  Hash,
  Info,
  Link,
  Server,
  Shield,
  Ticket,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityDetailRow } from '@/components/ActivityDetail/ActivityDetailRow';
import { ActivityHeader } from '@/components/ActivityDetail/ActivityHeader';
import { ActivityMainCard } from '@/components/ActivityDetail/ActivityMainCard';
import {
  convertPaymentStatusToSteps,
  PaymentStatusProgress,
  type PaymentStep,
} from '@/components/ActivityDetail/PaymentStatusProgress';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useActivities } from '@/context/ActivitiesContext';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { CurrencyConversionService } from '@/services/CurrencyConversionService';
import type { ActivityWithDates } from '@/services/DatabaseService';
import { getActivityStatus } from '@/utils/activityHelpers';
import { ActivityType, formatDayAndDate } from '@/utils/common';
import {
  type Currency,
  formatActivityAmount,
  shouldShowConvertedAmount as shouldShowConvertedAmountUtil,
} from '@/utils/currency';

// Helper functions to generate activity description text
function getRequestDescriptionText(
  isAuth: boolean,
  isTicket: boolean,
  serviceName: string,
  detail: string | null
): string {
  if (isAuth) {
    return `This was a login request to authenticate your identity with ${serviceName}.`;
  }
  if (isTicket) {
    const detailText = detail ? ` for ${detail}` : '';
    return `This was a ticket request${detailText} from ${serviceName}.`;
  }
  return `This was a payment request from ${serviceName}.`;
}

function getSuccessStatusText(isAuth: boolean, isTicket: boolean, activityType: string): string {
  if (isAuth) {
    return ' You successfully granted access.';
  }
  if (isTicket) {
    switch (activityType) {
      case 'ticket_received':
        return ' You successfully received the ticket.';
      case 'ticket_approved':
        return ' You successfully approved and sent the ticket.';
      default:
        return ' The ticket was processed successfully.';
    }
  }
  return ' The payment was processed successfully.';
}

function getFailedStatusText(
  isAuth: boolean,
  isTicket: boolean,
  detail: string,
  isDenied: boolean
): string {
  if (isDenied) {
    if (isAuth) {
      return ' You denied this authentication request.';
    }
    if (isTicket) {
      return ' You denied this ticket request.';
    }
    return ' You denied this payment request.';
  }
  // Not denied, but failed
  if (isAuth) {
    return ' The authentication was not completed.';
  }
  if (isTicket) {
    return ' The ticket request could not be completed.';
  }
  return ' The payment could not be completed.';
}

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams();
  const [activity, setActivity] = useState<ActivityWithDates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentSteps, setPaymentSteps] = useState<PaymentStep[]>([]);
  const { executeOperation } = useDatabaseContext();
  const { activities } = useActivities();

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const surfaceSecondaryColor = useThemeColor({}, 'surfaceSecondary');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonSecondaryColor = useThemeColor({}, 'buttonSecondary');
  const buttonSecondaryTextColor = useThemeColor({}, 'buttonSecondaryText');
  const statusErrorColor = useThemeColor({}, 'statusError');

  const shouldShowConvertedAmount = (a: ActivityWithDates) =>
    shouldShowConvertedAmountUtil({
      amount: a.converted_amount,
      originalCurrency: a.currency,
      convertedCurrency: a.converted_currency,
    });

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        setLoading(true);

        const activityData = await executeOperation(db => db.getActivity(id as string), null);

        if (activityData) {
          setActivity(activityData);

          // If this is a payment activity, fetch payment status entries
          if (
            activityData.type === ActivityType.Pay ||
            (activityData.type === ActivityType.Receive && activityData.invoice)
          ) {
            try {
              const paymentStatusEntries = await executeOperation(
                db => db.getPaymentStatusEntries(activityData.invoice!),
                []
              );
              console.log('paymentStatusEntries', paymentStatusEntries);
              const steps = convertPaymentStatusToSteps(paymentStatusEntries);
              setPaymentSteps(steps);
            } catch (err) {
              console.error('Error fetching payment status entries:', err);
              setPaymentSteps([]);
            }
          }
        } else {
          setError('Activity not found');
        }
      } catch (err) {
        console.error('Error fetching activity:', err);
        setError('Failed to load activity');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchActivity();
    }
  }, [id, executeOperation, activities]);

  const handleBackPress = () => {
    router.back();
  };

  const handleCopyId = () => {
    Clipboard.setStringAsync(id as string);
  };

  const handleCopyServiceKey = () => {
    if (!activity) return;

    Clipboard.setStringAsync(activity.service_key as string);
  };

  const handleCopyRequestId = () => {
    if (!activity) return;

    Clipboard.setStringAsync(activity.request_id as string);
  };

  const handleRetryPayment = () => {
    const newAttemptId = `attempt-${Date.now()}`;
    setPaymentSteps(prevSteps => [
      ...prevSteps,
      {
        id: newAttemptId,
        status: 'pending',
        title: 'Retrying...',
        subtitle: 'Attempting payment again',
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
        <ThemedView style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={primaryTextColor} />
          <ThemedText style={[styles.loadingText, { color: secondaryTextColor }]}>
            Loading activity...
          </ThemedText>
        </ThemedView>
      </SafeAreaView>
    );
  }

  if (error || !activity) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
        <ThemedView style={styles.errorContainer}>
          <AlertCircle size={48} color={statusErrorColor} />
          <ThemedText style={[styles.errorText, { color: statusErrorColor }]}>
            {error || 'Activity not found'}
          </ThemedText>
          <TouchableOpacity
            onPress={handleBackPress}
            style={[styles.backToListButton, { backgroundColor: buttonSecondaryColor }]}
          >
            <ThemedText style={[styles.backToListButtonText, { color: buttonSecondaryTextColor }]}>
              Go Back
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </SafeAreaView>
    );
  }

  const activityStatus = getActivityStatus(activity);
  const isPayment = activity.type === ActivityType.Pay || activity.type === ActivityType.Receive;
  const isAuth = activity.type === ActivityType.Auth;
  const isTicket =
    activity.type === ActivityType.Ticket ||
    activity.type === 'ticket_approved' ||
    activity.type === 'ticket_denied' ||
    activity.type === 'ticket_received';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <ThemedView style={styles.container}>
        <ActivityHeader isAuth={isAuth} isTicket={isTicket} onBackPress={handleBackPress} />

        <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          <ActivityMainCard
            serviceName={activity.service_name}
            activityType={activity.type}
            activityStatus={activityStatus}
            detail={activity.detail}
            amount={activity.amount}
            currency={activity.currency}
            converted_amount={activity.converted_amount}
            converted_currency={activity.converted_currency}
          />

          {/* Payment Status Progress - Only for payment activities */}
          {isPayment && paymentSteps.length > 0 && (
            <View style={styles.sectionContainer}>
              <ThemedText
                type="subtitle"
                style={[styles.sectionTitle, { color: primaryTextColor }]}
              >
                Payment Status
              </ThemedText>
              <View style={[styles.statusCard, { backgroundColor: surfaceSecondaryColor }]}>
                <PaymentStatusProgress steps={paymentSteps} onRetry={handleRetryPayment} />
              </View>
            </View>
          )}

          {/* Details Section */}
          <View style={styles.sectionContainer}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: primaryTextColor }]}>
              {isAuth
                ? 'Authentication Details'
                : isTicket
                  ? 'Ticket Details'
                  : 'Transaction Details'}
            </ThemedText>

            <View style={[styles.detailCard, { backgroundColor: surfaceSecondaryColor }]}>
              <ActivityDetailRow
                icon={<Calendar size={18} color={secondaryTextColor} />}
                label="Date & Time"
                value={formatDayAndDate(activity.date)}
              />

              <ActivityDetailRow
                icon={<Hash size={18} color={secondaryTextColor} />}
                label="Activity ID"
                value={activity.id}
                copyable
                onCopy={handleCopyId}
              />

              {!isTicket && (
                <ActivityDetailRow
                  icon={<Server size={18} color={secondaryTextColor} />}
                  label="Service Key"
                  value={activity.service_key}
                  copyable
                  onCopy={handleCopyServiceKey}
                />
              )}

              {isPayment && (
                <>
                  <ActivityDetailRow
                    icon={<DollarSign size={16} color={secondaryTextColor} />}
                    label="Amount"
                    value={formatActivityAmount(activity.amount, activity.currency)}
                  />

                  {shouldShowConvertedAmount(activity) && (
                    <ActivityDetailRow
                      icon={<Coins size={18} color={secondaryTextColor} />}
                      label="Converted Amount"
                      value={CurrencyConversionService.formatConvertedAmountWithFallback(
                        activity.converted_amount,
                        activity.converted_currency as Currency
                      )}
                    />
                  )}

                  {activity.currency && (
                    <ActivityDetailRow
                      icon={<Coins size={18} color={secondaryTextColor} />}
                      label="Original Currency"
                      value={activity.currency}
                    />
                  )}
                </>
              )}

              {isTicket && activity.detail && (
                <ActivityDetailRow
                  icon={<Ticket size={18} color={secondaryTextColor} />}
                  label="Token Name"
                  value={activity.detail}
                />
              )}

              {isTicket && activity.amount && activity.amount > 0 && (
                <ActivityDetailRow
                  icon={<Coins size={18} color={secondaryTextColor} />}
                  label="Quantity"
                  value={`${activity.amount} ${activity.amount === 1 ? 'ticket' : 'tickets'}`}
                />
              )}

              {isTicket && (
                <ActivityDetailRow
                  icon={<Server size={18} color={secondaryTextColor} />}
                  label="Mint URL"
                  value={activity.service_key}
                  copyable
                  onCopy={handleCopyServiceKey}
                />
              )}

              {!isTicket && (
                <ActivityDetailRow
                  icon={<Info size={18} color={secondaryTextColor} />}
                  label="Status Details"
                  value={activity.detail}
                />
              )}

              <ActivityDetailRow
                icon={<Link size={18} color={secondaryTextColor} />}
                label="Request ID"
                value={activity.request_id}
                copyable
                onCopy={handleCopyRequestId}
                isLast
              />
            </View>
          </View>

          {/* Activity Type Specific Information */}
          <View style={styles.sectionContainer}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: primaryTextColor }]}>
              {isAuth
                ? 'Security Information'
                : isTicket
                  ? 'Ticket Information'
                  : 'Payment Information'}
            </ThemedText>

            <View style={[styles.infoCard, { backgroundColor: surfaceSecondaryColor }]}>
              <View style={styles.infoContent}>
                {isAuth ? (
                  <Shield size={24} color={primaryTextColor} style={styles.infoIcon} />
                ) : isTicket ? (
                  <Ticket size={24} color={primaryTextColor} style={styles.infoIcon} />
                ) : (
                  <BanknoteIcon size={24} color={primaryTextColor} style={styles.infoIcon} />
                )}
                <View style={styles.infoTextContainer}>
                  <ThemedText style={[styles.infoTitle, { color: primaryTextColor }]}>
                    {isAuth
                      ? 'Authentication Request'
                      : isTicket
                        ? 'Ticket Request'
                        : 'Payment Transaction'}
                  </ThemedText>
                  <ThemedText style={[styles.infoText, { color: secondaryTextColor }]}>
                    {getRequestDescriptionText(
                      isAuth,
                      isTicket,
                      activity.service_name,
                      activity.detail
                    )}
                    {activityStatus === 'success' &&
                      getSuccessStatusText(isAuth, isTicket, activity.type)}
                    {activityStatus === 'failed' &&
                      getFailedStatusText(
                        isAuth,
                        isTicket,
                        activity.detail,
                        activity.detail.toLowerCase().includes('denied')
                      )}
                    {activityStatus === 'pending' &&
                      !isAuth &&
                      !isTicket &&
                      ' The payment is still being processed.'}
                  </ThemedText>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  detailCard: {
    borderRadius: 20,
    padding: 20,
  },
  statusCard: {
    borderRadius: 20,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  backToListButton: {
    padding: 16,
    borderRadius: 16,
    marginTop: 20,
  },
  backToListButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  infoCard: {
    borderRadius: 20,
    padding: 20,
  },
  infoContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoIcon: {
    marginRight: 16,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 16,
    lineHeight: 22,
  },
});
