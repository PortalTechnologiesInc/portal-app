import React, { createContext, useContext, ReactNode } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { DatabaseService, useDatabaseStatus } from '@/services/database';

interface SimpleDatabaseContextType {
  executeOperation: <T>(operation: (db: DatabaseService) => Promise<T>, fallback?: T) => Promise<T>;
}

const DatabaseOperationsContext = createContext<SimpleDatabaseContextType | undefined>(undefined);

export const DatabaseContextProvider = ({ children }: { children: ReactNode }) => {
  const sqliteContext = useSQLiteContext();
  const dbStatus = useDatabaseStatus();

  const executeOperation = async <T,>(
    operation: (db: DatabaseService) => Promise<T>,
    fallback?: T
  ): Promise<T> => {
    // Handle readiness internally - no external checks needed
    if (!dbStatus.isDbInitialized || !sqliteContext) {
      console.log('Database not ready, returning fallback value');
      if (fallback !== undefined) return fallback;
      throw new Error('Database not ready and no fallback provided');
    }

    try {
      const db = new DatabaseService(sqliteContext);
      return await operation(db);
    } catch (error: any) {
      console.error('Database operation failed:', error?.message || error);
      if (fallback !== undefined) return fallback;
      throw error;
    }
  };

  return (
    <DatabaseOperationsContext.Provider value={{ executeOperation }}>
      {children}
    </DatabaseOperationsContext.Provider>
  );
};

export const useDatabase = () => {
  const context = useContext(DatabaseOperationsContext);
  if (context === undefined) {
    throw new Error('useDatabase must be used within a DatabaseContextProvider');
  }
  return context;
};
