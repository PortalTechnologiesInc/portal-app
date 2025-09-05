import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
  useRef,
} from 'react';
import { type ActivityWithDates, type SubscriptionWithDates } from '@/services/DatabaseService';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { registerContextReset, unregisterContextReset } from '@/services/ContextResetService';

interface ActivitiesContextType {
  // Activity management
  activities: ActivityWithDates[];
  loadMoreActivities: () => Promise<void>;
  refreshData: () => Promise<void>;
  resetToFirstPage: () => void;
  hasMoreActivities: boolean;
  isLoadingMore: boolean;
  totalActivities: number;

  // Subscription management
  subscriptions: SubscriptionWithDates[];
  activeSubscriptions: SubscriptionWithDates[];

  // Helper functions
  addActivityIfNotExists: (activity: ActivityWithDates) => void;

  // Recent activities (limited to 5 for home screen)
  getRecentActivities: () => Promise<ActivityWithDates[]>;
}

const ActivitiesContext = createContext<ActivitiesContextType | undefined>(undefined);

export const ActivitiesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activities, setActivities] = useState<ActivityWithDates[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionWithDates[]>([]);
  const [activeSubscriptions, setActiveSubscriptions] = useState<SubscriptionWithDates[]>([]);

  // Pagination state
  const [hasMoreActivities, setHasMoreActivities] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [totalActivities, setTotalActivities] = useState(0);

  const ACTIVITIES_PER_PAGE = 20;

  // Simple database access
  const { executeOperation } = useDatabaseContext();

  // Reset all Activities state to initial values
  // This is called during app reset to ensure clean state
  const resetActivities = () => {
    console.log('🔄 Resetting Activities state...');

    // Reset all state to initial values
    setActivities([]);
    setSubscriptions([]);
    setActiveSubscriptions([]);
    setHasMoreActivities(true);
    setIsLoadingMore(false);
    setCurrentOffset(0);
    setTotalActivities(0);

    // Reset the current offset ref as well
    currentOffsetRef.current = 0;

    console.log('✅ Activities state reset completed');
  };

  // Register/unregister context reset function
  useEffect(() => {
    registerContextReset(resetActivities);

    return () => {
      unregisterContextReset(resetActivities);
    };
  }, []);

  const fetchActivities = useCallback(
    async (reset = false) => {
      const offset = reset ? 0 : currentOffsetRef.current;
      console.log('fetchActivities: fetching with offset', offset);

      const fetchedActivities = await executeOperation(
        db =>
          db.getActivities({
            limit: ACTIVITIES_PER_PAGE,
            offset: offset,
          }),
        []
      );

      console.log('fetchActivities: fetched activities count', fetchedActivities.length);

      if (reset) {
        // Complete refresh - replace all activities
        setActivities(fetchedActivities);
        setCurrentOffset(ACTIVITIES_PER_PAGE);
        currentOffsetRef.current = ACTIVITIES_PER_PAGE;
      } else {
        // Load more - append new activities, avoiding duplicates by ID
        setActivities(prev => {
          const existingIds = new Set(prev.map(activity => activity.id));
          const newActivities = fetchedActivities.filter(activity => !existingIds.has(activity.id));
          return [...prev, ...newActivities];
        });
        setCurrentOffset(prev => prev + ACTIVITIES_PER_PAGE);
        currentOffsetRef.current += ACTIVITIES_PER_PAGE;
      }

      // Update hasMore flag based on whether we got a full page
      setHasMoreActivities(fetchedActivities.length === ACTIVITIES_PER_PAGE);

      // Get total count for reference (optional)
      const allActivities = await executeOperation(db => db.getActivities(), []);
      setTotalActivities(allActivities.length);
      console.log('fetchActivities: total activities count', allActivities.length);
    },
    [executeOperation, ACTIVITIES_PER_PAGE]
  );

  const fetchSubscriptions = useCallback(async () => {
    const fetchedSubscriptions = await executeOperation(db => db.getSubscriptions(), []);
    setSubscriptions(fetchedSubscriptions);
    setActiveSubscriptions(fetchedSubscriptions.filter((s: any) => s.status === 'active'));
  }, [executeOperation]);

  // Use ref to track current offset to avoid dependency issues
  const currentOffsetRef = useRef(0);

  // Update ref when offset state changes
  useEffect(() => {
    currentOffsetRef.current = currentOffset;
  }, [currentOffset]);

  // Initial data fetch - simplified
  useEffect(() => {
    Promise.all([fetchActivities(true), fetchSubscriptions()]).catch(error => {
      console.error('Initial data fetch failed:', error);
    });
  }, [fetchActivities, fetchSubscriptions]);

  const loadMoreActivities = useCallback(async () => {
    if (!hasMoreActivities || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);

    try {
      await fetchActivities(false); // false = don't reset, append to existing
    } catch (error) {
      console.error('Failed to load more activities:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMoreActivities, isLoadingMore, fetchActivities]);

  const refreshData = useCallback(async () => {
    try {
      setCurrentOffset(0);
      currentOffsetRef.current = 0;
      setHasMoreActivities(true);
      await Promise.all([fetchActivities(true), fetchSubscriptions()]);
      console.log('Data refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh data:', error);
    }
  }, [fetchActivities, fetchSubscriptions]);

  // Listen for activity events to refresh activities list
  useEffect(() => {
    const { globalEvents } = require('@/utils/index');

    const handleActivityAdded = (activity: ActivityWithDates) => {
      console.log('ActivitiesContext: activityAdded event received, refreshing activities');
      refreshData();
    };

    globalEvents.on('activityAdded', handleActivityAdded);

    return () => {
      globalEvents.off('activityAdded', handleActivityAdded);
    };
  }, [refreshData]);

  // Optimized function to add activity without duplicates
  // Used by components that need to update the list immediately after DB operations
  const addActivityIfNotExists = useCallback((activity: ActivityWithDates) => {
    setActivities(prevActivities => {
      // Check if activity already exists
      const existingIndex = prevActivities.findIndex(a => a.id === activity.id);
      if (existingIndex !== -1) {
        // Activity exists - replace it to ensure we have the latest data
        const newActivities = [...prevActivities];
        newActivities[existingIndex] = activity;
        return newActivities;
      } else {
        // New activity - prepend to maintain chronological order
        return [activity, ...prevActivities];
      }
    });

    // Also increment total count for consistency
    setTotalActivities(prev => prev + 1);
  }, []);

  // Function to get recent activities for home screen (limited to 5)
  const getRecentActivities = useCallback(async (): Promise<ActivityWithDates[]> => {
    return await executeOperation(db => db.getActivities({ limit: 5, offset: 0 }), []);
  }, [executeOperation]);

  // Reset to first page of activities
  const resetToFirstPage = useCallback(() => {
    setCurrentOffset(0);
    currentOffsetRef.current = 0;
    setHasMoreActivities(true);
    // Don't clear activities here - let the next fetch handle it
    // This prevents flickering while new data loads
  }, []);

  const contextValue: ActivitiesContextType = useMemo(
    () => ({
      activities,
      subscriptions,
      activeSubscriptions,
      loadMoreActivities,
      refreshData,
      resetToFirstPage,
      hasMoreActivities,
      isLoadingMore,
      totalActivities,
      addActivityIfNotExists,
      getRecentActivities,
    }),
    [
      activities,
      subscriptions,
      activeSubscriptions,
      loadMoreActivities,
      refreshData,
      resetToFirstPage,
      hasMoreActivities,
      isLoadingMore,
      totalActivities,
      addActivityIfNotExists,
      getRecentActivities,
    ]
  );

  return <ActivitiesContext.Provider value={contextValue}>{children}</ActivitiesContext.Provider>;
};

export const useActivities = () => {
  const context = useContext(ActivitiesContext);
  if (!context) {
    throw new Error('useActivities must be used within an ActivitiesProvider');
  }
  return context;
};
