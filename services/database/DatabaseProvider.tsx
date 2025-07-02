import { useState, useCallback, type ReactNode, Fragment, createContext, useContext } from 'react';
import { SQLiteProvider, type SQLiteDatabase, openDatabaseAsync } from 'expo-sqlite';

// Database name constant to ensure consistency
export const DATABASE_NAME = 'portal-app.db';

// Create a context to expose database initialization state
interface DatabaseContextType {
  isDbInitializing: boolean;
  isDbInitialized: boolean;
  shouldInitDb: boolean;
}

const DatabaseContext = createContext<DatabaseContextType>({
  isDbInitializing: false,
  isDbInitialized: false,
  shouldInitDb: true,
});

// Hook to consume the database context
export const useDatabaseStatus = () => useContext(DatabaseContext);

// Utility function to reset database tables
export const resetDatabase = async (): Promise<void> => {
  try {
    console.log('Attempting to reset database tables');
    const db = await openDatabaseAsync(DATABASE_NAME);

    // Execute direct SQL to drop tables
    await db.execAsync(`
      		DROP TABLE IF EXISTS activities;
      		DROP TABLE IF EXISTS subscriptions;
      		DROP TABLE IF EXISTS name_cache;
      		DROP INDEX IF EXISTS idx_activities_date;
      		DROP INDEX IF EXISTS idx_activities_type;
      		DROP INDEX IF EXISTS idx_activities_subscription;
      		DROP INDEX IF EXISTS idx_subscriptions_next_payment;
      		DROP INDEX IF EXISTS idx_name_cache_expires;
      		DROP TABLE IF EXISTS subscriptions;
      		PRAGMA user_version = 0;
    	`);

    console.log('Database reset completed successfully');
    await db.closeAsync();
  } catch (error) {
    console.error('Failed to reset database:', error);
  }
};

interface DatabaseProviderProps {
  children: ReactNode;
}

export const DatabaseProvider = ({ children }: DatabaseProviderProps) => {
  const [dbInitialized, setDbInitialized] = useState(false);
  const [isDbInitializing, setIsDbInitializing] = useState(false);

  // Function to migrate database schema if needed
  const migrateDbIfNeeded = useCallback(async (db: SQLiteDatabase) => {
    console.log('Database initialization started');
    setIsDbInitializing(true);
    const DATABASE_VERSION = 6;

    try {
      let { user_version: currentDbVersion } = (await db.getFirstAsync<{
        user_version: number;
      }>('PRAGMA user_version')) ?? { user_version: 0 };

      if (currentDbVersion >= DATABASE_VERSION) {
        console.log(`Database already at version ${currentDbVersion}`);
        setDbInitialized(true);
        setIsDbInitializing(false);
        return;
      }

      console.log(`Migrating database from version ${currentDbVersion} to ${DATABASE_VERSION}`);

      if (currentDbVersion <= 0) {
        await db.execAsync(`
          			PRAGMA journal_mode = 'wal';
        		`);
        currentDbVersion = 1;
        console.log('Set journal mode to WAL - now at version 1');
      }

      if (currentDbVersion <= 1) {
        await db.execAsync(`
          			CREATE TABLE IF NOT EXISTS activities (
            			id TEXT PRIMARY KEY NOT NULL,
            			type TEXT NOT NULL CHECK (type IN ('auth', 'pay')), -- Maps to ActivityType enum
            			service_name TEXT NOT NULL,
            			service_key TEXT NOT NULL,
            			detail TEXT NOT NULL,
            			date INTEGER NOT NULL, -- Unix timestamp
            			amount INTEGER, -- NULL for Auth type
            			currency TEXT, -- NULL for Auth type
            			request_id TEXT NOT NULL, -- Reference to the original request if applicable
            			created_at INTEGER NOT NULL -- Unix timestamp
          			);

          			-- Create subscriptions table for recurring payments
          			CREATE TABLE IF NOT EXISTS subscriptions (
            			id TEXT PRIMARY KEY NOT NULL,
            			request_id TEXT NOT NULL, -- Reference to the original subscription request
            			service_name TEXT NOT NULL,
            			service_key TEXT NOT NULL,
            			amount INTEGER NOT NULL,
            			currency TEXT NOT NULL,
            			recurrence_calendar TEXT NOT NULL,
            			recurrence_max_payments INTEGER,
            			recurrence_until INTEGER,
            			recurrence_first_payment_due INTEGER NOT NULL,
            			status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'expired')),
            			last_payment_date INTEGER, -- Unix timestamp of last successful payment
            			next_payment_date INTEGER, -- Unix timestamp of next scheduled payment
            			created_at INTEGER NOT NULL -- Unix timestamp
          			);

          			-- Create indexes for better query performance
          			CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date);
          			CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);
          			CREATE INDEX IF NOT EXISTS idx_subscriptions_next_payment ON subscriptions(next_payment_date);
        		`);
        currentDbVersion = 2;
        console.log('Created tables - now at version 2');
      }

      if (currentDbVersion <= 2) {
        await db.execAsync(`
          			-- Add subscription_id column to activities
          			ALTER TABLE activities ADD COLUMN subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL;

          			-- Create index for subscription_id
          			CREATE INDEX IF NOT EXISTS idx_activities_subscription ON activities(subscription_id);
        		`);
        currentDbVersion = 3;
        console.log('Added subscription_id to activities - now at version 3');
      }

      if (currentDbVersion <= 3) {
        await db.execAsync(`
         			-- Create name_cache table for storing resolved service names
          			CREATE TABLE IF NOT EXISTS name_cache (
            			service_pubkey TEXT PRIMARY KEY NOT NULL,
            			service_name TEXT NOT NULL,
            			expires_at INTEGER NOT NULL, -- Unix timestamp for expiration
            			created_at INTEGER NOT NULL -- Unix timestamp
          			);

          			-- Create index for faster lookups
          			CREATE INDEX IF NOT EXISTS idx_name_cache_expires ON name_cache(expires_at);
        		`);
        currentDbVersion = 4;
        console.log('Added name_cache table - now at version 4');
      }

      if (currentDbVersion <= 4) {
        await db.execAsync(`
          			CREATE TABLE IF NOT EXISTS nostr_relays (
            			ws_uri TEXT NOT NULL UNIQUE,
            			created_at INTEGER NOT NULL -- Unix timestamp
					)
        		`);
        currentDbVersion = 5;
      }

      if (currentDbVersion <= 5) {
        await db.execAsync(`
          			CREATE TABLE IF NOT EXISTS stored_pending_requests (
            			id TEXT NOT NULL UNIQUE,
                  event_id TEXT NOT NULL,
                  approved INTEGER NOT NULL, 
            			created_at INTEGER NOT NULL -- Unix timestamp
                );
        		`);
        currentDbVersion = 6;
      }

      await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
      console.log(`Database migration completed to version ${DATABASE_VERSION}`);
      setDbInitialized(true);
    } catch (error) {
      console.error('Database migration failed:', error);
      setDbInitialized(false);
    } finally {
      setIsDbInitializing(false);
    }
  }, []);

  // Create the context value
  const contextValue = {
    isDbInitializing,
    isDbInitialized: dbInitialized,
    shouldInitDb: true,
  };

  return (
    <DatabaseContext.Provider value={contextValue}>
      <Fragment>
        <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
          {children}
        </SQLiteProvider>
      </Fragment>
    </DatabaseContext.Provider>
  );
};
