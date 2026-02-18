import { useSQLiteContext } from 'expo-sqlite';
import { createContext, type ReactNode, useContext, useEffect, useRef } from 'react';
import { ProviderRepository } from '@/queue/WorkQueue';
import NostrStoreService from '@/services/NostrStoreService';
import { getKeypairFromKey, hasKey } from '@/utils/keyHelpers';
import defaultRelayList from '../assets/DefaultRelays.json';
import { AppResetService } from '../services/AppResetService';
import { DatabaseService } from '../services/DatabaseService';
import { useKey } from './KeyContext';

// Create a context to expose database initialization state
interface DatabaseContextType {
  executeOperation: <T>(operation: (db: DatabaseService) => Promise<T>, fallback?: T) => Promise<T>;
  executeOnNostr: <T>(operation: (db: NostrStoreService) => Promise<T>, fallback?: T) => Promise<T>;
  resetApp: () => Promise<void>;
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
  const { mnemonic, nsec } = useKey();
  const nostrStoreInitialized = useRef(false);

  // Register NostrStoreService in ProviderRepository when keys become available
  // This ensures it's available for tasks even if onboarding completes without app restart
  useEffect(() => {
    if (!hasKey({ mnemonic, nsec })) {
      return;
    }

    // Prevent re-initialization if already initialized (optimistic lock)
    if (nostrStoreInitialized.current) {
      return;
    }

    // Set flag before async call to prevent race condition if effect fires twice rapidly
    nostrStoreInitialized.current = true;

    const initializeNostrStore = async () => {
      try {
        const keypair = getKeypairFromKey({ mnemonic, nsec });

        // Get relays from database or use defaults
        const db = new DatabaseService(sqliteContext);
        let relays: string[] = [];
        try {
          const dbRelays = (await db.getRelays()).map(relay => relay.ws_uri);
          if (dbRelays.length > 0) {
            relays = dbRelays;
          } else {
            relays = [...defaultRelayList];
            await db.updateRelays(defaultRelayList);
          }
        } catch (_error) {
          relays = [...defaultRelayList];
          await db.updateRelays(defaultRelayList);
        }

        const nostrStore = await NostrStoreService.create(keypair, relays);
        ProviderRepository.register(nostrStore, 'NostrStoreService');
      } catch (error) {
        console.error('Failed to initialize NostrStoreService:', error);
        // Reset flag on error so retry is possible
        nostrStoreInitialized.current = false;
      }
    };

    initializeNostrStore();
  }, [mnemonic, nsec, sqliteContext]);

  const executeOperation = async <T,>(
    operation: (db: DatabaseService) => Promise<T>,
    fallback?: T
  ): Promise<T> => {
    try {
      const db = new DatabaseService(sqliteContext);
      return await operation(db);
    } catch (error: any) {
      if (fallback !== undefined) return fallback;
      throw error;
    }
  };

  const executeOnNostr = async <T,>(
    operation: (nostrStore: NostrStoreService) => Promise<T>,
    fallback?: T
  ): Promise<T> => {
    // If no key material is available, return fallback gracefully (e.g., during onboarding)
    if (!hasKey({ mnemonic, nsec })) {
      if (fallback !== undefined) {
        return fallback;
      }
      throw new Error('Cannot execute Nostr operation: key material not available');
    }

    try {
      const keypair = getKeypairFromKey({ mnemonic, nsec });

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
      } catch (_error) {
        // Fallback to default relays if database access fails
        relays = [...defaultRelayList];
        await executeOperation(db => db.updateRelays(defaultRelayList), null);
      }

      const nostrStore = await NostrStoreService.create(keypair, relays);
      return await operation(nostrStore);
    } catch (e) {
      if (fallback !== undefined) return fallback;
      throw e;
    }
  };

  const resetApp = () => {
    return AppResetService.performCompleteReset(sqliteContext);
  };

  // Create the context value
  const contextValue: DatabaseContextType = {
    executeOperation,
    executeOnNostr,
    resetApp,
  };

  return <DatabaseContext.Provider value={contextValue}>{children}</DatabaseContext.Provider>;
};
