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
import { useSQLiteContext } from 'expo-sqlite';
import {
  DatabaseService,
  type ActivityWithDates,
  type SubscriptionWithDates,
} from '@/services/database';
import { useDatabaseStatus } from '@/services/database/DatabaseProvider';

interface ActivitiesContextType {
  activities: ActivityWithDates[];
  subscriptions: SubscriptionWithDates[];
  activeSubscriptions: SubscriptionWithDates[];
  fetchActivities: (reset?: boolean) => Promise<void>;
  fetchSubscriptions: () => Promise<void>;
  refreshData: () => void;
  addActivity: (activity: Omit<ActivityWithDates, 'id' | 'created_at'>) => Promise<string | null>;
  isDbReady: boolean;
  // Pagination support
  loadMoreActivities: () => Promise<void>;
  hasMoreActivities: boolean;
  isLoadingMore: boolean;
  totalActivities: number;
  resetToFirstPage: () => Promise<void>;
  // Optimized method for recent activities
  getRecentActivities: () => Promise<ActivityWithDates[]>;
}

const ActivitiesContext = createContext<ActivitiesContextType | undefined>(undefined);

export const ActivitiesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activities, setActivities] = useState<ActivityWithDates[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionWithDates[]>([]);
  const [activeSubscriptions, setActiveSubscriptions] = useState<SubscriptionWithDates[]>([]);
  const [isDbReady, setIsDbReady] = useState(false);
  const [db, setDb] = useState<DatabaseService | null>(null);
  
  // Pagination state
  const [hasMoreActivities, setHasMoreActivities] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [totalActivities, setTotalActivities] = useState(0);
  
  const ACTIVITIES_PER_PAGE = 20;

  // Get database initialization status
  const dbStatus = useDatabaseStatus();

  // Only try to access SQLite context if the database is initialized
  let sqliteContext = null;
  try {
    // This will throw an error if SQLiteProvider is not available
    if (dbStatus.isDbInitialized && dbStatus.shouldInitDb) {
      sqliteContext = useSQLiteContext();
    }
  } catch (error) {
    // SQLiteContext is not available, which is expected sometimes
    console.log('SQLite context not available yet, activity tracking will be delayed');
  }

  // Initialize DB safely when the SQLite context becomes available
  useEffect(() => {
    let isMounted = true;

    const initDb = async () => {
      // Skip if database is not ready or SQLite context is not available
      if (!dbStatus.isDbInitialized || !sqliteContext) {
        if (isMounted) {
          setDb(null);
          setIsDbReady(false);
          if (!dbStatus.isDbInitialized) {
            console.log('Database not yet initialized, skipping SQLite context access');
          }
        }
        return;
      }

      try {
        if (isMounted && sqliteContext) {
          console.log('SQLite context obtained, initializing database service');
          const newDb = new DatabaseService(sqliteContext);
          setDb(newDb);
          setIsDbReady(true);
          console.log('Database service successfully initialized');
        }
      } catch (error) {
        if (isMounted) {
          setDb(null);
          setIsDbReady(false);
          console.error('Error initializing database service:', error);
        }
      }
    };

    initDb();

    return () => {
      isMounted = false;
    };
  }, [dbStatus.isDbInitialized, sqliteContext]);

  const fetchActivities = useCallback(async (reset = false) => {
    if (!db || !isDbReady) return;

    try {
      const offset = reset ? 0 : currentOffsetRef.current;
      const fetchedActivities = await db.getActivities({
        limit: ACTIVITIES_PER_PAGE,
        offset: offset,
      });
      
      if (reset) {
        setActivities(fetchedActivities);
        setCurrentOffset(ACTIVITIES_PER_PAGE);
        currentOffsetRef.current = ACTIVITIES_PER_PAGE;
      } else {
        // Deduplicate activities based on ID to prevent duplicate keys
        setActivities(prev => {
          const existingIds = new Set(prev.map(activity => activity.id));
          const newActivities = fetchedActivities.filter(activity => !existingIds.has(activity.id));
          return [...prev, ...newActivities];
        });
        setCurrentOffset(prev => prev + ACTIVITIES_PER_PAGE);
      }
      
      // Update hasMore based on whether we got a full page
      setHasMoreActivities(fetchedActivities.length === ACTIVITIES_PER_PAGE);
      
      // Get total count for reference (optional)
      const allActivities = await db.getActivities();
      setTotalActivities(allActivities.length);
    } catch (error) {
      console.error('Failed to fetch activities:', error);
      // If database is closed, reset the database state
      if (
        error instanceof Error &&
        (error.message.includes('closed resource') || error.message.includes('has been rejected'))
      ) {
        setIsDbReady(false);
        setDb(null);
      }
    }
  }, [db, isDbReady, ACTIVITIES_PER_PAGE]);

  const fetchSubscriptions = useCallback(async () => {
    if (!db || !isDbReady) return;

    try {
      const fetchedSubscriptions = await db.getSubscriptions();
      setSubscriptions(fetchedSubscriptions);
      setActiveSubscriptions(fetchedSubscriptions.filter(s => s.status === 'active'));
    } catch (error) {
      console.error('Failed to fetch subscriptions:', error);
      // If database is closed, reset the database state
      if (
        error instanceof Error &&
        (error.message.includes('closed resource') || error.message.includes('has been rejected'))
      ) {
        setIsDbReady(false);
        setDb(null);
      }
    }
  }, [db, isDbReady]);

  // Use ref to track if initial fetch has been done to prevent re-fetching
  const hasInitialFetchRef = useRef(false);
  // Use ref to track current offset to avoid dependency issues
  const currentOffsetRef = useRef(0);

  // Update ref when offset state changes
  useEffect(() => {
    currentOffsetRef.current = currentOffset;
  }, [currentOffset]);

  // Initial fetch - only run once when db becomes ready
  useEffect(() => {
    if (db && isDbReady && !hasInitialFetchRef.current) {
      hasInitialFetchRef.current = true;
      fetchActivities(true); // Reset pagination on initial load
      fetchSubscriptions();
    }
  }, [db, isDbReady]); // Remove fetchActivities and fetchSubscriptions from dependencies

  // Create a refresh function that can be called from outside components
  const refreshData = useCallback(() => {
    if (db && isDbReady) {
      setCurrentOffset(0);
      currentOffsetRef.current = 0;
      setHasMoreActivities(true);
      hasInitialFetchRef.current = false; // Allow fresh fetch
      fetchActivities(true); // Reset pagination on refresh
      fetchSubscriptions();
    }
  }, [db, isDbReady, fetchActivities, fetchSubscriptions]);

  // Add refresh function to the context value below

  const addActivity = useCallback(
    async (activity: Omit<ActivityWithDates, 'id' | 'created_at'>) => {
      if (!db || !isDbReady) return null;

      try {
        const id = await db.addActivity(activity);
        // Reset pagination and refresh activities list
        setCurrentOffset(0);
        currentOffsetRef.current = 0;
        setHasMoreActivities(true);
        await fetchActivities(true);
        return id;
      } catch (error) {
        console.error('Failed to add activity:', error);
        // If database is closed, reset the database state
        if (
          error instanceof Error &&
          (error.message.includes('closed resource') || error.message.includes('has been rejected'))
        ) {
          setIsDbReady(false);
          setDb(null);
        }
        return null;
      }
    },
    [db, fetchActivities, isDbReady]
  );

  const loadMoreActivities = useCallback(async () => {
    if (!db || !isDbReady || isLoadingMore || !hasMoreActivities) return;

    setIsLoadingMore(true);
    try {
      const fetchedActivities = await db.getActivities({
        limit: ACTIVITIES_PER_PAGE,
        offset: currentOffsetRef.current,
      });
      
      // Deduplicate activities based on ID to prevent duplicate keys
      setActivities(prev => {
        const existingIds = new Set(prev.map(activity => activity.id));
        const newActivities = fetchedActivities.filter(activity => !existingIds.has(activity.id));
        return [...prev, ...newActivities];
      });
      setCurrentOffset(prev => prev + ACTIVITIES_PER_PAGE);
      
      // Update hasMore based on whether we got a full page
      setHasMoreActivities(fetchedActivities.length === ACTIVITIES_PER_PAGE);
    } catch (error) {
      console.error('Failed to load more activities:', error);
      // If database is closed, reset the database state
      if (
        error instanceof Error &&
        (error.message.includes('closed resource') || error.message.includes('has been rejected'))
      ) {
        setIsDbReady(false);
        setDb(null);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [db, isDbReady, isLoadingMore, hasMoreActivities, ACTIVITIES_PER_PAGE]);

  const resetToFirstPage = useCallback(async () => {
    if (!db || !isDbReady) return;

    try {
      const fetchedActivities = await db.getActivities({
        limit: ACTIVITIES_PER_PAGE,
        offset: 0,
      });
      
      setActivities(fetchedActivities);
      setCurrentOffset(ACTIVITIES_PER_PAGE);
      currentOffsetRef.current = ACTIVITIES_PER_PAGE;
      setHasMoreActivities(fetchedActivities.length === ACTIVITIES_PER_PAGE);
    } catch (error) {
      console.error('Failed to reset to first page:', error);
      // If database is closed, reset the database state
      if (
        error instanceof Error &&
        (error.message.includes('closed resource') || error.message.includes('has been rejected'))
      ) {
        setIsDbReady(false);
        setDb(null);
      }
    }
  }, [db, isDbReady, ACTIVITIES_PER_PAGE]);

  const getRecentActivities = useCallback(async () => {
    if (!db || !isDbReady) return [];

    try {
      const fetchedActivities = await db.getRecentActivities();
      return fetchedActivities;
    } catch (error) {
      console.error('Failed to get recent activities:', error);
      // If database is closed, reset the database state
      if (
        error instanceof Error &&
        (error.message.includes('closed resource') || error.message.includes('has been rejected'))
      ) {
        setIsDbReady(false);
        setDb(null);
      }
      return [];
    }
  }, [db, isDbReady]);

  const contextValue = useMemo(
    () => ({
      activities,
      subscriptions,
      activeSubscriptions,
      fetchActivities,
      fetchSubscriptions,
      refreshData,
      addActivity,
      isDbReady,
      loadMoreActivities,
      hasMoreActivities,
      isLoadingMore,
      totalActivities,
      resetToFirstPage,
      getRecentActivities,
    }),
    [
      activities,
      subscriptions,
      activeSubscriptions,
      fetchActivities,
      fetchSubscriptions,
      refreshData,
      addActivity,
      isDbReady,
      loadMoreActivities,
      hasMoreActivities,
      isLoadingMore,
      totalActivities,
      resetToFirstPage,
      getRecentActivities,
    ]
  );

  return <ActivitiesContext.Provider value={contextValue}>{children}</ActivitiesContext.Provider>;
};

export const useActivities = () => {
  const context = useContext(ActivitiesContext);
  if (context === undefined) {
    throw new Error('useActivities must be used within an ActivitiesProvider');
  }
  return context;
};
