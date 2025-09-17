import { type ReactNode, createContext, useContext } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { DatabaseService } from '../services/DatabaseService';
import { AppResetService } from '../services/AppResetService';

// Create a context to expose database initialization state
interface DatabaseContextType {
  executeOperation: <T>(operation: (db: DatabaseService) => Promise<T>, fallback?: T) => Promise<T>;
  resetApp: () => Promise<void>;
  isDbReady: boolean;
}

const DatabaseContext = createContext<DatabaseContextType | null>(null);

// Hook to consume the database context
export const useDatabaseContext = () => {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabaseStatus must be used within a DatabaseProvider');
  }
  return context;
};

interface DatabaseProviderProps {
  children: ReactNode;
}

export const DatabaseProvider = ({ children }: DatabaseProviderProps) => {
  const sqliteContext = useSQLiteContext();

  // Check if database context exists (simpler check)
  const isDbReady = !!sqliteContext;

  const executeOperation = async <T,>(
    operation: (db: DatabaseService) => Promise<T>,
    fallback?: T
  ): Promise<T> => {
    try {
      // Check if SQLite context exists
      if (!isDbReady) {
        console.warn('Database not ready, using fallback');
        if (fallback !== undefined) return fallback;
        throw new Error('Database not ready');
      }

      const db = new DatabaseService(sqliteContext);
      return await operation(db);
    } catch (error: any) {
      // Handle "Access to closed resource" errors gracefully
      if (
        error?.message?.includes('closed resource') ||
        error?.message?.includes('Access to closed resource')
      ) {
        console.warn('Database operation failed - resource closed, using fallback');
        if (fallback !== undefined) return fallback;
        throw new Error('Database resource closed');
      }

      console.error('Database operation failed:', error?.message || error);
      if (fallback !== undefined) return fallback;
      throw error;
    }
  };

  const resetApp = () => {
    return AppResetService.performCompleteReset(sqliteContext);
  };

  // Create the context value
  const contextValue: DatabaseContextType = {
    executeOperation,
    resetApp,
    isDbReady,
  };

  return <DatabaseContext.Provider value={contextValue}>{children}</DatabaseContext.Provider>;
};
