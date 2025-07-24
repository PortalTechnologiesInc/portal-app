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
    const DATABASE_VERSION = 11;

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

      if (currentDbVersion <= 6) {
        await db.execAsync(`
          -- CashuStorage tables for eCash wallet functionality
          
          -- Proofs table
          CREATE TABLE IF NOT EXISTS cashu_proofs (
            y BLOB PRIMARY KEY,
            mint_url TEXT NOT NULL,
            state TEXT CHECK (state IN ('SPENT', 'UNSPENT', 'PENDING', 'RESERVED', 'PENDINGSPENT')) NOT NULL,
            spending_condition TEXT,
            unit TEXT NOT NULL,
            amount INTEGER NOT NULL,
            keyset_id TEXT NOT NULL,
            secret TEXT NOT NULL,
            c BLOB NOT NULL,
            witness TEXT,
            dleq_e BLOB,
            dleq_s BLOB,
            dleq_r BLOB
          );
          
          CREATE INDEX IF NOT EXISTS cashu_proofs_state_index ON cashu_proofs(state);
          CREATE INDEX IF NOT EXISTS cashu_proofs_secret_index ON cashu_proofs(secret);
          CREATE INDEX IF NOT EXISTS cashu_proofs_spending_condition_index ON cashu_proofs(spending_condition);
          CREATE INDEX IF NOT EXISTS cashu_proofs_unit_index ON cashu_proofs(unit);
          CREATE INDEX IF NOT EXISTS cashu_proofs_amount_index ON cashu_proofs(amount);
          
          -- Blind signatures table
          CREATE TABLE IF NOT EXISTS cashu_blind_signatures (
            y BLOB PRIMARY KEY,
            amount INTEGER NOT NULL,
            keyset_id TEXT NOT NULL,
            c BLOB NOT NULL
          );
          
          CREATE INDEX IF NOT EXISTS cashu_blind_signatures_keyset_id_index ON cashu_blind_signatures(keyset_id);
          
          -- Transactions table
          CREATE TABLE IF NOT EXISTS cashu_transactions (
            id BLOB PRIMARY KEY,
            mint_url TEXT NOT NULL,
            direction TEXT CHECK (direction IN ('Incoming', 'Outgoing')) NOT NULL,
            amount INTEGER NOT NULL,
            fee INTEGER NOT NULL,
            unit TEXT NOT NULL,
            ys BLOB NOT NULL,
            timestamp INTEGER NOT NULL,
            memo TEXT,
            metadata TEXT
          );
          
          CREATE INDEX IF NOT EXISTS cashu_transactions_mint_url_index ON cashu_transactions(mint_url);
          CREATE INDEX IF NOT EXISTS cashu_transactions_direction_index ON cashu_transactions(direction);
          CREATE INDEX IF NOT EXISTS cashu_transactions_unit_index ON cashu_transactions(unit);
          CREATE INDEX IF NOT EXISTS cashu_transactions_timestamp_index ON cashu_transactions(timestamp);
          
          -- Keys table
          CREATE TABLE IF NOT EXISTS cashu_keys (
            id TEXT PRIMARY KEY,
            keys TEXT NOT NULL
          );
          
          -- Keyset counters table
          CREATE TABLE IF NOT EXISTS cashu_keyset_counters (
            keyset_id TEXT PRIMARY KEY,
            counter INTEGER NOT NULL DEFAULT 0
          );
          
          -- Mints table
          CREATE TABLE IF NOT EXISTS cashu_mints (
            mint_url TEXT PRIMARY KEY,
            mint_info TEXT
          );
          
          -- Mint keysets table
          CREATE TABLE IF NOT EXISTS cashu_mint_keysets (
            mint_url TEXT NOT NULL,
            keyset_id TEXT NOT NULL,
            keyset TEXT NOT NULL,
            PRIMARY KEY (mint_url, keyset_id),
            FOREIGN KEY (mint_url) REFERENCES cashu_mints(mint_url) ON DELETE CASCADE
          );
          
          CREATE INDEX IF NOT EXISTS cashu_mint_keysets_mint_url_index ON cashu_mint_keysets(mint_url);
          CREATE INDEX IF NOT EXISTS cashu_mint_keysets_keyset_id_index ON cashu_mint_keysets(keyset_id);
        `);
        currentDbVersion = 7;
      }

      if (currentDbVersion <= 7) {
        await db.execAsync(`
          -- Update activities table to allow 'ticket' type
          -- First, create a new table with the updated constraint
          CREATE TABLE activities_new (
            id TEXT PRIMARY KEY NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('auth', 'pay', 'ticket')),
            service_name TEXT NOT NULL,
            service_key TEXT NOT NULL,
            detail TEXT NOT NULL,
            date INTEGER NOT NULL,
            amount INTEGER,
            currency TEXT,
            request_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL
          );
          
          -- Copy data from old table to new table
          INSERT INTO activities_new SELECT * FROM activities;
          
          -- Drop old table and rename new table
          DROP TABLE activities;
          ALTER TABLE activities_new RENAME TO activities;
          
          -- Recreate indexes
          CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date);
          CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);
          CREATE INDEX IF NOT EXISTS idx_activities_subscription ON activities(subscription_id);
        `);
        currentDbVersion = 8;
        console.log('Updated activities table to support ticket type - now at version 8');
      }

      if (currentDbVersion <= 8) {
        await db.execAsync(`
          -- Update activities table to allow ticket_approved and ticket_denied types
          -- First, create a new table with the updated constraint
          CREATE TABLE activities_new (
            id TEXT PRIMARY KEY NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('auth', 'pay', 'ticket', 'ticket_approved', 'ticket_denied')),
            service_name TEXT NOT NULL,
            service_key TEXT NOT NULL,
            detail TEXT NOT NULL,
            date INTEGER NOT NULL,
            amount INTEGER,
            currency TEXT,
            request_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL
          );
          
          -- Copy data from old table to new table
          INSERT INTO activities_new SELECT * FROM activities;
          
          -- Drop old table and rename new table
          DROP TABLE activities;
          ALTER TABLE activities_new RENAME TO activities;
          
          -- Recreate indexes
          CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date);
          CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);
          CREATE INDEX IF NOT EXISTS idx_activities_subscription ON activities(subscription_id);
        `);
        currentDbVersion = 9;
        console.log(
          'Updated activities table to support ticket_approved and ticket_denied types - now at version 9'
        );
      }

      if (currentDbVersion <= 9) {
        await db.execAsync(`
          -- Update activities table to allow ticket_received type
          -- First, create a new table with the updated constraint
          CREATE TABLE activities_new (
            id TEXT PRIMARY KEY NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('auth', 'pay', 'ticket', 'ticket_approved', 'ticket_denied', 'ticket_received')),
            service_name TEXT NOT NULL,
            service_key TEXT NOT NULL,
            detail TEXT NOT NULL,
            date INTEGER NOT NULL,
            amount INTEGER,
            currency TEXT,
            request_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL
          );
          
          -- Copy data from old table to new table
          INSERT INTO activities_new SELECT * FROM activities;
          
          -- Drop old table and rename new table
          DROP TABLE activities;
          ALTER TABLE activities_new RENAME TO activities;
          
          -- Recreate indexes
          CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date);
          CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);
          CREATE INDEX IF NOT EXISTS idx_activities_subscription ON activities(subscription_id);
        `);
        currentDbVersion = 10;
        console.log('Updated activities table to support ticket_received type - now at version 10');
      }

      if (currentDbVersion <= 10) {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS processed_cashu_tokens (
            token_hash TEXT PRIMARY KEY NOT NULL,
            mint_url TEXT NOT NULL,
            unit TEXT NOT NULL,
            amount INTEGER NOT NULL,
            processed_at INTEGER NOT NULL -- Unix timestamp
          );
          CREATE INDEX IF NOT EXISTS idx_processed_cashu_tokens_hash ON processed_cashu_tokens(token_hash);
          CREATE INDEX IF NOT EXISTS idx_processed_cashu_tokens_mint ON processed_cashu_tokens(mint_url);
        `);
        currentDbVersion = 11;
        console.log('Created processed_cashu_tokens table - now at version 11');
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
