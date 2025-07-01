import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { ThemedText } from '../../components/ThemedText';
import { ActivityType as ActivityTypeEnum } from '../../models/Activity';
import { ThemedView } from '@/components/ThemedView';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ActivityWithDates } from '@/services/database';
import { useActivities } from '@/context/ActivitiesContext';
import { ActivityRow } from '@/components/ActivityRow';
import { router } from 'expo-router';
import { useThemeColor } from '@/hooks/useThemeColor';

const ItemList: React.FC = () => {
  const { activities, isDbReady, refreshData } = useActivities();
  const [filter, setFilter] = useState<ActivityTypeEnum | null>(null);

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const surfaceSecondaryColor = useThemeColor({}, 'surfaceSecondary');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonSecondaryColor = useThemeColor({}, 'buttonSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonSecondaryTextColor = useThemeColor({}, 'buttonSecondaryText');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');

  // Refresh data when component mounts or becomes focused
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Memoize filtered items to prevent recalculation on every render
  const filteredItems = useMemo(
    () => (filter === null ? activities : activities.filter(item => item.type === filter)),
    [filter, activities]
  );

  // Memoize grouped items to prevent recalculation on every render
  const groupedItems = useMemo(() => {
    return filteredItems.reduce(
      (acc, item) => {
        const dateString = item.date.toDateString();
        if (!acc[dateString]) {
          acc[dateString] = [];
        }
        acc[dateString].push(item);
        return acc;
      },
      {} as Record<string, ActivityWithDates[]>
    );
  }, [filteredItems]);

  // Memoize data for FlatList to prevent new array creation on every render
  const listData = useMemo(
    () => Object.entries(groupedItems).map(([title, data]) => ({ title, data })),
    [groupedItems]
  );

  // Memoize section header to prevent recreation on every render
  const renderSectionHeader = useCallback(
    ({ section: { title } }: { section: { title: string } }) => (
      <ThemedText type="subtitle" style={[styles.date, { color: secondaryTextColor }]}>
        {title}
      </ThemedText>
    ),
    [secondaryTextColor]
  );

  // Memoize filter handlers
  const handleFilterAll = useCallback(() => setFilter(null), []);
  const handleFilterPay = useCallback(() => setFilter(ActivityTypeEnum.Pay), []);
  const handleFilterAuth = useCallback(() => setFilter(ActivityTypeEnum.Auth), []);

  // Memoized list header and footer components
  const ListHeaderComponent = useMemo(() => <View style={{ height: 16 }} />, []);
  const ListFooterComponent = useMemo(() => <View style={{ height: 24 }} />, []);

  // link handler
  const handleLinkPress = useCallback((activity: ActivityWithDates) => {
    router.push({
      pathname: '/activity/[id]',
      params: { id: activity.id },
    });
  }, []);

  // Memoize list item renderer
  const listItemRenderer = useCallback(
    ({ item }: { item: { title: string; data: ActivityWithDates[] } }) => (
      <>
        {renderSectionHeader({ section: { title: item.title } })}
        {item.data.map((activity: ActivityWithDates) => (
          <TouchableOpacity
            onPress={() => handleLinkPress(activity)}
            key={`${activity.id}-${activity.date.getTime()}`}
          >
            <React.Fragment>
              <ActivityRow activity={activity} />
            </React.Fragment>
          </TouchableOpacity>
        ))}
      </>
    ),
    [renderSectionHeader, handleLinkPress]
  );

  // Show a database initialization message when database isn't ready
  if (!isDbReady) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
        <ThemedView style={styles.container}>
          <ThemedText type="title" style={{ color: primaryTextColor }}>
            Your activities
          </ThemedText>
          <View style={[styles.emptyContainer, { backgroundColor: surfaceSecondaryColor }]}>
            <ThemedText style={[styles.emptyText, { color: secondaryTextColor }]}>
              Activities will be available after setup is complete
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
          Your activities
        </ThemedText>
        <View style={styles.filterContainer}>
          <TouchableOpacity
            style={[
              styles.filterChip,
              { backgroundColor: filter === null ? buttonPrimaryColor : buttonSecondaryColor },
            ]}
            onPress={handleFilterAll}
          >
            <ThemedText
              type="subtitle"
              style={[
                styles.filterChipText,
                { color: filter === null ? buttonPrimaryTextColor : buttonSecondaryTextColor },
              ]}
            >
              All
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  filter === ActivityTypeEnum.Pay ? buttonPrimaryColor : buttonSecondaryColor,
              },
            ]}
            onPress={handleFilterPay}
          >
            <ThemedText
              type="subtitle"
              style={[
                styles.filterChipText,
                {
                  color:
                    filter === ActivityTypeEnum.Pay
                      ? buttonPrimaryTextColor
                      : buttonSecondaryTextColor,
                },
              ]}
            >
              Pay
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  filter === ActivityTypeEnum.Auth ? buttonPrimaryColor : buttonSecondaryColor,
              },
            ]}
            onPress={handleFilterAuth}
          >
            <ThemedText
              type="subtitle"
              style={[
                styles.filterChipText,
                {
                  color:
                    filter === ActivityTypeEnum.Auth
                      ? buttonPrimaryTextColor
                      : buttonSecondaryTextColor,
                },
              ]}
            >
              Login
            </ThemedText>
          </TouchableOpacity>
        </View>

        {listData.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: surfaceSecondaryColor }]}>
            <ThemedText style={[styles.emptyText, { color: secondaryTextColor }]}>
              No activities found
            </ThemedText>
          </View>
        ) : (
          <FlatList
            showsVerticalScrollIndicator={false}
            data={listData}
            renderItem={listItemRenderer}
            keyExtractor={item => item.title}
            ListHeaderComponent={ListHeaderComponent}
            ListFooterComponent={ListFooterComponent}
            removeClippedSubviews={true}
            maxToRenderPerBatch={10}
            windowSize={10}
            initialNumToRender={8}
          />
        )}
      </ThemedView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    // backgroundColor handled by theme
  },
  container: {
    width: '100%',
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    // backgroundColor handled by theme
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
  date: {
    marginBottom: 6,
    // color handled by theme
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
});

export default ItemList;
