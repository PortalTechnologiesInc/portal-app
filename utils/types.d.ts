// Central type definitions for Portal App
// This file contains common interfaces and types used across multiple components and contexts

// =============================================================================
// CONNECTION & NETWORK TYPES
// =============================================================================

/**
 * Status of a relay connection
 */
export type RelayConnectionStatus =
  | 'Connected'
  | 'Connecting'
  | 'Pending'
  | 'Initialized'
  | 'Disconnected'
  | 'Terminated'
  | 'Banned'
  | 'Unknown';

/**
 * Information about a specific relay
 */
export interface RelayInfo {
  url: string;
  status: RelayConnectionStatus;
  connected: boolean;
}

/**
 * Summary of all relay connections
 */
export interface ConnectionSummary {
  allRelaysConnected: boolean;
  connectedCount: number;
  totalCount: number;
  relays: RelayInfo[];
}

// =============================================================================
// WALLET TYPES
// =============================================================================

/**
 * Wallet information from getinfo method
 */
export interface WalletInfo {
  alias?: string;
  get_balance?: number;
}

/**
 * State wrapper for wallet information
 */
export interface WalletInfoState {
  data: WalletInfo | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

// =============================================================================
// CORE MODEL TYPES & ENUMS
// =============================================================================

/**
 * Activity types supported by the app
 */
export enum ActivityType {
  Auth = 'auth',
  Pay = 'pay',
  Ticket = 'ticket',
  TicketApproved = 'ticket_approved',
  TicketDenied = 'ticket_denied',
  TicketReceived = 'ticket_received',
}

/**
 * Subscription/payment frequency options
 */
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'annually';

/**
 * Types of pending requests
 */
export type PendingRequestType =
  | 'login'
  | 'payment'
  | 'certificate'
  | 'identity'
  | 'subscription'
  | 'ticket';

// =============================================================================
// CORE ENTITY INTERFACES
// =============================================================================

/**
 * User identity information
 */
export interface Identity {
  name: string;
  publicKey: string;
  // Add other relevant properties as needed
}

/**
 * Activity entry - discriminated union based on type
 */
export type Activity =
  | {
      type: ActivityType.Pay;
      amount: number;
      currency: Currency;
      name: string;
      detail: string;
      date: Date;
    }
  | {
      type: ActivityType.Auth;
      name: string;
      detail: string;
      date: Date;
    };

/**
 * Upcoming payment information
 */
export interface UpcomingPayment {
  id: string;
  serviceName: string;
  amount: number;
  currency: string;
  dueDate: Date;
}

export interface Ticket {
  id: string;
  title: string;
  description?: string;
  mintUrl: string;
  balance: bigint;
  isNonFungible: boolean;
  // Rich metadata from UnitInfo
  frontCardBackground?: string;
  backCardBackground?: string;
  location?: string;
  date?: string;
  kind: 'Event' | 'Other';
}

/**
 * Pending request for user approval
 */
export interface PendingRequest {
  id: string;
  metadata: unknown; // Portal-app-lib types (AuthChallengeEvent | RecurringPaymentRequest | SinglePaymentRequest)
  type: PendingRequestType;
  timestamp: Date;
  result: (value: any) => void; // Portal-app-lib response types (AuthResponseStatus | PaymentResponseContent | RecurringPaymentResponseContent)
}

// =============================================================================
// ACTIVITY & SUBSCRIPTION TYPES
// =============================================================================

import type { ActivityWithDates, SubscriptionWithDates } from '@/services/database';

/**
 * Partial activity for pending operations (without id and created_at)
 */
export type PendingActivity = Omit<ActivityWithDates, 'id' | 'created_at'>;

/**
 * Partial subscription for pending operations (without id and created_at)
 */
export type PendingSubscription = Omit<SubscriptionWithDates, 'id' | 'created_at'>;

// =============================================================================
// THEME TYPES
// =============================================================================

/**
 * Available theme modes
 */
export type ThemeMode = 'auto' | 'light' | 'dark';

// =============================================================================
// PROFILE TYPES
// =============================================================================

/**
 * Status of profile synchronization with network
 */
export type ProfileSyncStatus = 'idle' | 'syncing' | 'completed' | 'failed';

// =============================================================================
// AUTHENTICATION TYPES
// =============================================================================

/**
 * Result of biometric authentication attempt
 */
export interface BiometricAuthResult {
  success: boolean;
  error?: string;
}

// =============================================================================
// DATABASE RECORD TYPES
// =============================================================================

/**
 * Activity record as stored in SQLite database
 */
export interface ActivityRecord {
  id: string;
  type: 'auth' | 'pay';
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

/**
 * Subscription record as stored in SQLite database
 */
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

/**
 * Nostr relay configuration
 */
export interface NostrRelay {
  ws_uri: string;
  created_at: number;
}

/**
 * Service name cache record
 */
export interface NameCacheRecord {
  service_pubkey: string;
  service_name: string;
  expires_at: number; // Unix timestamp in seconds
  created_at: number; // Unix timestamp in seconds
}

/**
 * Stored pending request record
 */
export interface StoredPendingRequest {
  id: string;
  request_id: string;
  approved: boolean;
  created_at: Date;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Generic response wrapper for API calls
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Generic loading state wrapper
 */
export interface LoadingState<T = unknown> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Common pagination parameters
 */
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T = unknown> {
  data: T[];
  totalCount: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}
