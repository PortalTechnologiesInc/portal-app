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
import {
  type ActivityWithDates,
  type SubscriptionWithDates,
  useDatabaseStatus,
  useSafeDatabaseService,
} from '@/services/database';

interface ActivitiesContextType {
  // Activity management
  activities: ActivityWithDates[];
  loadMoreActivities: () => Promise<void>;
  refreshData: () => Promise<void>;
  resetToFirstPage: () => void;
  hasMoreActivities: boolean;
  isLoadingMore: boolean;
  totalActivities: number;
  isDbReady: boolean;

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

  // Use centralized database service
  const DB = useSafeDatabaseService();
  const dbStatus = useDatabaseStatus();
  const isDbReady = dbStatus.isDbInitialized && DB !== null;

  // Log database readiness for debugging
  useEffect(() => {
    if (isDbReady) {
      console.log('ActivitiesContext: Database service is ready');
    } else {
      console.log('ActivitiesContext: Database service not ready yet');
    }
  }, [isDbReady]);

  // No need for manual DB initialization - using centralized service

  const fetchActivities = useCallback(
    async (reset = false) => {
      if (!DB || !isDbReady) {
        console.log('fetchActivities: DB not ready', { DB: !!DB, isDbReady });
        return;
      }

      try {
        const offset = reset ? 0 : currentOffsetRef.current;
        console.log('fetchActivities: fetching with offset', offset);
        const fetchedActivities = await DB.getActivities({
          limit: ACTIVITIES_PER_PAGE,
          offset: offset,
        });
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
            const newActivities = fetchedActivities.filter(
              activity => !existingIds.has(activity.id)
            );
            return [...prev, ...newActivities];
          });
          setCurrentOffset(prev => prev + ACTIVITIES_PER_PAGE);
          currentOffsetRef.current += ACTIVITIES_PER_PAGE;
        }

        // Update hasMore flag based on whether we got a full page
        setHasMoreActivities(fetchedActivities.length === ACTIVITIES_PER_PAGE);

        // Get total count for reference (optional)
        const allActivities = await DB.getActivities();
        setTotalActivities(allActivities.length);
        console.log('fetchActivities: total activities count', allActivities.length);
      } catch (error) {
        console.error('Failed to fetch activities:', error);
        // Database errors are handled by the centralized service
      }
    },
    [DB, isDbReady, ACTIVITIES_PER_PAGE]
  );

  const fetchSubscriptions = useCallback(async () => {
    if (!DB || !isDbReady) return;

    try {
      const fetchedSubscriptions = await DB.getSubscriptions();
      setSubscriptions(fetchedSubscriptions);
      setActiveSubscriptions(fetchedSubscriptions.filter((s: any) => s.status === 'active'));
    } catch (error) {
      console.error('Failed to fetch subscriptions:', error);
      // Database errors are handled by the centralized service
    }
  }, [DB, isDbReady]);

  // Use ref to track if initial fetch has been done to prevent re-fetching
  const hasInitialFetchRef = useRef(false);
  // Use ref to track current offset to avoid dependency issues
  const currentOffsetRef = useRef(0);

  // Update ref when offset state changes
  useEffect(() => {
    currentOffsetRef.current = currentOffset;
  }, [currentOffset]);

  // Initial fetch when database becomes ready
  useEffect(() => {
    if (isDbReady && !hasInitialFetchRef.current) {
      console.log('ActivitiesContext: DB ready, starting initial fetch');
      hasInitialFetchRef.current = true;
      Promise.all([fetchActivities(true), fetchSubscriptions()]).catch(error => {
        console.error('Initial data fetch failed:', error);
      });
    }
  }, [isDbReady, fetchActivities, fetchSubscriptions]);

  // Reset fetch flag when database becomes unavailable
  useEffect(() => {
    if (!isDbReady) {
      hasInitialFetchRef.current = false;
    }
  }, [isDbReady]);

  const loadMoreActivities = useCallback(async () => {
    if (!hasMoreActivities || isLoadingMore || !isDbReady) {
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
  }, [hasMoreActivities, isLoadingMore, fetchActivities, isDbReady]);

  const refreshData = useCallback(async () => {
    if (!isDbReady) {
      console.log('DB not ready for refresh');
      return;
    }

    try {
      hasInitialFetchRef.current = false;
      setCurrentOffset(0);
      currentOffsetRef.current = 0;
      setHasMoreActivities(true);
      await Promise.all([fetchActivities(true), fetchSubscriptions()]);
      hasInitialFetchRef.current = true;
      console.log('Data refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh data:', error);
      // Database errors are handled by the centralized service
    }
  }, [isDbReady, fetchActivities, fetchSubscriptions]);

  // Listen for activity events to refresh activities list
  useEffect(() => {
    const { globalEvents } = require('@/utils/index');

    const handleActivityAdded = (activity: ActivityWithDates) => {
      console.log('ActivitiesContext: activityAdded event received, refreshing activities');
      if (isDbReady) {
        refreshData();
      }
    };

    globalEvents.on('activityAdded', handleActivityAdded);

    return () => {
      globalEvents.off('activityAdded', handleActivityAdded);
    };
  }, [isDbReady, refreshData]);

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
    if (!DB || !isDbReady) {
      console.log('DB not ready for getRecentActivities');
      return [];
    }

    try {
      const recentActivities = await DB.getActivities({ limit: 5, offset: 0 });
      return recentActivities;
    } catch (error) {
      console.error('Failed to get recent activities:', error);
      // Database errors are handled by the centralized service
      return [];
    }
  }, [DB, isDbReady]);

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
      isDbReady,
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
      isDbReady,
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
