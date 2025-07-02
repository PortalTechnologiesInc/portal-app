import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, FlatList, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDayAndDate } from '@/utils';
import { useActivities } from '@/context/ActivitiesContext';
import { fromUnixSeconds, type SubscriptionWithDates } from '@/services/database';
import { parseCalendar } from 'portal-app-lib';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function SubscriptionsScreen() {
  const { subscriptions, isDbReady } = useActivities();
  const [filter, setFilter] = useState<'archived' | 'active'>('active');

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroungColor = useThemeColor({}, 'cardBackground');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonSecondaryColor = useThemeColor({}, 'buttonSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonSecondaryTextColor = useThemeColor({}, 'buttonSecondaryText');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');

  const handleFilterActive = useCallback(() => setFilter('active'), []);
  const handleFilterArchived = useCallback(() => setFilter('archived'), []);

  const filteredSubscriptions = useMemo(
    () => (filter === 'active' ? subscriptions.filter(item => item.status === 'active') : subscriptions.filter(item => item.status === 'cancelled' || item.status === 'expired')),
    [filter, subscriptions]
  );

  const handleSubscriptionPress = useCallback((subscriptionId: string) => {
    router.push({
      pathname: '/subscription/[id]',
      params: { id: subscriptionId },
    });
  }, []);

  // Memoize renderItem to prevent recreation on every render
  const renderItem = useCallback(
    ({ item }: { item: SubscriptionWithDates }) => {
      const parsedCalendar = parseCalendar(item.recurrence_calendar);
      const nextPayment =
        item.recurrence_first_payment_due > new Date() || !item.last_payment_date
          ? item.recurrence_first_payment_due
          : fromUnixSeconds(
              parsedCalendar.nextOccurrence(
                BigInt((item.last_payment_date?.getTime() ?? 0) / 1000)
              ) ?? 0
            );

      return (
        <TouchableOpacity
          style={[styles.subscriptionCard, { backgroundColor: cardBackgroungColor }]}
          onPress={() => handleSubscriptionPress(item.id)}
          activeOpacity={0.7}
        >
          <View style={styles.cardContent}>
            <View style={styles.headerRow}>
              <ThemedText type="subtitle" style={{ color: primaryTextColor }}>
                {item.service_name}
              </ThemedText>
              <ThemedText style={[styles.amount, { color: primaryTextColor }]}>
                {item.amount} {item.currency}
              </ThemedText>
            </View>

            <ThemedText
              style={[styles.recurrency, { color: secondaryTextColor }]}
              type="defaultSemiBold"
            >
              {parsedCalendar.toHumanReadable(false)}
            </ThemedText>

            {
              item.status == 'active' ? 
                <ThemedText style={[styles.nextPayment, { color: secondaryTextColor }]}>
                  Next payment: {formatDayAndDate(nextPayment)}
                </ThemedText> :
                <ThemedText style={[styles.nextPayment, { color: secondaryTextColor }]}>
                  Subscription {item.status}
                </ThemedText>
            }
          </View>
        </TouchableOpacity>
      );
    },
    [handleSubscriptionPress, cardBackgroungColor, primaryTextColor, secondaryTextColor]
  );

  // Show a database initialization message when database isn't ready
  if (!isDbReady) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
        <ThemedView style={styles.container}>
          <ThemedText type="title" style={{ color: primaryTextColor }}>
            Your subscriptions
          </ThemedText>
          <View style={[styles.emptyContainer, { backgroundColor: cardBackgroungColor }]}>
            <ThemedText style={[styles.emptyText, { color: secondaryTextColor }]}>
              Subscriptions will be available after setup is complete
            </ThemedText>
          </View>
        </ThemedView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={{ color: primaryTextColor }}>
          Your subscriptions
        </ThemedText>
        <View style={styles.filterContainer}>
          <TouchableOpacity
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  filter === 'active' ? buttonPrimaryColor : buttonSecondaryColor,
              },
            ]}
            onPress={handleFilterActive}
          >
            <ThemedText
              type="subtitle"
              style={[
                styles.filterChipText,
                {
                  color:
                    filter === 'archived'
                      ? buttonPrimaryTextColor
                      : buttonSecondaryTextColor,
                },
              ]}
            >
              Active
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  filter === 'archived' ? buttonPrimaryColor : buttonSecondaryColor,
              },
            ]}
            onPress={handleFilterArchived}
          >
            <ThemedText
              type="subtitle"
              style={[
                styles.filterChipText,
                {
                  color:
                    filter === 'archived'
                      ? buttonPrimaryTextColor
                      : buttonSecondaryTextColor,
                },
              ]}
            >
              Archived
            </ThemedText>
          </TouchableOpacity>
        </View>

        {filteredSubscriptions.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: cardBackgroungColor }]}>
            <ThemedText style={[styles.emptyText, { color: secondaryTextColor }]}>
              No subscriptions found
            </ThemedText>
          </View>
        ) : (
          <FlatList
            showsVerticalScrollIndicator={false}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            data={filteredSubscriptions}
            renderItem={renderItem}
            keyExtractor={item => item.id}
          />
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    // backgroundColor handled by theme
  },
  header: {
    justifyContent: 'space-between',
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  recurrency: {
    marginBottom: 12,
    // color handled by theme
  },
  nextPayment: {
    marginVertical: 2,
    // color handled by theme
  },
  subscriptionCard: {
    // backgroundColor handled by theme
    borderRadius: 20,
    padding: 18,
    marginBottom: 10,
  },
  cardContent: {
    flex: 1,
  },
  amount: {
    fontSize: 16,
    fontWeight: '600',
    // color handled by theme
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    // backgroundColor handled by theme
  },
  list: {
    marginTop: 24,
    flex: 1,
  },
  listContent: {
    paddingVertical: 24,
  },
  emptyContainer: {
    flex: 1,
    // backgroundColor handled by theme
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    // color handled by theme
  },
  filterContainer: {
    paddingVertical: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChip: {
    // backgroundColor handled by theme
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginEnd: 8,
    borderRadius: 20,
  },
  filterChipText: {
    // color handled by theme
    fontSize: 14,
    fontWeight: '500',
  },
});
