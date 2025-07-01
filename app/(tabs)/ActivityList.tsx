import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';

const ItemList: React.FC = () => {
  const { 
    activities, 
    isDbReady, 
    refreshData, 
    loadMoreActivities, 
    hasMoreActivities, 
    isLoadingMore,
    resetToFirstPage
  } = useActivities();
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

  // Ref for FlatList to control scroll position
  const flatListRef = useRef<FlatList>(null);

  // Reset to first 20 activities when entering/leaving page for memory optimization
  useFocusEffect(
    useCallback(() => {
      // When page comes into focus - reset to first 20 activities (fresh data)
      if (isDbReady) {
        resetToFirstPage();
      }

      // Return cleanup function that runs when page loses focus
      return () => {
        // Scroll to top and reset to first 20 activities when leaving the page
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
        resetToFirstPage();
      };
    }, [isDbReady, resetToFirstPage])
  );

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
  const ListFooterComponent = useMemo(() => (
    <View style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}>
      {isLoadingMore ? (
        <ThemedText style={[styles.loadingText, { color: secondaryTextColor }]}>
          Loading more activities...
        </ThemedText>
      ) : !hasMoreActivities && activities.length > 0 ? (
        <ThemedText style={[styles.endOfListText, { color: secondaryTextColor }]}>
          No more activities
        </ThemedText>
      ) : null}
    </View>
  ), [isLoadingMore, hasMoreActivities, activities.length, secondaryTextColor]);

  // link handler
  const handleLinkPress = useCallback((activity: ActivityWithDates) => {
    router.push({
      pathname: '/activity/[id]',
      params: { id: activity.id },
    });
  }, []);

  // Infinite scroll handler
  const handleEndReached = useCallback(() => {
    if (hasMoreActivities && !isLoadingMore && filter === null) {
      loadMoreActivities();
    }
  }, [hasMoreActivities, isLoadingMore, loadMoreActivities, filter]);

  // Load all activities handler for when filters are applied
  const handleLoadAllActivities = useCallback(async () => {
    while (hasMoreActivities && !isLoadingMore) {
      await loadMoreActivities();
    }
  }, [hasMoreActivities, isLoadingMore, loadMoreActivities]);

  // Memoize list item renderer
  const listItemRenderer = useCallback(
    ({ item }: { item: { title: string; data: ActivityWithDates[] } }) => (
      <>
        {renderSectionHeader({ section: { title: item.title } })}
        {item.data.map((activity: ActivityWithDates, index: number) => (
          <TouchableOpacity
            onPress={() => handleLinkPress(activity)}
            key={`${activity.id}-${item.title}-${index}`}
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
          <>
            {filter !== null && hasMoreActivities && (
              <View style={[styles.filterNote, { backgroundColor: surfaceSecondaryColor }]}>
                <ThemedText style={[styles.filterNoteText, { color: secondaryTextColor }]}>
                  Filtering is applied to currently loaded activities only.
                </ThemedText>
                <TouchableOpacity
                  style={[styles.loadAllButton, { backgroundColor: buttonPrimaryColor }]}
                  onPress={handleLoadAllActivities}
                  disabled={isLoadingMore}
                >
                  <ThemedText style={[styles.loadAllButtonText, { color: buttonPrimaryTextColor }]}>
                    {isLoadingMore ? 'Loading...' : 'Load All Activities'}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            )}
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
              onEndReached={handleEndReached}
              onEndReachedThreshold={0.1}
              ref={flatListRef}
            />
          </>
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
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  filterNote: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 20,
  },
  filterNoteText: {
    fontSize: 14,
    fontWeight: '500',
  },
  loadAllButton: {
    padding: 12,
    borderRadius: 20,
    marginTop: 12,
  },
  loadAllButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  endOfListText: {
    fontSize: 14,
    fontWeight: '500',
  },
});

export default ItemList;
