import { SQLiteDatabase } from 'expo-sqlite';

// Function to migrate database schema if needed
export default async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const DATABASE_VERSION = 19;

  try {
    let { user_version: currentDbVersion } = (await db.getFirstAsync<{
      user_version: number;
    }>('PRAGMA user_version')) ?? { user_version: 0 };

    if (currentDbVersion >= DATABASE_VERSION) {
      return;
    }

    console.log(`Migrating database from version ${currentDbVersion} to ${DATABASE_VERSION}`);

    if (currentDbVersion <= 0) {
      await db.execAsync(`
        PRAGMA journal_mode = 'wal';
      `);
      currentDbVersion = 1;
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
    }

    if (currentDbVersion <= 2) {
      await db.execAsync(`
        -- Add subscription_id column to activities
        ALTER TABLE activities ADD COLUMN subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL;

        -- Create index for subscription_id
        CREATE INDEX IF NOT EXISTS idx_activities_subscription ON activities(subscription_id);
      `);
      currentDbVersion = 3;
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
    }

    if (currentDbVersion <= 11) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS payment_status (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice TEXT NOT NULL,
          action_type TEXT NOT NULL CHECK (action_type IN ('payment_started', 'payment_completed', 'payment_failed')),
          created_at INTEGER NOT NULL -- Unix timestamp
        );
        CREATE INDEX IF NOT EXISTS idx_payment_status_invoice ON payment_status(invoice);
        CREATE INDEX IF NOT EXISTS idx_payment_status_action_type ON payment_status(action_type);
        CREATE INDEX IF NOT EXISTS idx_payment_status_created_at ON payment_status(created_at);
        
        -- Add status column to activities table
        ALTER TABLE activities ADD COLUMN status TEXT DEFAULT 'neutral' CHECK (status IN ('neutral', 'positive', 'negative', 'pending'));
        CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
      `);
      currentDbVersion = 12;
    }

    if (currentDbVersion <= 12) {
      await db.execAsync(`
        -- Add invoice column to activities table for payment activities
        ALTER TABLE activities ADD COLUMN invoice TEXT;
        CREATE INDEX IF NOT EXISTS idx_activities_invoice ON activities(invoice);
      `);
      currentDbVersion = 13;
    }

    if (currentDbVersion <= 13) {
      await db.execAsync(`
        -- Add converted amount and currency columns to activities table
        ALTER TABLE activities ADD COLUMN converted_amount REAL;
        ALTER TABLE activities ADD COLUMN converted_currency TEXT;
        CREATE INDEX IF NOT EXISTS idx_activities_converted_currency ON activities(converted_currency);
      `);
      currentDbVersion = 14;
    }

    if (currentDbVersion <= 14) {
      await db.execAsync(`
        -- Add converted amount and currency columns to subscription table
        ALTER TABLE subscriptions ADD COLUMN converted_amount REAL;
        ALTER TABLE subscriptions ADD COLUMN converted_currency TEXT;
        CREATE INDEX IF NOT EXISTS idx_subscriptions_converted_currency ON subscriptions(converted_currency);
      `);
      currentDbVersion = 15;
    }

    if (currentDbVersion <= 15) {
      // Deduplicate existing rows by request_id before enforcing uniqueness
      try {
        await db.execAsync(`
          -- Remove duplicate activities keeping the earliest row per request_id
          DELETE FROM activities
          WHERE rowid NOT IN (
            SELECT MIN(rowid)
            FROM activities
            GROUP BY request_id
          );
        `);
      } catch (_) {
        // Best-effort cleanup; continue even if this fails
      }

      await db.execAsync(`
        -- Ensure request_id is unique to deduplicate activities at the DB level
        CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_request_id_unique ON activities(request_id);
      `);
      currentDbVersion = 16;
    }

    if (currentDbVersion <= 16) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS processed_notification_events (
          event_id TEXT PRIMARY KEY NOT NULL,
          processed_at INTEGER NOT NULL -- Unix timestamp
        );

        CREATE INDEX IF NOT EXISTS idx_processed_notification_events_processed_at ON processed_notification_events(processed_at);
      `);
      currentDbVersion = 17;
    }

    if (currentDbVersion <= 17) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS processing_subscriptions (
          subscription_id TEXT PRIMARY KEY NOT NULL,
          processed_at INTEGER NOT NULL -- Unix timestamp
        );

        CREATE INDEX IF NOT EXISTS idx_processing_subscriptions_processed_at ON processing_subscriptions(processed_at);
      `);
      currentDbVersion = 18;
    }

    if (currentDbVersion <= 18) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS bunker_secrets (
          secret TEXT PRIMARY KEY NOT NULL UNIQUE,
          used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1))
        );

        CREATE INDEX IF NOT EXISTS idx_bunker_secrets ON bunker_secrets(secret);

        CREATE TABLE IF NOT EXISTS bunker_allowed_clients (
          client_pubkey TEXT PRIMARY KEY NOT NULL UNIQUE,
          client_name TEXT,
          requested_permissions TEXT,
          granted_permissions TEXT,
          created_at INTEGER NOT NULL,
          last_seen INTEGER NOT NULL,
          revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1))
        );
      `);
      currentDbVersion = 19;
    }

    if (currentDbVersion <= 19) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS nip05_contacts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          npub TEXT NOT NULL,
          domain TEXT NOT NULL,
          display_name TEXT,
          nickname TEXT,
          avatar_uri TEXT,
          created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_nip05_contacts_name ON nip05_contacts(name);
        CREATE INDEX IF NOT EXISTS idx_nip05_contacts_npub ON nip05_contacts(npub);
        CREATE INDEX IF NOT EXISTS idx_nip05_contacts_nickname ON nip05_contacts(nickname);
      `);
      currentDbVersion = 20;
      console.log('Created nip05_contacts table- now at version 20');
    }

    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
    console.log(`Database migration completed to version ${DATABASE_VERSION}`);
  } catch (error) {
    console.error('Database migration failed:', error);
    // Even if migration fails, try to set as initialized to prevent blocking the app
    console.warn(
      'Setting database as initialized despite migration errors to prevent app blocking'
    );
  }
}
