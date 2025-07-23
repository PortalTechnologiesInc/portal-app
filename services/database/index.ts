import type { SQLiteDatabase } from 'expo-sqlite';
import type { ActivityType, UpcomingPayment } from '@/utils/types';
import type { Currency } from '@/utils/currency';
import uuid from 'react-native-uuid';

// Timestamp utilities
export const toUnixSeconds = (date: Date | number): number => {
  const ms = date instanceof Date ? date.getTime() : date;
  return Math.floor(ms / 1000);
};

export const fromUnixSeconds = (seconds: number | bigint): Date => {
  return new Date(Number(seconds) * 1000);
};

// Database record types (as stored in SQLite)
export interface ActivityRecord {
  id: string;
  type: 'auth' | 'pay' | 'ticket' | 'ticket_approved' | 'ticket_denied' | 'ticket_received';
  service_name: string;
  service_key: string;
  detail: string;
  date: number; // Unix timestamp in seconds
  amount: number | null;
  currency: string | null;
  request_id: string;
  created_at: number; // Unix timestamp in seconds
  subscription_id: string | null;
}

export interface SubscriptionRecord {
  id: string;
  request_id: string;
  service_name: string;
  service_key: string;
  amount: number;
  currency: string;
  recurrence_calendar: string;
  recurrence_max_payments: number | null;
  recurrence_until: number | null; // Unix timestamp in seconds
  recurrence_first_payment_due: number; // Unix timestamp in seconds
  status: 'active' | 'cancelled' | 'expired';
  last_payment_date: number | null; // Unix timestamp in seconds
  next_payment_date: number | null; // Unix timestamp in seconds
  created_at: number; // Unix timestamp in seconds
}

export interface NostrRelay {
  ws_uri: string;
  created_at: number;
}

export interface NameCacheRecord {
  service_pubkey: string;
  service_name: string;
  expires_at: number; // Unix timestamp in seconds
  created_at: number; // Unix timestamp in seconds
}

// Application layer types (with Date objects)
export interface ActivityWithDates extends Omit<ActivityRecord, 'date' | 'created_at'> {
  date: Date;
  created_at: Date;
}

export interface StoredPendingRequest {
  id: string;
  request_id: string;
  approved: boolean;
  created_at: Date;
}

export interface StoredPendingRequestWithDates extends Omit<StoredPendingRequest, 'created_at'> {
  created_at: Date;
}

export interface SubscriptionWithDates
  extends Omit<
    SubscriptionRecord,
    | 'recurrence_until'
    | 'recurrence_first_payment_due'
    | 'last_payment_date'
    | 'next_payment_date'
    | 'created_at'
  > {
  recurrence_until: Date | null;
  recurrence_first_payment_due: Date;
  last_payment_date: Date | null;
  next_payment_date: Date | null;
  created_at: Date;
}

export interface NostrRelayWithDates extends Omit<NostrRelay, 'created_at'> {
  created_at: Date;
}

export class DatabaseService {
  constructor(private db: SQLiteDatabase) {}

  // Database reset method
  async dropAllTables(): Promise<void> {
    try {
      console.log('Dropping all tables from database');
      // Drop existing tables
      await this.db.execAsync(`
        DROP TABLE IF EXISTS activities;
        DROP TABLE IF EXISTS subscriptions;
        DROP INDEX IF EXISTS idx_activities_date;
        DROP INDEX IF EXISTS idx_activities_type;
        DROP INDEX IF EXISTS idx_subscriptions_next_payment;
        PRAGMA user_version = 0;
      `);
      console.log('All database tables dropped successfully');
    } catch (error) {
      console.error('Failed to drop tables:', error);
      throw error;
    }
  }

  // Activity methods
  async addActivity(activity: Omit<ActivityWithDates, 'id' | 'created_at'>): Promise<string> {
    try {
      if (!this.db) {
        throw new Error('Database connection not available');
      }

      const id = uuid.v4();
      const now = toUnixSeconds(Date.now());

      try {
        await this.db.runAsync(
          `INSERT INTO activities (
            id, type, service_name, service_key, detail, date, amount, currency, request_id, created_at, subscription_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            activity.type,
            activity.service_name,
            activity.service_key,
            activity.detail,
            toUnixSeconds(activity.date),
            activity.amount,
            activity.currency,
            activity.request_id,
            now,
            activity.subscription_id,
          ]
        );

        console.log(`Activity ${id} of type ${activity.type} added successfully`);
        return id;
      } catch (dbError) {
        console.error('Database operation failed when adding activity:', dbError);
        throw dbError;
      }
    } catch (error) {
      console.error('Failed to add activity:', error);
      throw error;
    }
  }

  async getActivity(id: string): Promise<ActivityWithDates | null> {
    const record = await this.db.getFirstAsync<ActivityRecord>(
      'SELECT * FROM activities WHERE id = ?',
      [id]
    );

    if (!record) return null;

    return {
      ...record,
      date: fromUnixSeconds(record.date),
      created_at: fromUnixSeconds(record.created_at),
    };
  }

  async getActivities(
    options: {
      type?: ActivityType;
      serviceKey?: string;
      limit?: number;
      offset?: number;
      fromDate?: Date | number;
      toDate?: Date | number;
    } = {}
  ): Promise<ActivityWithDates[]> {
    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

    if (options.type !== undefined) {
      conditions.push('type = ?');
      params.push(options.type);
    }
    if (options.serviceKey) {
      conditions.push('service_key = ?');
      params.push(options.serviceKey);
    }
    if (options.fromDate) {
      conditions.push('date >= ?');
      params.push(toUnixSeconds(options.fromDate));
    }
    if (options.toDate) {
      conditions.push('date <= ?');
      params.push(toUnixSeconds(options.toDate));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = options.limit ? `LIMIT ${options.limit}` : '';
    const offsetClause = options.offset ? `OFFSET ${options.offset}` : '';

    const records = await this.db.getAllAsync<ActivityRecord>(
      `SELECT * FROM activities ${whereClause} ORDER BY date DESC ${limitClause} ${offsetClause}`,
      params
    );

    return records.map(record => ({
      ...record,
      date: fromUnixSeconds(record.date),
      created_at: fromUnixSeconds(record.created_at),
    }));
  }

  // Optimized method to get only the 5 most recent activities
  async getRecentActivities(limit = 5): Promise<ActivityWithDates[]> {
    const records = await this.db.getAllAsync<ActivityRecord>(
      `SELECT * FROM activities ORDER BY date DESC LIMIT ?`,
      [limit]
    );

    return records.map(record => ({
      ...record,
      date: fromUnixSeconds(record.date),
      created_at: fromUnixSeconds(record.created_at),
    }));
  }

  // Subscription methods
  async addSubscription(
    subscription: Omit<SubscriptionWithDates, 'id' | 'created_at'>
  ): Promise<string> {
    const id = uuid.v4();
    const now = toUnixSeconds(Date.now());

    await this.db.runAsync(
      `INSERT INTO subscriptions (
        id, request_id, service_name, service_key, amount, currency,
        recurrence_calendar, recurrence_max_payments, recurrence_until,
        recurrence_first_payment_due, status, last_payment_date,
        next_payment_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        subscription.request_id,
        subscription.service_name,
        subscription.service_key,
        subscription.amount,
        subscription.currency,
        subscription.recurrence_calendar,
        subscription.recurrence_max_payments,
        subscription.recurrence_until ? toUnixSeconds(subscription.recurrence_until) : null,
        toUnixSeconds(subscription.recurrence_first_payment_due),
        subscription.status,
        subscription.last_payment_date ? toUnixSeconds(subscription.last_payment_date) : null,
        subscription.next_payment_date ? toUnixSeconds(subscription.next_payment_date) : null,
        now,
      ]
    );

    return id;
  }

  async getSubscription(id: string): Promise<SubscriptionWithDates | null> {
    const record = await this.db.getFirstAsync<SubscriptionRecord>(
      'SELECT * FROM subscriptions WHERE id = ?',
      [id]
    );

    if (!record) return null;

    return {
      ...record,
      recurrence_until: record.recurrence_until ? fromUnixSeconds(record.recurrence_until) : null,
      recurrence_first_payment_due: fromUnixSeconds(record.recurrence_first_payment_due),
      last_payment_date: record.last_payment_date
        ? fromUnixSeconds(record.last_payment_date)
        : null,
      next_payment_date: record.next_payment_date
        ? fromUnixSeconds(record.next_payment_date)
        : null,
      created_at: fromUnixSeconds(record.created_at),
    };
  }

  async getSubscriptions(
    options: {
      serviceKey?: string;
      status?: SubscriptionRecord['status'];
      activeOnly?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<SubscriptionWithDates[]> {
    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

    if (options.serviceKey) {
      conditions.push('service_key = ?');
      params.push(options.serviceKey);
    }
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    } else if (options.activeOnly) {
      conditions.push('status = ?');
      params.push('active');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = options.limit ? `LIMIT ${options.limit}` : '';
    const offsetClause = options.offset ? `OFFSET ${options.offset}` : '';

    const records = await this.db.getAllAsync<SubscriptionRecord>(
      `SELECT * FROM subscriptions ${whereClause} ORDER BY next_payment_date ASC ${limitClause} ${offsetClause}`,
      params
    );

    return records.map(record => ({
      ...record,
      recurrence_until: record.recurrence_until ? fromUnixSeconds(record.recurrence_until) : null,
      recurrence_first_payment_due: fromUnixSeconds(record.recurrence_first_payment_due),
      last_payment_date: record.last_payment_date
        ? fromUnixSeconds(record.last_payment_date)
        : null,
      next_payment_date: record.next_payment_date
        ? fromUnixSeconds(record.next_payment_date)
        : null,
      created_at: fromUnixSeconds(record.created_at),
    }));
  }

  async updateSubscriptionStatus(
    id: string,
    status: SubscriptionRecord['status'],
    nextPaymentDate?: Date | number | null
  ): Promise<void> {
    const updates: string[] = ['status = ?'];
    const params: (string | number | null)[] = [status];

    if (nextPaymentDate !== undefined) {
      updates.push('next_payment_date = ?');
      params.push(nextPaymentDate ? toUnixSeconds(nextPaymentDate) : null);
    }

    params.push(id);

    await this.db.runAsync(`UPDATE subscriptions SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  async updateSubscriptionLastPayment(id: string, lastPaymentDate: Date | number): Promise<void> {
    await this.db.runAsync(
      `UPDATE subscriptions
       SET last_payment_date = ?
       WHERE id = ?`,
      [toUnixSeconds(lastPaymentDate), id]
    );
  }

  // Helper method to get upcoming payments
  async getUpcomingPayments(limit = 5): Promise<UpcomingPayment[]> {
    const now = toUnixSeconds(Date.now());
    const subscriptions = await this.db.getAllAsync<SubscriptionRecord>(
      `SELECT * FROM subscriptions
       WHERE status = 'active'
       AND next_payment_date > ?
       ORDER BY next_payment_date ASC
       LIMIT ?`,
      [now, limit]
    );

    return subscriptions.map(sub => ({
      id: sub.id,
      serviceName: sub.service_name,
      amount: sub.amount,
      currency: sub.currency as Currency,
      dueDate: fromUnixSeconds(sub.next_payment_date ?? 0),
    }));
  }

  // Get payment activities for a specific subscription
  async getSubscriptionPayments(subscriptionId: string): Promise<ActivityWithDates[]> {
    const records = await this.db.getAllAsync<ActivityRecord>(
      `SELECT * FROM activities
       WHERE subscription_id = ?
       AND type = 'pay'
       ORDER BY date DESC`,
      [subscriptionId]
    );

    return records.map(record => ({
      ...record,
      date: fromUnixSeconds(record.date),
      created_at: fromUnixSeconds(record.created_at),
    }));
  }

  async updateRelays(relays: string[]): Promise<number> {
    this.db.withTransactionAsync(async () => {
      const placeholders = relays.map(() => '?').join(', ');
      await this.db.runAsync(
        `DELETE FROM nostr_relays
           WHERE ws_uri NOT IN (?)`,
        [placeholders]
      );
      for (const relay of relays) {
        await this.db.runAsync(
          `INSERT OR IGNORE INTO nostr_relays (
              ws_uri, created_at
            ) VALUES (?, ?)`,
          [relay, toUnixSeconds(Date.now())]
        );
      }
    });
    return 0;
  }

  /**
   * Get relays
   * @returns Promise that resolves with an object containing the ws uri and it's creation date
   */
  async getRelays(): Promise<NostrRelayWithDates[]> {
    const records = await this.db.getAllAsync<NostrRelay>(`SELECT * FROM nostr_relays`);

    return records.map(record => ({
      ...record,
      created_at: fromUnixSeconds(record.created_at),
    }));
  }

  // Name cache methods

  /**
   * Get a cached service name if it exists and hasn't expired (within 1 hour)
   * @param pubkey The public key to look up
   * @returns The cached service name or null if not found/expired
   */
  async getCachedServiceName(pubkey: string): Promise<string | null> {
    const now = toUnixSeconds(Date.now());

    const record = await this.db.getFirstAsync<NameCacheRecord>(
      'SELECT * FROM name_cache WHERE service_pubkey = ? AND expires_at > ?',
      [pubkey, now]
    );

    return record?.service_name || null;
  }

  /**
   * Store a service name in the cache with 1-hour expiration
   * @param pubkey The public key
   * @param serviceName The resolved service name
   */
  async setCachedServiceName(pubkey: string, serviceName: string): Promise<void> {
    const now = toUnixSeconds(Date.now());
    const expiresAt = now + 60 * 60; // 1 hour from now

    await this.db.runAsync(
      `INSERT OR REPLACE INTO name_cache (
        service_pubkey, service_name, expires_at, created_at
      ) VALUES (?, ?, ?, ?)`,
      [pubkey, serviceName, expiresAt, now]
    );
  }

  /**
   * Check if a cached entry exists (regardless of expiration)
   * @param pubkey The public key to check
   * @returns True if an entry exists, false otherwise
   */
  async hasCachedServiceName(pubkey: string): Promise<boolean> {
    const record = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM name_cache WHERE service_pubkey = ?',
      [pubkey]
    );

    return (record?.count || 0) > 0;
  }

  /**
   * Clean up expired cache entries (optional maintenance method)
   */
  async cleanExpiredNameCache(): Promise<number> {
    const now = toUnixSeconds(Date.now());

    const result = await this.db.runAsync('DELETE FROM name_cache WHERE expires_at <= ?', [now]);

    return result.changes;
  }

  // Subscription methods
  async storePendingRequest(eventId: string, approved: boolean): Promise<string> {
    const id = uuid.v4();
    const now = toUnixSeconds(Date.now());

    try {
      await this.db.runAsync(
        `INSERT OR IGNORE INTO stored_pending_requests (
        id, event_id, approved, created_at
      ) VALUES (?, ?, ?, ?)`,
        [id, eventId, approved ? '1' : '0', now]
      );
    } catch (e) {}

    return id;
  }

  // Subscription methods
  async isPendingRequestStored(eventId: string): Promise<boolean> {
    const records = await this.db.getFirstAsync<StoredPendingRequest>(
      `SELECT * FROM stored_pending_requests
        WHERE event_id = ?`,
      [eventId]
    );
    return records ? true : false;
  }

  // Proof methods
  async getCashuProofs(
    mintUrl: string | undefined,
    unit: string | undefined,
    state: string | undefined,
    spendingCondition: string | undefined
  ): Promise<Array<string>> {
    try {
      let query = 'SELECT * FROM cashu_proofs WHERE 1=1';
      const params: any[] = [];

      if (mintUrl) {
        query += ' AND mint_url = ?';
        params.push(mintUrl);
      }
      if (unit) {
        query += ' AND unit = ?';
        params.push(unit);
      }
      if (state) {
        const states = JSON.parse(state);
        query += ' AND state IN (' + states.map(() => '?').join(',') + ')';
        params.push(...states);
      }
      if (spendingCondition) {
        query += ' AND spending_condition = ?';
        params.push(spendingCondition);
      }

      const proofs = await this.db.getAllAsync(query, params);

      return proofs.map((proof: any) =>
        JSON.stringify({
          proof: {
            amount: proof.amount,
            id: proof.keyset_id,
            secret: proof.secret,
            C: proof.c,
            dleq: proof.dleq_e ? { e: proof.dleq_e, s: proof.dleq_s, r: proof.dleq_r } : undefined,
          },
          y: proof.y,
          mint_url: proof.mint_url,
          state: proof.state,
          spending_condition: proof.spending_condition,
          unit: proof.unit,
        })
      );
    } catch (error) {
      console.error('[DatabaseService] Error getting proofs:', error);
      return [];
    }
  }

  async updateCashuProofs(added: Array<string>, removedYs: Array<string>): Promise<void> {
    try {
      // Remove proofs
      for (const y of removedYs) {
        await this.db.runAsync('DELETE FROM cashu_proofs WHERE y = ?', [y]);
      }

      // Add proofs (assuming added contains serialized proof data)
      for (const proofData of added) {
        const proof = JSON.parse(proofData);
        const dleq = proof.proof.dleq;
        await this.db.runAsync(
          `INSERT OR REPLACE INTO cashu_proofs 
           (y, mint_url, state, spending_condition, unit, amount, keyset_id, secret, c, witness, dleq_e, dleq_s, dleq_r) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            proof.y,
            proof.mint_url,
            proof.state,
            proof.spending_condition,
            proof.unit,
            proof.proof.amount,
            proof.proof.id,
            proof.proof.secret,
            proof.proof.C,
            proof.proof.witness || null,
            dleq?.e || null,
            dleq?.s || null,
            dleq?.r || null,
          ]
        );
      }
    } catch (error) {
      console.error('[DatabaseService] Error updating proofs:', error);
      throw error;
    }
  }

  async updateCashuProofsState(ys: Array<string>, state: string): Promise<void> {
    try {
      for (const y of ys) {
        await this.db.runAsync('UPDATE cashu_proofs SET state = ? WHERE y = ?', [
          state.replaceAll('"', ''),
          y,
        ]);
      }
    } catch (error) {
      console.error('[DatabaseService] Error updating proof states:', error);
      throw error;
    }
  }

  // Transaction methods
  async addCashuTransaction(transaction: string): Promise<void> {
    try {
      const txData = JSON.parse(transaction);
      await this.db.runAsync(
        'INSERT OR REPLACE INTO cashu_transactions (id, mint_url, direction, amount, fee, unit, ys, timestamp, memo, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          txData.id,
          txData.mint_url,
          txData.direction,
          txData.amount,
          txData.fee,
          txData.unit,
          txData.ys,
          txData.timestamp,
          txData.memo,
          txData.metadata,
        ]
      );
    } catch (error) {
      console.error('[DatabaseService] Error adding transaction:', error);
      throw error;
    }
  }

  async getCashuTransaction(transactionId: string): Promise<string | undefined> {
    try {
      const tx = await this.db.getFirstAsync<{
        id: Uint8Array;
        mint_url: string;
        direction: string;
        amount: number;
        fee: number;
        unit: string;
        ys: Uint8Array;
        timestamp: number;
        memo: string | null;
        metadata: string | null;
      }>('SELECT * FROM cashu_transactions WHERE id = ?', [transactionId]);

      return tx ? JSON.stringify(tx) : undefined;
    } catch (error) {
      console.error('[DatabaseService] Error getting transaction:', error);
      return undefined;
    }
  }

  async listCashuTransactions(
    mintUrl?: string,
    direction?: string,
    unit?: string
  ): Promise<Array<string>> {
    try {
      let query = 'SELECT * FROM cashu_transactions WHERE 1=1';
      const params: any[] = [];

      if (mintUrl) {
        query += ' AND mint_url = ?';
        params.push(mintUrl);
      }
      if (direction) {
        query += ' AND direction = ?';
        params.push(direction);
      }
      if (unit) {
        query += ' AND unit = ?';
        params.push(unit);
      }

      const transactions = await this.db.getAllAsync(query, params);
      return transactions.map(tx => JSON.stringify(tx));
    } catch (error) {
      console.error('[DatabaseService] Error listing transactions:', error);
      return [];
    }
  }

  async removeCashuTransaction(transactionId: string): Promise<void> {
    try {
      await this.db.runAsync('DELETE FROM cashu_transactions WHERE id = ?', [transactionId]);
    } catch (error) {
      console.error('[DatabaseService] Error removing transaction:', error);
      throw error;
    }
  }

  // Keyset methods
  async getCashuKeysetById(keysetId: string): Promise<string | undefined> {
    try {
      const keyset = await this.db.getFirstAsync<{ keyset: string }>(
        'SELECT keyset FROM cashu_mint_keysets WHERE keyset_id = ?',
        [keysetId]
      );
      return keyset ? keyset.keyset : undefined;
    } catch (error) {
      console.error('[DatabaseService] Error getting keyset by ID:', error);
      return undefined;
    }
  }

  async addCashuKeys(keyset: string): Promise<void> {
    try {
      const keysData = JSON.parse(keyset);
      await this.db.runAsync('INSERT OR REPLACE INTO cashu_keys (id, keys) VALUES (?, ?)', [
        keysData.id,
        JSON.stringify(keysData.keys),
      ]);
    } catch (error) {
      console.error('[DatabaseService] Error adding keys:', error);
      throw error;
    }
  }

  async getCashuKeys(id: string): Promise<string | undefined> {
    try {
      const keys = await this.db.getFirstAsync<{ keys: string }>(
        'SELECT keys FROM cashu_keys WHERE id = ?',
        [id]
      );
      return keys ? keys.keys : undefined;
    } catch (error) {
      console.error('[DatabaseService] Error getting keys:', error);
      return undefined;
    }
  }

  async removeCashuKeys(id: string): Promise<void> {
    try {
      await this.db.runAsync('DELETE FROM cashu_keys WHERE id = ?', [id]);
    } catch (error) {
      console.error('[DatabaseService] Error removing keys:', error);
      throw error;
    }
  }

  // Counter methods
  async incrementCashuKeysetCounter(keysetId: string, count: number): Promise<void> {
    try {
      await this.db.runAsync(
        'INSERT OR REPLACE INTO cashu_keyset_counters (keyset_id, counter) VALUES (?, COALESCE((SELECT counter FROM cashu_keyset_counters WHERE keyset_id = ?), 0) + ?)',
        [keysetId, keysetId, count]
      );
    } catch (error) {
      console.error('[DatabaseService] Error incrementing keyset counter:', error);
      throw error;
    }
  }

  async getCashuKeysetCounter(keysetId: string): Promise<number | undefined> {
    try {
      const result = await this.db.getFirstAsync<{ counter: number }>(
        'SELECT counter FROM cashu_keyset_counters WHERE keyset_id = ?',
        [keysetId]
      );
      return result?.counter;
    } catch (error) {
      console.error('[DatabaseService] Error getting keyset counter:', error);
      return undefined;
    }
  }

  // Mint methods
  async addCashuMint(mintUrl: string, mintInfo: string | undefined): Promise<void> {
    try {
      await this.db.runAsync(
        'INSERT OR REPLACE INTO cashu_mints (mint_url, mint_info) VALUES (?, ?)',
        [mintUrl, mintInfo || null]
      );
    } catch (error) {
      console.error('[DatabaseService] Error adding mint:', error);
      throw error;
    }
  }

  async removeCashuMint(mintUrl: string): Promise<void> {
    try {
      await this.db.runAsync('DELETE FROM cashu_mints WHERE mint_url = ?', [mintUrl]);
    } catch (error) {
      console.error('[DatabaseService] Error removing mint:', error);
      throw error;
    }
  }

  async getCashuMint(mintUrl: string): Promise<string | undefined> {
    try {
      const mint = await this.db.getFirstAsync<{ mint_info: string }>(
        'SELECT mint_info FROM cashu_mints WHERE mint_url = ?',
        [mintUrl]
      );
      return mint?.mint_info;
    } catch (error) {
      console.error('[DatabaseService] Error getting mint:', error);
      return undefined;
    }
  }

  async getCashuMints(): Promise<Array<string>> {
    try {
      const mints = await this.db.getAllAsync<{ mint_url: string }>(
        'SELECT mint_url FROM cashu_mints'
      );
      return mints.map(mint => mint.mint_url);
    } catch (error) {
      console.error('[DatabaseService] Error getting mints:', error);
      return [];
    }
  }

  async updateCashuMintUrl(oldMintUrl: string, newMintUrl: string): Promise<void> {
    try {
      await this.db.runAsync('UPDATE cashu_mints SET mint_url = ? WHERE mint_url = ?', [
        newMintUrl,
        oldMintUrl,
      ]);
    } catch (error) {
      console.error('[DatabaseService] Error updating mint URL:', error);
      throw error;
    }
  }

  async addCashuMintKeysets(mintUrl: string, keysets: Array<string>): Promise<void> {
    try {
      for (const keyset of keysets) {
        const parsed = JSON.parse(keyset);
        await this.db.runAsync(
          'INSERT OR REPLACE INTO cashu_mint_keysets (mint_url, keyset_id, keyset) VALUES (?, ?, ?)',
          [mintUrl, parsed.id, keyset]
        );
      }
    } catch (error) {
      console.error('[DatabaseService] Error adding mint keysets:', error);
      throw error;
    }
  }

  async getCashuMintKeysets(mintUrl: string): Promise<Array<string> | undefined> {
    try {
      const keysets = await this.db.getAllAsync<{ keyset: string }>(
        'SELECT keyset FROM cashu_mint_keysets WHERE mint_url = ?',
        [mintUrl]
      );
      return keysets.length > 0 ? keysets.map(ks => ks.keyset) : undefined;
    } catch (error) {
      console.error('[DatabaseService] Error getting mint keysets:', error);
      return undefined;
    }
  }

  async getMintUnitPairs(): Promise<[string, string][]> {
    try {
      const query = 'SELECT DISTINCT mint_url, unit FROM cashu_proofs';
      console.log('Database: Executing query:', query);
      const rows = await this.db.getAllAsync<{ mint_url: string; unit: string }>(query);
      console.log('Database: Found rows:', rows);
      const result: [string, string][] = rows.map(row => [row.mint_url, row.unit]);
      console.log('Database: Returning mint-unit pairs:', result);
      return result;
    } catch (error) {
      console.error('Database: Error getting mint-unit pairs:', error);
      return [];
    }
  }

  // Cashu token deduplication methods
  async isCashuTokenProcessed(tokenHash: string): Promise<boolean> {
    try {
      // Check if table exists first
      const tableExists = await this.db.getFirstAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='processed_cashu_tokens'`
      );

      if (!tableExists) {
        // Table doesn't exist, create it
        await this.db.execAsync(`
          CREATE TABLE processed_cashu_tokens (
            token_hash TEXT PRIMARY KEY NOT NULL,
            mint_url TEXT NOT NULL,
            unit TEXT NOT NULL,
            amount INTEGER NOT NULL,
            processed_at INTEGER NOT NULL -- Unix timestamp
          );
          
          -- Create index for faster lookups
          CREATE INDEX idx_processed_cashu_tokens_hash ON processed_cashu_tokens(token_hash);
          CREATE INDEX idx_processed_cashu_tokens_mint ON processed_cashu_tokens(mint_url);
        `);
      } else {
        // Table exists, check if it has the right schema
        const tableInfo = await this.db.getAllAsync<{ name: string; type: string }>(
          `PRAGMA table_info(processed_cashu_tokens)`
        );

        // If table doesn't have the right columns, recreate it
        const hasMintUrl = tableInfo.some(col => col.name === 'mint_url');
        const hasUnit = tableInfo.some(col => col.name === 'unit');
        const hasAmount = tableInfo.some(col => col.name === 'amount');
        const hasProcessedAt = tableInfo.some(col => col.name === 'processed_at');

        if (!hasMintUrl || !hasUnit || !hasAmount || !hasProcessedAt) {
          // Drop and recreate table with correct schema
          await this.db.execAsync(`DROP TABLE IF EXISTS processed_cashu_tokens`);
          await this.db.execAsync(`
            CREATE TABLE processed_cashu_tokens (
              token_hash TEXT PRIMARY KEY NOT NULL,
              mint_url TEXT NOT NULL,
              unit TEXT NOT NULL,
              amount INTEGER NOT NULL,
              processed_at INTEGER NOT NULL -- Unix timestamp
            );
            
            -- Create index for faster lookups
            CREATE INDEX idx_processed_cashu_tokens_hash ON processed_cashu_tokens(token_hash);
            CREATE INDEX idx_processed_cashu_tokens_mint ON processed_cashu_tokens(mint_url);
          `);
        }
      }

      const record = await this.db.getFirstAsync<{ token_hash: string }>(
        `SELECT token_hash FROM processed_cashu_tokens WHERE token_hash = ?`,
        [tokenHash]
      );
      return record ? true : false;
    } catch (error) {
      console.error('Error checking if Cashu token is processed:', error);
      return false; // Assume not processed if we can't check
    }
  }

  async markCashuTokenAsProcessed(
    tokenHash: string,
    mintUrl: string,
    unit: string,
    amount: number
  ): Promise<void> {
    try {
      // Check if table exists first
      const tableExists = await this.db.getFirstAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='processed_cashu_tokens'`
      );

      if (!tableExists) {
        // Table doesn't exist, create it
        await this.db.execAsync(`
          CREATE TABLE processed_cashu_tokens (
            token_hash TEXT PRIMARY KEY NOT NULL,
            mint_url TEXT NOT NULL,
            unit TEXT NOT NULL,
            amount INTEGER NOT NULL,
            processed_at INTEGER NOT NULL -- Unix timestamp
          );
          
          -- Create index for faster lookups
          CREATE INDEX idx_processed_cashu_tokens_hash ON processed_cashu_tokens(token_hash);
          CREATE INDEX idx_processed_cashu_tokens_mint ON processed_cashu_tokens(mint_url);
        `);
      } else {
        // Table exists, check if it has the right schema
        const tableInfo = await this.db.getAllAsync<{ name: string; type: string }>(
          `PRAGMA table_info(processed_cashu_tokens)`
        );

        // If table doesn't have the right columns, recreate it
        const hasMintUrl = tableInfo.some(col => col.name === 'mint_url');
        const hasUnit = tableInfo.some(col => col.name === 'unit');
        const hasAmount = tableInfo.some(col => col.name === 'amount');
        const hasProcessedAt = tableInfo.some(col => col.name === 'processed_at');

        if (!hasMintUrl || !hasUnit || !hasAmount || !hasProcessedAt) {
          // Drop and recreate table with correct schema
          await this.db.execAsync(`DROP TABLE IF EXISTS processed_cashu_tokens`);
          await this.db.execAsync(`
            CREATE TABLE processed_cashu_tokens (
              token_hash TEXT PRIMARY KEY NOT NULL,
              mint_url TEXT NOT NULL,
              unit TEXT NOT NULL,
              amount INTEGER NOT NULL,
              processed_at INTEGER NOT NULL -- Unix timestamp
            );
            
            -- Create index for faster lookups
            CREATE INDEX idx_processed_cashu_tokens_hash ON processed_cashu_tokens(token_hash);
            CREATE INDEX idx_processed_cashu_tokens_mint ON processed_cashu_tokens(mint_url);
          `);
        }
      }

      const now = toUnixSeconds(Date.now());
      await this.db.runAsync(
        `INSERT OR IGNORE INTO processed_cashu_tokens (
          token_hash, mint_url, unit, amount, processed_at
        ) VALUES (?, ?, ?, ?, ?)`,
        [tokenHash, mintUrl, unit, amount, now]
      );
    } catch (error) {
      console.error('Error marking Cashu token as processed:', error);
      // Don't throw - this is not critical for the app to function
    }
  }
}
