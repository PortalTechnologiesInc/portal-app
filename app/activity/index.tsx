import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import type React from 'react';
import { useCallback, useMemo, useRef } from 'react';
import { FlatList, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityRow } from '@/components/ActivityRow';
import { ThemedView } from '@/components/ThemedView';
import type { ActivityFilterType } from '@/context/ActivitiesContext';
import { useActivities } from '@/context/ActivitiesContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { ActivityWithDates } from '@/services/DatabaseService';
import { ThemedText } from '../../components/ThemedText';

const ItemList: React.FC = () => {
  const {
    activities,
    refreshData,
    loadMoreActivities,
    hasMoreActivities,
    isLoadingMore,
    resetToFirstPage,
    activeFilters,
    toggleFilter,
    resetFilters,
  } = useActivities();

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroungColor = useThemeColor({}, 'cardBackground');
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
      resetToFirstPage();

      // Return cleanup function that runs when page loses focus
      return () => {
        // Scroll to top, reset filters, and reset activities/infinite scroll when leaving the page
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
        resetFilters();
        refreshData();
      };
    }, [resetToFirstPage, refreshData, resetFilters])
  );

  // Memoize grouped items to prevent recalculation on every render
  const groupedItems = useMemo(() => {
    return activities.reduce(
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
  }, [activities]);

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
  const handleToggleFilter = useCallback(
    (filter: ActivityFilterType) => {
      toggleFilter(filter);
    },
    [toggleFilter]
  );

  // Memoized list header and footer components
  const ListHeaderComponent = useMemo(() => <View style={{ height: 16 }} />, []);
  const ListFooterComponent = useMemo(
    () => (
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
    ),
    [isLoadingMore, hasMoreActivities, activities.length, secondaryTextColor]
  );

  // link handler
  const handleLinkPress = useCallback((activity: ActivityWithDates) => {
    router.push({
      pathname: '/activity/[id]',
      params: { id: activity.id },
    });
  }, []);

  // Infinite scroll handler
  const handleEndReached = useCallback(() => {
    if (hasMoreActivities && !isLoadingMore) {
      loadMoreActivities();
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
            <ActivityRow activity={activity} />
          </TouchableOpacity>
        ))}
      </>
    ),
    [renderSectionHeader, handleLinkPress]
  );

  // Activities are automatically loaded - no manual readiness check needed

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={{ color: primaryTextColor }}>
          Your activities
        </ThemedText>
        <View style={[styles.filtersCard, { backgroundColor: cardBackgroungColor }]}>
          <ThemedText type="subtitle" style={[styles.filtersLabel, { color: secondaryTextColor }]}>
            Filters
          </ThemedText>
          <ScrollView
            style={styles.filterScroll}
            contentContainerStyle={styles.filterContainer}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            <TouchableOpacity
              style={[
                styles.filterChip,
                styles.filterChipFirst,
                {
                  backgroundColor: activeFilters.has('logins')
                    ? buttonPrimaryColor
                    : buttonSecondaryColor,
                },
              ]}
              onPress={() => handleToggleFilter('logins')}
            >
              <ThemedText
                type="subtitle"
                style={[
                  styles.filterChipText,
                  {
                    color: activeFilters.has('logins')
                      ? buttonPrimaryTextColor
                      : buttonSecondaryTextColor,
                  },
                ]}
              >
                Logins
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  backgroundColor: activeFilters.has('payments')
                    ? buttonPrimaryColor
                    : buttonSecondaryColor,
                },
              ]}
              onPress={() => handleToggleFilter('payments')}
            >
              <ThemedText
                type="subtitle"
                style={[
                  styles.filterChipText,
                  {
                    color: activeFilters.has('payments')
                      ? buttonPrimaryTextColor
                      : buttonSecondaryTextColor,
                  },
                ]}
              >
                Payments
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  backgroundColor: activeFilters.has('subscriptions')
                    ? buttonPrimaryColor
                    : buttonSecondaryColor,
                },
              ]}
              onPress={() => handleToggleFilter('subscriptions')}
            >
              <ThemedText
                type="subtitle"
                style={[
                  styles.filterChipText,
                  {
                    color: activeFilters.has('subscriptions')
                      ? buttonPrimaryTextColor
                      : buttonSecondaryTextColor,
                  },
                ]}
              >
                Subscriptions
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterChip,
                styles.filterChipLast,
                {
                  backgroundColor: activeFilters.has('tickets')
                    ? buttonPrimaryColor
                    : buttonSecondaryColor,
                },
              ]}
              onPress={() => handleToggleFilter('tickets')}
            >
              <ThemedText
                type="subtitle"
                style={[
                  styles.filterChipText,
                  {
                    color: activeFilters.has('tickets')
                      ? buttonPrimaryTextColor
                      : buttonSecondaryTextColor,
                  },
                ]}
              >
                Tickets
              </ThemedText>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {listData.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: cardBackgroungColor }]}>
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
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.1}
            ref={flatListRef}
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
  filtersCard: {
    borderRadius: 20,
    paddingHorizontal: 2,
    paddingVertical: 12,
    marginTop: 16,
    marginBottom: 12,
  },
  filtersLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 12,
  },
  filterScroll: {
    marginTop: 12,
    alignSelf: 'stretch',
  },
  filterContainer: {
    flexDirection: 'row',
    columnGap: 8,
  },
  filterChip: {
    // backgroundColor handled by theme
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  filterChipFirst: {
    marginLeft: 8,
  },
  filterChipLast: {
    marginRight: 8,
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
  endOfListText: {
    fontSize: 14,
    fontWeight: '500',
  },
});

export default ItemList;
