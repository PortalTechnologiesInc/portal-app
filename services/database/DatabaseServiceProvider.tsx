import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { DatabaseService } from './index';
import { useDatabaseStatus } from './DatabaseProvider';

interface DatabaseServiceContextType {
  databaseService: DatabaseService | null;
  isDatabaseReady: boolean;
}

const DatabaseServiceContext = createContext<DatabaseServiceContextType | undefined>(undefined);

export const DatabaseServiceProvider = ({ children }: { children: ReactNode }) => {
  const [databaseService, setDatabaseService] = useState<DatabaseService | null>(null);
  const sqliteContext = useSQLiteContext();
  const dbStatus = useDatabaseStatus();
  const appStateRef = useRef<string>(AppState.currentState);

  // Function to create/recreate database service
  const createDatabaseService = () => {
    if (dbStatus.isDbInitialized && sqliteContext) {
      console.log('Creating/recreating centralized DatabaseService instance');
      const service = new DatabaseService(sqliteContext);
      setDatabaseService(service);
      return service;
    }
    return null;
  };

  // Handle database initialization
  useEffect(() => {
    if (dbStatus.isDbInitialized && sqliteContext && !databaseService) {
      createDatabaseService();
    } else if (!dbStatus.isDbInitialized && databaseService) {
      console.log('Database uninitialized, clearing DatabaseService instance');
      setDatabaseService(null);
    }
  }, [dbStatus.isDbInitialized, sqliteContext, databaseService]);

  // Handle app state changes to recover from closed connections
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextAppState;

      // When app comes back to foreground from background, recreate database service
      // to ensure fresh connection after potential system database closure
      if (previousState === 'background' && nextAppState === 'active') {
        console.log(
          'App returned to foreground - refreshing database service to avoid stale connections'
        );
        if (dbStatus.isDbInitialized && sqliteContext) {
          // Small delay to let system stabilize
          setTimeout(() => {
            createDatabaseService();
          }, 100);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [dbStatus.isDbInitialized, sqliteContext]);

  return (
    <DatabaseServiceContext.Provider
      value={{
        databaseService,
        isDatabaseReady: dbStatus.isDbInitialized && databaseService !== null,
      }}
    >
      {children}
    </DatabaseServiceContext.Provider>
  );
};

export const useDatabaseService = () => {
  const context = useContext(DatabaseServiceContext);
  if (context === undefined) {
    throw new Error('useDatabaseService must be used within a DatabaseServiceProvider');
  }
  return context;
};

/**
 * Hook that returns a DatabaseService instance only when the database is ready
 * Returns null if database is not ready, preventing "closed resource" errors
 */
export const useSafeDatabaseService = (): DatabaseService | null => {
  const { databaseService, isDatabaseReady } = useDatabaseService();
  return isDatabaseReady ? databaseService : null;
};

// Enhanced version that can recover from closed database connections
export const useRobustDatabaseService = () => {
  const context = useContext(DatabaseServiceContext);
  if (context === undefined) {
    throw new Error('useRobustDatabaseService must be used within a DatabaseServiceProvider');
  }

  const { databaseService, isDatabaseReady } = context;
  const sqliteContext = useSQLiteContext();
  const dbStatus = useDatabaseStatus();

  // Function to execute database operations with automatic retry on connection errors
  const executeWithRetry = async function <T>(
    operation: (db: DatabaseService) => Promise<T>,
    operationName?: string
  ): Promise<T | null> {
    const opName = operationName || 'database operation';
    if (!isDatabaseReady || !databaseService) {
      console.warn(`${opName}: Database service not ready`);
      return null;
    }

    try {
      return await operation(databaseService);
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || '';

      // Check if it's a "closed resource" error
      if (
        errorMessage.includes('Access to closed resource') ||
        (errorMessage.includes('Call to function') && errorMessage.includes('has been rejected'))
      ) {
        console.warn(`${opName}: Detected closed database connection, attempting recovery...`);

        // Try to create a fresh database service
        if (dbStatus.isDbInitialized && sqliteContext) {
          try {
            const freshService = new DatabaseService(sqliteContext);
            console.log(`${opName}: Created fresh database service, retrying operation`);
            return await operation(freshService);
          } catch (retryError: any) {
            console.error(
              `${opName}: Retry with fresh connection also failed:`,
              retryError?.message || retryError
            );
            return null;
          }
        } else {
          console.error(`${opName}: Cannot create fresh connection - database not ready`);
          return null;
        }
      } else {
        // Different type of error - rethrow or return null based on use case
        console.error(`${opName}: Non-connection error:`, errorMessage);
        return null;
      }
    }
  };

  return {
    databaseService: isDatabaseReady ? databaseService : null,
    isDatabaseReady,
    executeWithRetry,
  };
};
