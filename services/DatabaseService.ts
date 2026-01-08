import type { SQLiteDatabase } from 'expo-sqlite';
import uuid from 'react-native-uuid';
import migrateDbIfNeeded from '@/migrations/DatabaseMigrations';
import type { Currency } from '@/utils/currency';
import type { ActivityType, UpcomingPayment } from '@/utils/types';
import { generateResetSQL } from './StorageRegistry';

// Timestamp utilities
export const toUnixSeconds = (date: Date | number): number => {
  const ms = date instanceof Date ? date.getTime() : date;
  return Math.floor(ms / 1000);
};

export const fromUnixSeconds = (seconds: number | bigint): Date => {
  return new Date(Number(seconds) * 1000);
};
export interface KeyValueCacheRecord {
  key: string;
  value: string;
  expires_at: number | null; // Unix timestamp in seconds, null means never expires
}

export interface QueuedTaskRecord {
  id: number;
  task_name: string;
  arguments: string; // JSON string representation
  added_at: number; // Unix timestamp in seconds
  expires_at: number | null; // Unix timestamp in seconds, null means never expires
  priority: number; // Higher numbers = higher priority
}

// Database record types (as stored in SQLite)
export interface ActivityRecord {
  id: string;
  type:
  | 'auth'
  | 'pay'
  | 'receive'
  | 'ticket'
  | 'ticket_approved'
  | 'ticket_denied'
  | 'ticket_received';
  service_name: string;
  service_key: string;
  detail: string;
  date: number; // Unix timestamp in seconds
  amount: number | null;
  currency: string | null;
  converted_amount: number | null;
  converted_currency: string | null;
  request_id: string;
  created_at: number; // Unix timestamp in seconds
  subscription_id: string | null;
  status: 'neutral' | 'positive' | 'negative' | 'pending';
  invoice?: string | null; // Invoice for payment activities (optional)
}

export interface SubscriptionRecord {
  id: string;
  request_id: string;
  service_name: string;
  service_key: string;
  amount: number;
  currency: string;
  converted_amount: number | null;
  converted_currency: string | null;
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

export interface Nip05Contact {
  id: number;
  npub: string;
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

export interface AllowedBunkerClient {
  client_pubkey: string;
  client_name: string | null;
  requested_permissions: string;
  granted_permissions: string;
  last_seen: number; // Unix timestamp in seconds
  created_at: number; // Unix timestamp in seconds
  revoked: boolean;
}

export interface AllowedBunkerClientWithDates
  extends Omit<AllowedBunkerClient, 'last_seen' | 'created_at'> {
  last_seen: Date;
  created_at: Date;
}

export type PaymentAction = 'payment_started' | 'payment_completed' | 'payment_failed';

export class DatabaseService {
  constructor(private db: SQLiteDatabase) {}

  /**
   * Force database reinitialization after reset
   * Runs the full migration process to recreate all tables
   */
  async resetAndReinitializeDatabase(): Promise<void> {
    const resetSQL = generateResetSQL();

    // Set user_version to 0 to force migration
    await this.db.execAsync(resetSQL);
    await migrateDbIfNeeded(this.db);
  }

  // Activity methods
  async addActivity(activity: Omit<ActivityWithDates, 'id' | 'created_at'>): Promise<string> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }

    const id = uuid.v4();
    const now = toUnixSeconds(Date.now());
    const result = await this.db.runAsync(
      `INSERT OR IGNORE INTO activities (
            id, type, service_name, service_key, detail, date, amount, currency, converted_amount, converted_currency, request_id, created_at, subscription_id, status, invoice
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        activity.type,
        activity.service_name,
        activity.service_key,
        activity.detail,
        toUnixSeconds(activity.date),
        activity.amount,
        activity.currency,
        activity.converted_amount,
        activity.converted_currency,
        activity.request_id,
        now,
        activity.subscription_id,
        activity.status || 'neutral',
        activity.invoice || null,
      ]
    );
    if (result.changes && result.changes > 0) {
      return id;
    }
    // If insert was ignored (likely due to unique request_id), update existing row instead
    const existing = await this.db.getFirstAsync<{ id: string }>(
      'SELECT id FROM activities WHERE request_id = ? LIMIT 1',
      [activity.request_id]
    );
    if (existing?.id) {
      // Update the existing activity with new data
      await this.db.runAsync(
        `UPDATE activities SET
              type = ?, service_name = ?, service_key = ?, detail = ?, date = ?,
              amount = ?, currency = ?, converted_amount = ?, converted_currency = ?,
              subscription_id = ?, status = ?, invoice = ?
            WHERE request_id = ?`,
        [
          activity.type,
          activity.service_name,
          activity.service_key,
          activity.detail,
          toUnixSeconds(activity.date),
          activity.amount,
          activity.currency,
          activity.converted_amount,
          activity.converted_currency,
          activity.subscription_id,
          activity.status || 'neutral',
          activity.invoice || null,
          activity.request_id,
        ]
      );
      return existing.id;
    }
    // Fallback: return generated id (shouldn't happen if IGNORE occurred and existing found)
    return id;
  }

  /**
   * Check if an activity already exists for the given request_id
   */
  async hasActivityWithRequestId(requestId: string): Promise<boolean> {
    try {
      const existing = await this.db.getFirstAsync<{ id: string }>(
        'SELECT id FROM activities WHERE request_id = ? LIMIT 1',
        [requestId]
      );
      return !!existing?.id;
    } catch (_error) {
      return false;
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

  async updateActivityStatus(
    id: string,
    status: 'neutral' | 'positive' | 'negative' | 'pending',
    statusDetail: string
  ): Promise<void> {
    await this.db.runAsync('UPDATE activities SET status = ?, detail = ? WHERE id = ?', [
      status,
      statusDetail,
      id,
    ]);
  }

  async getActivities(
    options: {
      types?: ActivityType[];
      includeSubscriptions?: boolean;
      excludeSubscriptions?: boolean;
      serviceKey?: string;
      limit?: number;
      offset?: number;
      fromDate?: Date | number;
      toDate?: Date | number;
    } = {}
  ): Promise<ActivityWithDates[]> {
    const conditions: string[] = [];
    const params: (string | number | null)[] = [];
    const orConditions: string[] = [];

    // Handle subscription filtering with OR logic when both include and exclude are needed
    if (
      options.includeSubscriptions &&
      options.excludeSubscriptions &&
      options.types &&
      options.types.includes('pay' as ActivityType)
    ) {
      // Special case: both payments (exclude subscriptions) and subscriptions are selected
      // We need to combine: other types OR one-time payments OR all subscriptions
      // Example: subscriptions + payments + logins → (type IN ('auth')) OR (type = 'pay' AND subscription_id IS NULL) OR (subscription_id IS NOT NULL)
      const otherTypes = options.types.filter(t => t !== 'pay');
      const orParts: string[] = [];

      // Add other types (logins, tickets) - show all of them regardless of subscription status
      if (otherTypes.length > 0) {
        const placeholders = otherTypes.map(() => '?').join(', ');
        orParts.push(`type IN (${placeholders})`);
        params.push(...otherTypes);
      }

      // Add one-time payments
      orParts.push(`(type = ? AND subscription_id IS NULL)`);
      params.push('pay');

      // Add all subscriptions (any type)
      orParts.push(`(subscription_id IS NOT NULL)`);

      // Combine all OR parts into a single OR condition
      orConditions.push(`(${orParts.join(' OR ')})`);
    } else if (options.includeSubscriptions && options.types && options.types.length > 0) {
      // Special case: subscriptions + other filters (logins, tickets, but not payments)
      // Show: activities matching the types OR all subscription activities
      // Example: subscriptions + logins → (type IN ('auth')) OR (subscription_id IS NOT NULL)
      const placeholders = options.types.map(() => '?').join(', ');
      orConditions.push(`type IN (${placeholders}) OR (subscription_id IS NOT NULL)`);
      params.push(...options.types);
    } else {
      // Normal filtering logic
      // Handle multiple types
      if (options.types && options.types.length > 0) {
        const placeholders = options.types.map(() => '?').join(', ');
        conditions.push(`type IN (${placeholders})`);
        params.push(...options.types);
      }

      // Handle subscription filtering
      if (options.includeSubscriptions) {
        // When subscriptions is selected without other type filters:
        // Shows all subscription activities (any type)
        // Example: subscriptions only → subscription_id IS NOT NULL
        conditions.push('subscription_id IS NOT NULL');
      } else if (options.excludeSubscriptions) {
        // Exclude subscription activities (show only one-time payments, logins, etc.)
        conditions.push('subscription_id IS NULL');
      }
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

    // Build WHERE clause with OR conditions if needed
    let whereClause = '';
    if (conditions.length > 0 || orConditions.length > 0) {
      const allConditions = [...conditions];
      if (orConditions.length > 0) {
        if (conditions.length > 0) {
          allConditions.push(`(${orConditions.join(' OR ')})`);
        } else {
          allConditions.push(...orConditions);
        }
      }
      whereClause = `WHERE ${allConditions.join(' AND ')}`;
    }

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
        id, request_id, service_name, service_key, amount, currency, converted_amount, converted_currency,
        recurrence_calendar, recurrence_max_payments, recurrence_until,
        recurrence_first_payment_due, status, last_payment_date,
        next_payment_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        subscription.request_id,
        subscription.service_name,
        subscription.service_key,
        subscription.amount,
        subscription.currency,
        subscription.converted_amount,
        subscription.converted_currency,
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
    } catch {
      /* empty */
    }

    return id;
  }

  // Subscription methods
  async isPendingRequestStored(eventId: string): Promise<boolean> {
    const records = await this.db.getFirstAsync<StoredPendingRequest>(
      `SELECT * FROM stored_pending_requests
        WHERE event_id = ?`,
      [eventId]
    );
    return !!records;
  }

  // Check if a pending request was approved (completed)
  async isPendingRequestApproved(eventId: string): Promise<boolean> {
    const record = await this.db.getFirstAsync<{ approved: number }>(
      `SELECT approved FROM stored_pending_requests
        WHERE event_id = ?`,
      [eventId]
    );
    return record ? record.approved === 1 : false;
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
        query += ` AND state IN (${states.map(() => '?').join(',')})`;
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
    } catch (_error) {
      return [];
    }
  }

  async updateCashuProofs(added: Array<string>, removedYs: Array<string>): Promise<void> {
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
  }

  async updateCashuProofsState(ys: Array<string>, state: string): Promise<void> {
    for (const y of ys) {
      await this.db.runAsync('UPDATE cashu_proofs SET state = ? WHERE y = ?', [
        state.replace(/"/g, ''),
        y,
      ]);
    }
  }

  // Transaction methods
  async addCashuTransaction(transaction: string): Promise<void> {
    const txData = JSON.parse(transaction);
    const metadata = JSON.stringify(txData.metadata);
    const ys = JSON.stringify(txData.ys);
    await this.db.runAsync(
      'INSERT OR REPLACE INTO cashu_transactions (id, mint_url, direction, amount, fee, unit, ys, timestamp, memo, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        txData.id,
        txData.mint_url,
        txData.direction,
        txData.amount,
        txData.fee,
        txData.unit,
        ys,
        txData.timestamp,
        txData.memo,
        metadata,
      ]
    );
  }

  async getCashuTransaction(transactionId: string): Promise<string | undefined> {
    try {
      const tx = await this.db.getFirstAsync<{
        id: string;
        mint_url: string;
        direction: string;
        amount: number;
        fee: number;
        unit: string;
        ys: string;
        timestamp: number;
        memo: string | null;
        metadata: string | null;
      }>('SELECT * FROM cashu_transactions WHERE id = ?', [transactionId]);

      return tx
        ? JSON.stringify({
            ...tx,
            ys: JSON.parse(tx.ys),
            metadata: tx.metadata ? JSON.parse(tx.metadata) : null,
          })
        : undefined;
    } catch (_error) {
      return undefined;
    }
  }

  async listCashuTransactions(
    mintUrl?: string,
    direction?: string,
    unit?: string
  ): Promise<Array<string>> {
    try {
      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (mintUrl) {
        conditions.push('mint_url = ?');
        params.push(mintUrl);
      }

      if (direction) {
        conditions.push('direction = ?');
        params.push(direction);
      }

      if (unit) {
        conditions.push('unit = ?');
        params.push(unit);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const query = `SELECT * FROM cashu_transactions ${whereClause} ORDER BY timestamp DESC`;

      const transactions = await this.db.getAllAsync<{
        id: string;
        mint_url: string;
        direction: string;
        amount: number;
        fee: number;
        unit: string;
        ys: string;
        timestamp: number;
        memo: string | null;
        metadata: string | null;
      }>(query, params);

      return transactions.map(tx =>
        JSON.stringify({
          ...tx,
          ys: JSON.parse(tx.ys),
          metadata: tx.metadata ? JSON.parse(tx.metadata) : null,
        })
      );
    } catch (_error) {
      return [];
    }
  }

  async removeCashuTransaction(transactionId: string): Promise<void> {
    await this.db.runAsync('DELETE FROM cashu_transactions WHERE id = ?', [transactionId]);
  }

  // Keyset methods
  async getCashuKeysetById(keysetId: string): Promise<string | undefined> {
    try {
      const keyset = await this.db.getFirstAsync<{ keyset: string }>(
        'SELECT keyset FROM cashu_mint_keysets WHERE keyset_id = ?',
        [keysetId]
      );
      return keyset ? keyset.keyset : undefined;
    } catch (_error) {
      return undefined;
    }
  }

  async addCashuKeys(keyset: string): Promise<void> {
    const keysData = JSON.parse(keyset);
    await this.db.runAsync('INSERT OR REPLACE INTO cashu_keys (id, keys) VALUES (?, ?)', [
      keysData.id,
      JSON.stringify(keysData.keys),
    ]);
  }

  async getCashuKeys(id: string): Promise<string | undefined> {
    try {
      const keys = await this.db.getFirstAsync<{ keys: string }>(
        'SELECT keys FROM cashu_keys WHERE id = ?',
        [id]
      );
      return keys ? keys.keys : undefined;
    } catch (_error) {
      return undefined;
    }
  }

  async removeCashuKeys(id: string): Promise<void> {
    await this.db.runAsync('DELETE FROM cashu_keys WHERE id = ?', [id]);
  }

  // Counter methods
  async incrementCashuKeysetCounter(keysetId: string, count: number): Promise<void> {
    await this.db.runAsync(
      'INSERT OR REPLACE INTO cashu_keyset_counters (keyset_id, counter) VALUES (?, COALESCE((SELECT counter FROM cashu_keyset_counters WHERE keyset_id = ?), 0) + ?)',
      [keysetId, keysetId, count]
    );
  }

  async getCashuKeysetCounter(keysetId: string): Promise<number | undefined> {
    try {
      const result = await this.db.getFirstAsync<{ counter: number }>(
        'SELECT counter FROM cashu_keyset_counters WHERE keyset_id = ?',
        [keysetId]
      );
      return result?.counter;
    } catch (_error) {
      return undefined;
    }
  }

  // Mint methods
  async addCashuMint(mintUrl: string, mintInfo: string | undefined): Promise<void> {
    await this.db.runAsync(
      'INSERT OR REPLACE INTO cashu_mints (mint_url, mint_info) VALUES (?, ?)',
      [mintUrl, mintInfo || null]
    );
  }

  async removeCashuMint(mintUrl: string): Promise<void> {
    await this.db.runAsync('DELETE FROM cashu_mints WHERE mint_url = ?', [mintUrl]);
  }

  async getCashuMint(mintUrl: string): Promise<string | undefined> {
    try {
      const mint = await this.db.getFirstAsync<{ mint_info: string }>(
        'SELECT mint_info FROM cashu_mints WHERE mint_url = ?',
        [mintUrl]
      );
      return mint?.mint_info;
    } catch (_error) {
      return undefined;
    }
  }

  async getCashuMints(): Promise<Array<string>> {
    try {
      const mints = await this.db.getAllAsync<{ mint_url: string }>(
        'SELECT mint_url FROM cashu_mints'
      );
      return mints.map(mint => mint.mint_url);
    } catch (_error) {
      return [];
    }
  }

  async updateCashuMintUrl(oldMintUrl: string, newMintUrl: string): Promise<void> {
    await this.db.runAsync('UPDATE cashu_mints SET mint_url = ? WHERE mint_url = ?', [
      newMintUrl,
      oldMintUrl,
    ]);
  }

  async addCashuMintKeysets(mintUrl: string, keysets: Array<string>): Promise<void> {
    for (const keyset of keysets) {
      const parsed = JSON.parse(keyset);
      await this.db.runAsync(
        'INSERT OR REPLACE INTO cashu_mint_keysets (mint_url, keyset_id, keyset) VALUES (?, ?, ?)',
        [mintUrl, parsed.id, keyset]
      );
    }
  }

  async getCashuMintKeysets(mintUrl: string): Promise<Array<string> | undefined> {
    try {
      const keysets = await this.db.getAllAsync<{ keyset: string }>(
        'SELECT keyset FROM cashu_mint_keysets WHERE mint_url = ?',
        [mintUrl]
      );
      return keysets.length > 0 ? keysets.map(ks => ks.keyset) : undefined;
    } catch (_error) {
      return undefined;
    }
  }

  async getMintUnitPairs(): Promise<[string, string][]> {
    try {
      const query = 'SELECT DISTINCT mint_url, unit FROM cashu_proofs';
      const rows = await this.db.getAllAsync<{ mint_url: string; unit: string }>(query);
      const result: [string, string][] = rows.map(row => [row.mint_url, row.unit]);
      return result;
    } catch (_error) {
      return [];
    }
  }

  // Cashu token deduplication methods
  /**
   * Atomically marks the token as processed. Returns true if it was already processed, false if this is the first time.
   */
  async markCashuTokenAsProcessed(
    tokenHash: string,
    mintUrl: string,
    unit: string,
    amount: number
  ): Promise<boolean> {
    try {
      const now = toUnixSeconds(Date.now());
      const result = await this.db.runAsync(
        `INSERT OR IGNORE INTO processed_cashu_tokens (
          token_hash, mint_url, unit, amount, processed_at
        ) VALUES (?, ?, ?, ?, ?)`,
        [tokenHash, mintUrl, unit, amount, now]
      );
      // result.changes === 0 means it was already present
      return result.changes === 0;
    } catch (_error) {
      // Don't throw - this is not critical for the app to function
      return false;
    }
  }

  // Payment status log methods
  async addPaymentStatusEntry(
    invoice: string,
    actionType: PaymentAction,
  ): Promise<number> {
    const now = toUnixSeconds(Date.now());
    const result = await this.db.runAsync(
      `INSERT INTO payment_status (
          invoice, action_type, created_at
        ) VALUES (?, ?, ?)`,
      [invoice, actionType, now]
    );
    return result.lastInsertRowId;
  }

  async getPaymentStatusEntries(invoice: string): Promise<
    Array<{
      id: number;
      invoice: string;
      action_type: PaymentAction;
      created_at: Date;
    }>
  > {
    try {
      const records = await this.db.getAllAsync<{
        id: number;
        invoice: string;
        action_type: string;
        created_at: number;
      }>(`SELECT * FROM payment_status WHERE invoice = ? ORDER BY created_at ASC`, [invoice]);

      return records.map(record => ({
        ...record,
        action_type: record.action_type as
          | 'payment_started'
          | 'payment_completed'
          | 'payment_failed',
        created_at: fromUnixSeconds(record.created_at),
      }));
    } catch (_error) {
      return [];
    }
  }

  async getPendingPayments(): Promise<
    Array<{
      id: string;
      invoice: string | null;
      action_type: 'payment_started' | 'payment_completed' | 'payment_failed';
      created_at: Date;
    }>
  > {
    try {
      const records = await this.db.getAllAsync<ActivityRecord>(
        `SELECT * FROM activities 
         WHERE type = 'pay' AND status = 'pending'
         ORDER BY created_at ASC`
      );

      return records.map(record => ({
        id: record.id,
        invoice: record.invoice ?? null,
        action_type: 'payment_started' as const, // All pending payments are started
        created_at: fromUnixSeconds(record.created_at),
      }));
    } catch (_error) {
      return [];
    }
  }

  async getNip05Contacts(): Promise<Array<Nip05Contact>> {
    try {
      const contacts = await this.db.getAllAsync<Nip05Contact>(`SELECT * FROM nip05_contacts`);

      return contacts;
    } catch (_error) {
      return [];
    }
  }

  async getRecentNip05Contacts(limit = 5): Promise<Array<Nip05Contact>> {
    try {
      const contacts = await this.db.getAllAsync<Nip05Contact>(
        `SELECT * FROM nip05_contacts ORDER BY created_at DESC LIMIT ?`,
        [limit]
      );

      return contacts;
    } catch (_error) {
      return [];
    }
  }

  async saveNip05Contact(npub: string): Promise<Nip05Contact | null> {
    try {
      // Check if contact already exists
      const existingContact = await this.db.getFirstAsync<Nip05Contact>(
        `SELECT * FROM nip05_contacts WHERE npub = ?`,
        [npub]
      );

      if (existingContact) {
        return existingContact;
      }

      await this.db.runAsync(
        `INSERT INTO nip05_contacts(npub)
         VALUES(?)`,
        [npub]
      );

      const newContact = await this.db.getFirstAsync<Nip05Contact>(
        `SELECT *
         FROM nip05_contacts
         WHERE npub = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [npub]
      );

      return newContact;
    } catch (_error) {
      return null;
    }
  }

  async updateNip05Contact(npub: string, id: number): Promise<void> {
    try {
      await this.db.runAsync(
        `UPDATE nip05_contacts
         SET npub = ?
         WHERE id = ?`,
        [npub, id]
      );
    } catch (_error) {}
  }

  // get last unused created secret
  async getUnusedSecretOrNull(): Promise<string | null> {
    const secret_obj = await this.db.getFirstAsync<{ secret: string }>(
      'SELECT secret FROM bunker_secrets WHERE used = 0'
    );
    return secret_obj?.secret ?? null;
  }
  // Add newly created bunker secret
  async addBunkerSecret(secret: string): Promise<number> {
    const result = await this.db.runAsync(
      `INSERT INTO bunker_secrets (
          secret
        ) VALUES (?)`,
      [secret]
    );
    return result.lastInsertRowId;
  }

  async getBunkerSecretOrNull(secret: string): Promise<{ secret: string; used: boolean } | null> {
    const record = await this.db.getFirstAsync<{ secret: string; used: number }>(
      'SELECT secret, used FROM bunker_secrets WHERE secret = ?',
      [secret]
    );
    if (!record) return null;
    // Convert INTEGER (0 or 1) to boolean
    return {
      secret: record.secret,
      used: record.used === 1,
    };
  }

  async markBunkerSecretAsUsed(secret: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE bunker_secrets
        SET used = ?
        WHERE secret = ?`,
      [secret, 1]
    );
  }

  // Add newly allowed nostr clients
  async addAllowedBunkerClient(
    pubkey: string,
    nip_05: string | null = null,
    requested_permissions: string | null
  ): Promise<number> {
    const now = toUnixSeconds(Date.now());
    const result = await this.db.runAsync(
      `INSERT OR REPLACE INTO bunker_allowed_clients (
          client_pubkey,
          client_name,
          requested_permissions,
          granted_permissions,
          created_at,
          last_seen,
          revoked
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [pubkey, nip_05, requested_permissions, requested_permissions, now, now, false]
    );
    return result.lastInsertRowId;
  }

  async getAllowedBunkerClients(): Promise<AllowedBunkerClientWithDates[]> {
    const records = await this.db.getAllAsync<AllowedBunkerClient>(
      `SELECT * FROM bunker_allowed_clients
      WHERE revoked = 0
      ORDER BY last_seen DESC`
    );

    return records.map(record => ({
      ...record,
      last_seen: fromUnixSeconds(record.last_seen),
      created_at: fromUnixSeconds(record.created_at),
    }));
  }

  async getBunkerClientOrNull(pubkey: string): Promise<AllowedBunkerClientWithDates | null> {
    const record = await this.db.getFirstAsync<AllowedBunkerClient>(
      `SELECT * FROM bunker_allowed_clients
      WHERE client_pubkey = ?`,
      [pubkey]
    );

    if (!record) return null;

    return {
      ...record,
      last_seen: fromUnixSeconds(record.last_seen),
      created_at: fromUnixSeconds(record.created_at),
    };
  }

  async updateBunkerClientLastSeen(pubkey: string): Promise<void> {
    const now = toUnixSeconds(Date.now());
    await this.db.runAsync(
      `UPDATE bunker_allowed_clients
        SET last_seen = ?
        WHERE client_pubkey = ?`,
      [now, pubkey]
    );
  }

  async updateBunkerClientGrantedPermissions(
    pubkey: string,
    grantedPermissions: string
  ): Promise<void> {
    await this.db.runAsync(
      `UPDATE bunker_allowed_clients
        SET granted_permissions = ?
        WHERE client_pubkey = ?`,
      [grantedPermissions, pubkey]
    );
  }

  async revokeBunkerClient(pubkey: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE bunker_allowed_clients
        SET revoked = ?
        WHERE client_pubkey = ?`,
      [true, pubkey]
    );
  }

  async updateBunkerClientName(pubkey: string, name: string | null): Promise<void> {
    try {
    await this.db.runAsync(
      `UPDATE bunker_allowed_clients
        SET client_name = ?
        WHERE client_pubkey = ?`,
      [name, pubkey]
    );
    } catch (error) {
      console.error('Database error while updating client name:', error);
      throw error;
    }
  }

  // Key-value cache methods

  /**
   * Get a cached value if it exists and hasn't expired
   * @param key The cache key
   * @returns The cached value or null if not found/expired
   */
  async getCache(key: string): Promise<string | null> {
    const now = toUnixSeconds(Date.now());

    const record = await this.db.getFirstAsync<KeyValueCacheRecord>(
      'SELECT * FROM key_value_cache WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)',
      [key, now]
    );

    return record?.value || null;
  }

  /**
   * Store a value in the cache with an expiration timestamp
   * @param key The cache key
   * @param value The value to cache
   * @param expiresAt The expiration timestamp (Date, Unix seconds, null for 'forever', or 'forever' string)
   */
  async setCache(
    key: string,
    value: string,
    expiresAt: Date | number | null | 'forever'
  ): Promise<void> {
    const expiresAtSeconds =
      expiresAt === null || expiresAt === 'forever' ? null : toUnixSeconds(expiresAt);

    if (value === null || value === undefined) {
      value = '{}'; // FIXME: make the column nullable
    }

    console.warn('Setting cache', key, value, expiresAtSeconds);
    await this.db.runAsync(
      `INSERT OR REPLACE INTO key_value_cache (
        key, value, expires_at
      ) VALUES (?, ?, ?)`,
      [key, value, expiresAtSeconds]
    );
  }

  /**
   * Delete a cache entry by key
   * @param key The cache key to delete
   */
  async deleteCache(key: string): Promise<void> {
    await this.db.runAsync('DELETE FROM key_value_cache WHERE key = ?', [key]);
  }

  /**
   * Clean up expired cache entries (optional maintenance method)
   * Only deletes entries with non-NULL expires_at that have expired
   * @returns The number of entries deleted
   */
  async cleanExpiredCache(): Promise<number> {
    const now = toUnixSeconds(Date.now());

    const result = await this.db.runAsync(
      'DELETE FROM key_value_cache WHERE expires_at IS NOT NULL AND expires_at <= ?',
      [now]
    );

    return result.changes ?? 0;
  }

  // Queued tasks methods

  /**
   * Add a task to the queue
   * @param taskName The name of the task
   * @param argumentsJson JSON string representation of the task arguments
   * @param expiresAt Optional expiration timestamp (Date, Unix seconds, null for 'forever', or 'forever' string)
   * @param priority Optional priority (defaults to 0, higher numbers = higher priority)
   * @returns The ID of the inserted task
   */
  async addQueuedTask(
    taskName: string,
    argumentsJson: string,
    expiresAt?: Date | number | null | 'forever',
    priority: number = 0
  ): Promise<number> {
    const now = toUnixSeconds(Date.now());
    const expiresAtSeconds =
      expiresAt === undefined || expiresAt === null || expiresAt === 'forever'
        ? null
        : toUnixSeconds(expiresAt);

    const result = await this.db.runAsync(
      `INSERT INTO queued_tasks (
        task_name, arguments, added_at, expires_at, priority
      ) VALUES (?, ?, ?, ?, ?)`,
      [taskName, argumentsJson, now, expiresAtSeconds, priority]
    );

    return result.lastInsertRowId;
  }

  /**
   * Get queued tasks, optionally filtered by task name and excluding expired tasks
   * @param options Filtering options
   * @returns Array of queued task records
   */
  async getQueuedTasks(options: {
    taskName?: string;
    excludeExpired?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<QueuedTaskRecord[]> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options.taskName) {
      conditions.push('task_name = ?');
      params.push(options.taskName);
    }

    if (options.excludeExpired !== false) {
      // Default to excluding expired tasks
      const now = toUnixSeconds(Date.now());
      conditions.push('(expires_at IS NULL OR expires_at > ?)');
      params.push(now);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = options.limit ? `LIMIT ${options.limit}` : '';
    const offsetClause = options.offset ? `OFFSET ${options.offset}` : '';

    const records = await this.db.getAllAsync<QueuedTaskRecord>(
      `SELECT * FROM queued_tasks ${whereClause} ORDER BY priority DESC, added_at ASC ${limitClause} ${offsetClause}`,
      params
    );

    return records;
  }

  /**
   * Get a queued task by ID
   * @param id The task ID
   * @returns The queued task record or null if not found
   */
  async getQueuedTask(id: number): Promise<QueuedTaskRecord | null> {
    const record = await this.db.getFirstAsync<QueuedTaskRecord>(
      'SELECT * FROM queued_tasks WHERE id = ?',
      [id]
    );

    return record || null;
  }

  /**
   * Extract the next task from the queue
   * Returns the highest priority task (or oldest if same priority) that hasn't expired.
   * The task remains in the queue and should be deleted manually once completed.
   * @returns The next queued task record or null if no tasks available
   */
  async extractNextQueuedTask(): Promise<QueuedTaskRecord | null> {
    const now = toUnixSeconds(Date.now());

    // Get the next task (highest priority, oldest, not expired)
    const task = await this.db.getFirstAsync<QueuedTaskRecord>(
      `SELECT * FROM queued_tasks 
       WHERE (expires_at IS NULL OR expires_at > ?)
       ORDER BY priority DESC, added_at ASC 
       LIMIT 1`,
      [now]
    );

    return task || null;
  }

  /**
   * Delete a queued task by ID
   * @param id The task ID to delete
   */
  async deleteQueuedTask(id: number): Promise<void> {
    await this.db.runAsync('DELETE FROM queued_tasks WHERE id = ?', [id]);
  }

  /**
   * Clean up expired queued tasks
   * Only deletes tasks with non-NULL expires_at that have expired
   * @returns The number of tasks deleted
   */
  async cleanExpiredQueuedTasks(): Promise<number> {
    const now = toUnixSeconds(Date.now());

    const result = await this.db.runAsync(
      'DELETE FROM queued_tasks WHERE expires_at IS NOT NULL AND expires_at <= ?',
      [now]
    );

    return result.changes ?? 0;
  }
}
