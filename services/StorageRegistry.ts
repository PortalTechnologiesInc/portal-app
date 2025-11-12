/**
 * Centralized registry of all storage keys and database schemas
 * This ensures complete and consistent data clearing during app reset
 */

// All SecureStore keys used throughout the app
export const SECURE_STORE_KEYS = {
  // Authentication & Core
  MNEMONIC: 'portal_mnemonic',
  NSEC: 'portal_nsec',
  WALLET_URL: 'portal_wallet_url',

  // Onboarding & First Launch
  ONBOARDING_COMPLETE: 'portal_onboarding_complete',
  FIRST_LAUNCH_COMPLETED: 'portal_first_launch_completed',
  SEED_ORIGIN: 'portal_seed_origin',

  // Profile Data
  USERNAME: 'portal_username',
  DISPLAY_NAME: 'portal_display_name',
  AVATAR_URI: 'portal_avatar_uri',
  PROFILE_INITIALIZED: 'profile_initialized',

  // App State
  PENDING_DEEPLINK: 'PENDING_DEEPLINK',
  EXPO_PUSH_TOKEN: 'expo_push_token_key',
} as const;

// All database tables that need to be cleared during reset
export const DATABASE_TABLES = [
  'activities',
  'subscriptions',
  'name_cache',
  'nostr_relays',
  'stored_pending_requests',
  'cashu_proofs',
  'cashu_blind_signatures',
  'cashu_transactions',
  'cashu_keys',
  'cashu_keyset_counters',
  'cashu_mints',
  'cashu_mint_keysets',
  'processed_cashu_tokens',
  'payment_status',
  'processed_notification_events',
] as const;

// All database indexes that should be dropped during reset
export const DATABASE_INDEXES = [
  'idx_activities_date',
  'idx_activities_type',
  'idx_activities_subscription',
  'idx_subscriptions_next_payment',
  'idx_name_cache_expires',
  'cashu_proofs_state_index',
  'cashu_proofs_secret_index',
  'cashu_proofs_spending_condition_index',
  'cashu_proofs_unit_index',
  'cashu_proofs_amount_index',
  'cashu_blind_signatures_keyset_id_index',
  'cashu_transactions_mint_url_index',
  'cashu_transactions_direction_index',
  'cashu_transactions_unit_index',
  'cashu_transactions_timestamp_index',
  'cashu_mint_keysets_mint_url_index',
  'cashu_mint_keysets_keyset_id_index',
  'idx_processed_notification_events_processed_at',
] as const;

/**
 * Get all SecureStore keys as an array
 */
export const getAllSecureStoreKeys = (): string[] => {
  return Object.values(SECURE_STORE_KEYS);
};

/**
 * Get all database tables as an array
 */
export const getAllDatabaseTables = (): string[] => {
  return [...DATABASE_TABLES];
};

/**
 * Get all database indexes as an array
 */
export const getAllDatabaseIndexes = (): string[] => {
  return [...DATABASE_INDEXES];
};

/**
 * Generate SQL to drop all tables and indexes
 */
export const generateResetSQL = (): string => {
  const dropTables = DATABASE_TABLES.map(table => `DROP TABLE IF EXISTS ${table};`).join(
    '\n        '
  );
  const dropIndexes = DATABASE_INDEXES.map(index => `DROP INDEX IF EXISTS ${index};`).join(
    '\n        '
  );

  return `
        ${dropIndexes}
        ${dropTables}
        PRAGMA user_version = 0;
    `;
};
