import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { formatDayAndDate, ActivityType } from '@/utils';
import {
  Calendar,
  AlertCircle,
  Shield,
  BanknoteIcon,
  DollarSign,
  Hash,
  Server,
  Coins,
  Info,
  Link,
} from 'lucide-react-native';
import { DatabaseService } from '@/services/database';
import type { ActivityWithDates } from '@/services/database';
import { useSQLiteContext } from 'expo-sqlite';
import { useThemeColor } from '@/hooks/useThemeColor';
import { getActivityStatus } from '@/utils/activityHelpers';
import { ActivityHeader } from '@/components/ActivityDetail/ActivityHeader';
import { ActivityMainCard } from '@/components/ActivityDetail/ActivityMainCard';
import { ActivityDetailRow } from '@/components/ActivityDetail/ActivityDetailRow';
import { PaymentStatusProgress, PaymentStep } from '@/components/ActivityDetail/PaymentStatusProgress';
import * as Clipboard from 'expo-clipboard';

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams();
  const [activity, setActivity] = useState<ActivityWithDates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentSteps, setPaymentSteps] = useState<PaymentStep[]>([
    {
      id: '1',
      status: 'completed',
      title: 'Payment initiated',
      subtitle: 'Your payment has been created',
    },
    {
      id: '2',
      status: 'pending',
      title: 'Pending...',
      subtitle: 'Processing your payment',
    },
  ]);
  const db = useSQLiteContext();

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const surfaceSecondaryColor = useThemeColor({}, 'surfaceSecondary');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonSecondaryColor = useThemeColor({}, 'buttonSecondary');
  const buttonSecondaryTextColor = useThemeColor({}, 'buttonSecondaryText');
  const statusErrorColor = useThemeColor({}, 'statusError');
  const statusConnectedColor = useThemeColor({}, 'statusConnected');

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        setLoading(true);
        const dbService = new DatabaseService(db);
        const activityData = await dbService.getActivity(id as string);

        if (activityData) {
          setActivity(activityData);
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
  }, [id, db]);

  const handleBackPress = () => {
    router.back();
  };

  const handleCopyId = () => {
    Clipboard.setStringAsync(id as string);
  };

  const handleShare = () => {
    if (!activity) return;

    const shareContent = {
      title: 'Activity Details',
      message: `Activity ID: ${activity.id}\nType: ${activity.type}\nStatus: ${getActivityStatus(activity.detail)}`,
      url: `myapp://activity/${activity.id}`, // Deep link to the activity
    };

    Share.share(shareContent);
  };

  const handleCopyServiceKey = () => {
    if (!activity) return;

    Clipboard.setStringAsync(activity.service_key as string);
  };

  const handleCopyRequestId = () => {
    if (!activity) return;

    Clipboard.setStringAsync(activity.request_id as string);
  };

  // Mock functions for testing payment status updates
  const simulatePaymentSuccess = () => {
    setPaymentSteps(prevSteps => 
      prevSteps.map((step, index) => 
        index === prevSteps.length - 1 && step.status === 'pending'
          ? { ...step, status: 'success', title: 'Done', subtitle: 'Payment completed successfully' }
          : step
      )
    );
  };

  const simulatePaymentError = (errorType: 'insufficient_funds' | 'network_error' | 'payment_declined' = 'insufficient_funds') => {
    setPaymentSteps(prevSteps => 
      prevSteps.map((step, index) => 
        index === prevSteps.length - 1 && step.status === 'pending'
          ? { 
              ...step, 
              status: 'error', 
              title: 'Failed', 
              subtitle: 'Payment could not be completed',
              errorType 
            }
          : step
      )
    );
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
      }
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

  const activityStatus = getActivityStatus(activity.detail);
  const isPayment = activity.type === ActivityType.Pay;
  const isAuth = activity.type === ActivityType.Auth;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <ThemedView style={styles.container}>
        <ActivityHeader
          isAuth={isAuth}
          onBackPress={handleBackPress}
          onShare={handleShare}
        />

        <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          <ActivityMainCard
            serviceName={activity.service_name}
            activityType={activity.type}
            activityStatus={activityStatus}
            detail={activity.detail}
            amount={activity.amount}
          />

          {/* Payment Status Progress - Only for payment activities */}
          {isPayment && (
            <View style={styles.sectionContainer}>
              <ThemedText type="subtitle" style={[styles.sectionTitle, { color: primaryTextColor }]}>
                Payment Status
              </ThemedText>
                             <View style={[styles.statusCard, { backgroundColor: surfaceSecondaryColor }]}>
                <PaymentStatusProgress 
                  steps={paymentSteps}
                  onRetry={handleRetryPayment}
                />
              </View>
            </View>
          )}

          {/* Temporary Test Controls - Remove when real logic is implemented */}
          {isPayment && (
            <View style={styles.sectionContainer}>
              <ThemedText type="subtitle" style={[styles.sectionTitle, { color: primaryTextColor }]}>
                Test Controls (Temporary)
              </ThemedText>
              <View style={[styles.testControlsCard, { backgroundColor: surfaceSecondaryColor }]}>
                <View style={styles.testButtonRow}>
                  <TouchableOpacity
                    onPress={simulatePaymentSuccess}
                    style={[styles.testButton, { backgroundColor: statusConnectedColor }]}
                  >
                    <ThemedText style={[styles.testButtonText, { color: 'white' }]}>
                      Simulate Success
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => simulatePaymentError('insufficient_funds')}
                    style={[styles.testButton, { backgroundColor: statusErrorColor }]}
                  >
                    <ThemedText style={[styles.testButtonText, { color: 'white' }]}>
                      Simulate Error
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Details Section */}
          <View style={styles.sectionContainer}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: primaryTextColor }]}>
              {isAuth ? 'Authentication Details' : 'Transaction Details'}
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

              <ActivityDetailRow
                icon={<Server size={18} color={secondaryTextColor} />}
                label="Service Key"
                value={activity.service_key}
                copyable
                onCopy={handleCopyServiceKey}
              />

              {isPayment && (
                <>
                  <ActivityDetailRow
                    icon={<DollarSign size={16} color={secondaryTextColor} />}
                    label="Amount"
                    value={activity.amount ? `${activity.amount} sats` : 'N/A'}
                  />

                  {activity.currency && (
                    <ActivityDetailRow
                      icon={<Coins size={18} color={secondaryTextColor} />}
                      label="Currency"
                      value={activity.currency}
                    />
                  )}
                </>
              )}

              <ActivityDetailRow
                icon={<Info size={18} color={secondaryTextColor} />}
                label="Status Details"
                value={activity.detail}
              />

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
              {isAuth ? 'Security Information' : 'Payment Information'}
            </ThemedText>

            <View style={[styles.infoCard, { backgroundColor: surfaceSecondaryColor }]}>
              <View style={styles.infoContent}>
                {isAuth ? (
                  <Shield size={24} color={primaryTextColor} style={styles.infoIcon} />
                ) : (
                  <BanknoteIcon size={24} color={primaryTextColor} style={styles.infoIcon} />
                )}
                <View style={styles.infoTextContainer}>
                  <ThemedText style={[styles.infoTitle, { color: primaryTextColor }]}>
                    {isAuth ? 'Authentication Request' : 'Payment Transaction'}
                  </ThemedText>
                  <ThemedText style={[styles.infoText, { color: secondaryTextColor }]}>
                    This was a {isAuth ? 'login' : 'payment'} request {isAuth ? 'to authenticate your identity with' : 'from'} {activity.service_name}.
                    {activityStatus === 'success' && (isAuth ? ' You successfully granted access.' : ' The payment was processed successfully.')}
                    {activityStatus === 'failed' &&
                      activity.detail.toLowerCase().includes('denied') &&
                      (isAuth ? ' You denied this authentication request.' : ' You denied this payment request.')}
                    {activityStatus === 'failed' &&
                      !activity.detail.toLowerCase().includes('denied') &&
                      (isAuth ? ' The authentication was not completed.' : ' The payment could not be completed.')}
                    {activityStatus === 'pending' && !isAuth && ' The payment is still being processed.'}
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
  testControlsCard: {
    borderRadius: 20,
    padding: 20,
  },
  testButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  testButton: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  testButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
