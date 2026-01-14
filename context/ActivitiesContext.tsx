import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { registerContextReset, unregisterContextReset } from '@/services/ContextResetService';
import type { ActivityWithDates, SubscriptionWithDates } from '@/services/DatabaseService';
import { ActivityType, globalEvents } from '@/utils/common';

export type ActivityFilterType = 'logins' | 'payments' | 'subscriptions' | 'tickets';

interface ActivitiesContextType {
  // Activity management
  activities: ActivityWithDates[];
  loadMoreActivities: () => Promise<void>;
  refreshData: () => Promise<void>;
  resetToFirstPage: () => void;
  hasMoreActivities: boolean;
  isLoadingMore: boolean;
  totalActivities: number;

  // Filter management
  activeFilters: Set<ActivityFilterType>;
  toggleFilter: (filter: ActivityFilterType) => void;
  resetFilters: () => void;

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
  const [activeFilters, setActiveFilters] = useState<Set<ActivityFilterType>>(new Set());

  const ACTIVITIES_PER_PAGE = 20;

  // Simple database access
  const { executeOperation } = useDatabaseContext();

  // Reset all Activities state to initial values
  // This is called during app reset to ensure clean state
  const resetActivities = useCallback(() => {
    // Reset all state to initial values
    setActivities([]);
    setSubscriptions([]);
    setActiveSubscriptions([]);
    setHasMoreActivities(true);
    setIsLoadingMore(false);
    setCurrentOffset(0);
    setTotalActivities(0);
    setActiveFilters(new Set());
    // Reset the current offset ref as well
    currentOffsetRef.current = 0;
  }, []);

  // Register/unregister context reset function
  useEffect(() => {
    registerContextReset(resetActivities);

    return () => {
      unregisterContextReset(resetActivities);
    };
  }, [resetActivities]);

  const fetchActivities = useCallback(
    async (reset = false) => {
      const offset = reset ? 0 : currentOffsetRef.current;

      // Use ref to get current filters to avoid dependency on activeFilters
      const filters = activeFiltersRef.current;

      // Build filter options based on active filters
      const types: ActivityType[] = [];
      let includeSubscriptions = false;
      let excludeSubscriptions = false;
      const hasPayments = filters.has('payments');
      const hasSubscriptions = filters.has('subscriptions');

      if (filters.has('logins')) {
        types.push(ActivityType.Auth);
      }
      if (hasPayments) {
        types.push(ActivityType.Pay);
        types.push(ActivityType.Receive);
        // Exclude subscriptions only if subscriptions filter is NOT active
        if (!hasSubscriptions) {
          excludeSubscriptions = true;
        }
      }
      if (hasSubscriptions) {
        includeSubscriptions = true;
        // When both payments and subscriptions are selected, we need special handling
        // Set excludeSubscriptions to true to trigger the OR logic in database service
        if (hasPayments) {
          excludeSubscriptions = true;
        }
      }
      if (filters.has('tickets')) {
        types.push(ActivityType.Ticket);
        types.push(ActivityType.TicketApproved);
        types.push(ActivityType.TicketDenied);
        types.push(ActivityType.TicketReceived);
      }

      // If no filters are active, show all activities
      const filterOptions =
        filters.size === 0
          ? { limit: ACTIVITIES_PER_PAGE, offset: offset }
          : {
            limit: ACTIVITIES_PER_PAGE,
            offset: offset,
            types: types.length > 0 ? types : undefined,
            includeSubscriptions: includeSubscriptions || undefined,
            excludeSubscriptions: excludeSubscriptions || undefined,
          };

      const fetchedActivities = await executeOperation(db => db.getActivities(filterOptions), []);

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

      // Get total count for filtered activities (use same logic as fetch)
      const countOptions =
        filters.size === 0
          ? {}
          : {
            types: types.length > 0 ? types : undefined,
            includeSubscriptions: includeSubscriptions || undefined,
            excludeSubscriptions: excludeSubscriptions || undefined,
          };
      const allActivities = await executeOperation(db => db.getActivities(countOptions), []);
      setTotalActivities(allActivities.length);
    },
    [executeOperation]
  );

  const fetchSubscriptions = useCallback(async () => {
    const fetchedSubscriptions = await executeOperation(db => db.getSubscriptions(), []);
    setSubscriptions(fetchedSubscriptions);
    setActiveSubscriptions(fetchedSubscriptions.filter((s: any) => s.status === 'active'));
  }, [executeOperation]);

  // Use ref to track current offset to avoid dependency issues
  const currentOffsetRef = useRef(0);
  const isInitialMountRef = useRef(true);
  const activeFiltersRef = useRef(activeFilters);
  const previousFiltersRef = useRef<string>('');

  // Helper to serialize Set for comparison
  const serializeFilters = useCallback((filters: Set<ActivityFilterType>): string => {
    return Array.from(filters).sort().join(',');
  }, []);

  // Update refs when state changes
  useEffect(() => {
    currentOffsetRef.current = currentOffset;
  }, [currentOffset]);

  useEffect(() => {
    activeFiltersRef.current = activeFilters;
  }, [activeFilters]);

  // Initial data fetch - only on mount
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      previousFiltersRef.current = serializeFilters(activeFilters);
      // Use refs to avoid dependency on functions
      const fetchInitial = async () => {
        const offset = 0;
        const _filters = activeFiltersRef.current;

        // Build filter options (no filters on initial load)
        const filterOptions = { limit: ACTIVITIES_PER_PAGE, offset: offset };

        const [fetchedActivities, fetchedSubscriptions] = await Promise.all([
          executeOperation(db => db.getActivities(filterOptions), []),
          executeOperation(db => db.getSubscriptions(), []),
        ]);

        setActivities(fetchedActivities);
        setSubscriptions(fetchedSubscriptions);
        setActiveSubscriptions(fetchedSubscriptions.filter((s: any) => s.status === 'active'));
        setCurrentOffset(ACTIVITIES_PER_PAGE);
        currentOffsetRef.current = ACTIVITIES_PER_PAGE;
        setHasMoreActivities(fetchedActivities.length === ACTIVITIES_PER_PAGE);

        const allActivities = await executeOperation(db => db.getActivities({}), []);
        setTotalActivities(allActivities.length);
      };

      fetchInitial().catch(_error => {});
    }
  }, [activeFilters, executeOperation, serializeFilters]); // Only run on mount

  // Reset and reload when filter changes
  useEffect(() => {
    // Skip on initial mount (handled by initial data fetch)
    if (isInitialMountRef.current) {
      return;
    }

    // Compare serialized filters to detect actual changes
    const currentFiltersSerialized = serializeFilters(activeFilters);
    if (currentFiltersSerialized === previousFiltersRef.current) {
      return; // No actual change, skip
    }
    previousFiltersRef.current = currentFiltersSerialized;

    setCurrentOffset(0);
    currentOffsetRef.current = 0;
    setHasMoreActivities(true);
    // Don't clear activities immediately - let loading state handle it
    setIsLoadingMore(true);

    // Use the ref to get current filters to avoid dependency on fetchActivities
    const filters = activeFiltersRef.current;
    const offset = 0;

    // Build filter options based on active filters
    const types: ActivityType[] = [];
    let includeSubscriptions = false;
    let excludeSubscriptions = false;
    const hasPayments = filters.has('payments');
    const hasSubscriptions = filters.has('subscriptions');

    if (filters.has('logins')) {
      types.push(ActivityType.Auth);
    }
    if (hasPayments) {
      types.push(ActivityType.Pay);
      types.push(ActivityType.Receive);
      if (!hasSubscriptions) {
        excludeSubscriptions = true;
      }
    }
    if (hasSubscriptions) {
      includeSubscriptions = true;
      if (hasPayments) {
        excludeSubscriptions = true;
      }
    }
    if (filters.has('tickets')) {
      types.push(ActivityType.Ticket);
      types.push(ActivityType.TicketApproved);
      types.push(ActivityType.TicketDenied);
      types.push(ActivityType.TicketReceived);
    }

    const filterOptions =
      filters.size === 0
        ? { limit: ACTIVITIES_PER_PAGE, offset: offset }
        : {
          limit: ACTIVITIES_PER_PAGE,
          offset: offset,
          types: types.length > 0 ? types : undefined,
          includeSubscriptions: includeSubscriptions || undefined,
          excludeSubscriptions: excludeSubscriptions || undefined,
        };

    executeOperation(db => db.getActivities(filterOptions), [])
      .then(fetchedActivities => {
        setActivities(fetchedActivities);
        setCurrentOffset(ACTIVITIES_PER_PAGE);
        currentOffsetRef.current = ACTIVITIES_PER_PAGE;
        setHasMoreActivities(fetchedActivities.length === ACTIVITIES_PER_PAGE);

        const countOptions =
          filters.size === 0
            ? {}
            : {
              types: types.length > 0 ? types : undefined,
              includeSubscriptions: includeSubscriptions || undefined,
              excludeSubscriptions: excludeSubscriptions || undefined,
            };
        return executeOperation(db => db.getActivities(countOptions), []);
      })
      .then(allActivities => {
        setTotalActivities(allActivities.length);
      })
      .catch(_error => {})
      .finally(() => {
        setIsLoadingMore(false);
      });
  }, [activeFilters, executeOperation, serializeFilters]);

  const loadMoreActivities = useCallback(async () => {
    if (!hasMoreActivities || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);

    try {
      await fetchActivities(false); // false = don't reset, append to existing
    } catch (_error) {
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
    } catch (_error) {}
  }, [fetchActivities, fetchSubscriptions]);

  // Listen for activity events to refresh activities list
  useEffect(() => {
    const handleActivityAdded = (_activity: ActivityWithDates) => {
      refreshData();
    };

    const handleActivityUpdated = () => {
      refreshData();
    };

    globalEvents.on('activityAdded', handleActivityAdded);
    globalEvents.on('activityUpdated', handleActivityUpdated);

    return () => {
      globalEvents.off('activityAdded', handleActivityAdded);
      globalEvents.off('activityUpdated', handleActivityUpdated);
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

  // Toggle a filter on/off
  const toggleFilter = useCallback((filter: ActivityFilterType) => {
    setActiveFilters(prev => {
      const newFilters = new Set(prev);
      if (newFilters.has(filter)) {
        newFilters.delete(filter);
      } else {
        newFilters.add(filter);
      }
      return newFilters;
    });
  }, []);

  // Reset all filters
  const resetFilters = useCallback(() => {
    setActiveFilters(new Set());
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
      activeFilters,
      toggleFilter,
      resetFilters,
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
      activeFilters,
      toggleFilter,
      resetFilters,
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
