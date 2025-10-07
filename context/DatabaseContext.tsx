import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { DatabaseService } from '../services/DatabaseService';
import { AppResetService } from '../services/AppResetService';
import { useMnemonic } from './MnemonicContext';
import { Mnemonic } from 'portal-app-lib';
import defaultRelayList from '../assets/DefaultRelays.json';
import NostrStoreService from '@/services/NostrStoreService';
import * as SQLite from 'expo-sqlite';

// Create a context to expose database initialization state
interface DatabaseContextType {
  executeOperation: <T>(operation: (db: DatabaseService) => Promise<T>, fallback?: T) => Promise<T>;
  executeOnNostr: <T>(operation: (db: NostrStoreService) => Promise<T>, fallback?: T) => Promise<T>;
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
  const { mnemonic } = useMnemonic();

  const executeOperation = async <T,>(
    operation: (db: DatabaseService) => Promise<T>,
    fallback?: T
  ): Promise<T> => {
    try {
      const sqlite = await SQLite.openDatabaseAsync('portal-app.db');
      const db = new DatabaseService(sqlite);
      return await operation(db);
    } catch (error: any) {
      // Handle "Access to closed resource" errors gracefully
      if (
        error?.message?.includes('closed resource') ||
        error?.message?.includes('Access to closed resource')
      ) {
        console.warn("🖐️🖐️🖐️🖐️🖐️🖐️🖐️", error)
        console.warn('Database operation failed - resource closed, using fallback');
        if (fallback !== undefined) return fallback;
        throw new Error('Database resource closed');
      }

      console.error('Database operation failed:', error?.message || error);
      if (fallback !== undefined) return fallback;
      throw error;
    }
  };

  const executeOnNostr = async <T,>(
    operation: (nostrStore: NostrStoreService) => Promise<T>,
    fallback?: T
  ): Promise<T> => {

    try {
      if (!mnemonic) {
        if (fallback !== undefined) {
          return fallback;
        }
        throw new Error('Mnemonic is null or undefined');
      }

      const mnemonicObj = new Mnemonic(mnemonic);
      const keypair = mnemonicObj.getKeypair();

      let relays: string[] = [];
      try {
        // Try to get relays from database first
        const dbRelays = (await executeOperation(db => db.getRelays(), [])).map(
          relay => relay.ws_uri
        );
        if (dbRelays.length > 0) {
          relays = dbRelays;
        } else {
          // If no relays in database, use defaults and update database
          relays = [...defaultRelayList];
          await executeOperation(db => db.updateRelays(defaultRelayList), null);
        }
      } catch (error) {
        console.warn('Failed to get relays from database, using defaults:', error);
        // Fallback to default relays if database access fails
        relays = [...defaultRelayList];
        await executeOperation(db => db.updateRelays(defaultRelayList), null);
      }

      const nostrStore = await NostrStoreService.create(keypair, relays);
      return await operation(nostrStore);
    } catch (e) {
      console.error('NostrStore operation failed:', e);
      if (fallback !== undefined) return fallback;
      throw e;
    }
  }

  const resetApp = async () => {
    const sqlite = await SQLite.openDatabaseAsync('portal-app.db');
    return AppResetService.performCompleteReset(sqlite);
  };

  // Create the context value
  const contextValue: DatabaseContextType = {
    executeOperation,
    executeOnNostr,
    resetApp,
    isDbReady: true,
  };

  return <DatabaseContext.Provider value={contextValue}>{children}</DatabaseContext.Provider>;
};
