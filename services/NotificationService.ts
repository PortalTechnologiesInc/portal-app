import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { openDatabaseAsync } from 'expo-sqlite';
import {
  Currency_Tags,
  Mnemonic,
  PortalApp,
  type PortalAppInterface,
  parseBolt11,
  type RelayStatusListener,
  type SinglePaymentRequest,
} from 'portal-app-lib';
import type { RefObject } from 'react';
import { Platform } from 'react-native';
import {
  listenForAuthChallenge,
  listenForCashuDirect,
  listenForCashuRequest,
  listenForDeletedSubscription,
  listenForNostrConnectRequest,
  listenForPaymentRequest,
} from '@/listeners/NostrEventsListeners';
import type { Wallet } from '@/models/WalletType';
import { RelayStatusesProvider } from '@/queue/providers/RelayStatus';
import { ProviderRepository } from '@/queue/WorkQueue';
import type { RelayInfo } from '@/utils/common';
import { getServiceNameFromProfile, mapNumericStatusToString } from '@/utils/nostrHelper';
import { DatabaseService } from './DatabaseService';
import { NwcService } from './NwcService';
import { PortalAppManager } from './PortalAppManager';
import { getMnemonic, getWalletUrl } from './SecureStorageService';

const EXPO_PUSH_TOKEN_KEY = 'expo_push_token_key';

/**
 * Sends a local notification immediately.
 * This is a reusable abstraction for sending notifications independently of the prompt user flow.
 * @param content - The notification content to display
 */
export async function sendNotification(
  content: Notifications.NotificationContentInput
): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content,
      trigger: null, // Show immediately
    });
  } catch (error) {
    console.error('Failed to send notification:', error);
    // Re-throw to allow callers to handle errors if needed
    throw error;
  }
}

async function subscribeToNotificationService(expoPushToken: string, pubkeys: string[]) {
  const lastExpoPushNotificationToken = await SecureStore.getItemAsync(EXPO_PUSH_TOKEN_KEY);
  if (expoPushToken === lastExpoPushNotificationToken) {
    return;
  }

  // right now the api accept only one pubkey, in the future it should accept a list of pubkeys
  try {
    await fetch('https://notifications.getportal.cc/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pubkey: pubkeys[0],
        expo_push_token: expoPushToken,
      }),
    });
  } catch (_e) {
    return;
  }
  try {
    await SecureStore.deleteItemAsync(EXPO_PUSH_TOKEN_KEY);
    await SecureStore.setItemAsync(EXPO_PUSH_TOKEN_KEY, expoPushToken);
  } catch (_e) {}
}

Notifications.setNotificationHandler({
  handleNotification: async notification => {
    // Allow showing only specific local notifications; keep others silent
    const data = (notification.request?.content?.data || {}) as any;
    const type = data?.type;

    const isAmountExceededNotification = type === 'payment_request_exceeded_tolerance';

    if (isAmountExceededNotification) {
      return {
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    }

    return {
      shouldShowAlert: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: false,
    };
  },
});

function handleRegistrationError(_errorMessage: string) {}

/**
 * Formats the expected amount from a payment request for display in notifications
 */
function formatExpectedAmount(
  amount: number | bigint,
  currency: any
): { amount: string; currency: string } | null {
  if (currency.tag === Currency_Tags.Millisats) {
    const expectedMsat = typeof amount === 'bigint' ? Number(amount) : amount;
    const expectedSats = expectedMsat / 1000;
    return { amount: expectedSats.toString(), currency: 'sats' };
  } else if (currency.tag === Currency_Tags.Fiat) {
    const fiatCurrencyRaw = currency.inner;
    const fiatCurrencyValue = Array.isArray(fiatCurrencyRaw) ? fiatCurrencyRaw[0] : fiatCurrencyRaw;
    const fiatCurrency =
      typeof fiatCurrencyValue === 'string' ? String(fiatCurrencyValue).toUpperCase() : 'UNKNOWN';
    const normalizedAmount = (typeof amount === 'bigint' ? Number(amount) : amount) / 100;
    return { amount: normalizedAmount.toString(), currency: fiatCurrency };
  }
  return null;
}

/**
 * Gets the service name from cache, falling back to network fetch, then default value
 */
async function getServiceNameForNotification(
  serviceKey: string,
  app: PortalAppInterface,
  executeOperation: <T>(operation: (db: DatabaseService) => Promise<T>, fallback?: T) => Promise<T>
): Promise<string> {
  try {
    // Step 1: Check cache first
    const cachedName = await executeOperation(db => db.getCachedServiceName(serviceKey), null);
    if (cachedName) {
      return cachedName;
    }

    // Step 2: Fetch from network if not in cache
    try {
      const profile = await app.fetchProfile(serviceKey);
      const serviceName = getServiceNameFromProfile(profile);

      if (serviceName) {
        // Cache the result for future use
        await executeOperation(db => db.setCachedServiceName(serviceKey, serviceName), null);
        return serviceName;
      }
    } catch (_fetchError) {}

    // Step 3: Fallback to default
    return 'Unknown Service';
  } catch (_error) {
    return 'Unknown Service';
  }
}

export const AMOUNT_MISMATCH_REJECTION_REASON =
  'Invoice amount does not match the requested amount.';

/**
 * Sends a local notification when a payment request is auto-rejected due to amount mismatch.
 * Shared between headless (background) and foreground flows.
 */
export async function sendPaymentAmountMismatchNotification(
  request: SinglePaymentRequest,
  executeOperation: <T>(operation: (db: DatabaseService) => Promise<T>, fallback?: T) => Promise<T>,
  app: PortalAppInterface
): Promise<void> {
  try {
    const invoiceData = parseBolt11(request.content.invoice);
    const invoiceAmountMsat = Number(invoiceData.amountMsat);

    const formattedAmount = formatExpectedAmount(request.content.amount, request.content.currency);

    let serviceName = 'Unknown Service';
    try {
      serviceName = await getServiceNameForNotification(request.serviceKey, app, executeOperation);
    } catch (_error) {}

    const body = formattedAmount
      ? `${serviceName} requested more than the expected amount (${formattedAmount.amount} ${formattedAmount.currency}). The request was automatically rejected.`
      : `${serviceName} requested more than the expected amount. The request was automatically rejected.`;

    const expectedAmountValue =
      typeof request.content.amount === 'bigint'
        ? request.content.amount.toString()
        : String(request.content.amount);
    const currencyTagValue = String((request.content.currency as any).tag);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Payment request auto-rejected',
        body,
        data: {
          type: 'payment_request_exceeded_tolerance',
          invoiceAmountMsat: String(invoiceAmountMsat),
          expectedAmount: expectedAmountValue,
          currencyTag: currencyTagValue,
        },
      },
      trigger: null,
    });
  } catch (_error) {}
}

export default async function registerPubkeysForPushNotificationsAsync(pubkeys: string[]) {
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      handleRegistrationError('Permission not granted to get push token for push notification!');
      return;
    }
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) {
      handleRegistrationError('Project ID not found');
    }
    try {
      const pushTokenString = (
        await Notifications.getExpoPushTokenAsync({
          projectId: projectId,
        })
      ).data;
      subscribeToNotificationService(pushTokenString, pubkeys);
    } catch (e: unknown) {
      handleRegistrationError(`${e}`);
    }
  } else {
  }
}

export async function handleHeadlessNotification(_event: string, databaseName: string) {
  try {
    const abortController = new AbortController();
    const mnemonic = await getMnemonic();
    if (!mnemonic) return;

    // Create Mnemonic object
    const mnemonicObj = new Mnemonic(mnemonic);
    const keypair = mnemonicObj.getKeypair();

    const notifyBackgroundError = async (title: string, detail: unknown) => {
      const rawMessage =
        detail instanceof Error
          ? detail.message
          : typeof detail === 'string'
            ? detail
            : detail !== undefined && detail !== null
              ? String(detail)
              : 'Unknown error';
      const body = rawMessage.length > 160 ? `${rawMessage.slice(0, 157)}...` : rawMessage;

      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            data: {
              type: 'background_error',
            },
          },
          trigger: null,
        });
      } catch {
        // Intentionally swallow notification errors to avoid recursive failures
      }
    };

    // Get relays using the executeOperationForNotification helper
    const notificationRelays = ['wss://relay.getportal.cc'];

    let relayListener: NotificationRelayStatusListener;
    try {
      // Properly initialize SQLite database
      const sqlite = await openDatabaseAsync(databaseName);
      const db = new DatabaseService(sqlite);
      relayListener = new NotificationRelayStatusListener(db);
    } catch (error: any) {
      throw error;
    }

    let nwcWallet: Wallet | null = null;
    try {
      const walletUrl = (await getWalletUrl()).trim();
      if (walletUrl) {
        const _nwcRelayListener: RelayStatusListener = {
          onRelayStatusChange: async (_relay_url: string, status: number): Promise<void> => {
            const _statusString = mapNumericStatusToString(status);
          },
        };

        nwcWallet = await NwcService.create(walletUrl);
      }
    } catch (error) {
      console.error('NWC initialization failed', error);
      await notifyBackgroundError('NWC initialization failed', error);
    }

    const app = await PortalApp.create(keypair, notificationRelays, relayListener);
    app.listen({ signal: abortController.signal });

    listenForCashuDirect(app);
    listenForCashuRequest(app);
    listenForAuthChallenge(app);
    listenForPaymentRequest(app);
    listenForDeletedSubscription(app);
    listenForNostrConnectRequest(app, keypair.publicKey());
  } catch (e) {
    console.error(e);
  }
}
class NotificationRelayStatusListener implements RelayStatusListener {
  db: DatabaseService;
  private relayStatuses: RefObject<RelayInfo[]> = { current: [] };
  private removedRelays: Set<string> = new Set();
  private lastReconnectAttempts: Map<string, number> = new Map();

  public constructor(db: DatabaseService) {
    this.db = db;
    ProviderRepository.register(
      new RelayStatusesProvider(this.relayStatuses),
      'RelayStatusesProvider'
    );
  }

  getRelayStatuses(): RelayInfo[] {
    return [...this.relayStatuses.current];
  }

  getRemovedRelays(): Set<string> {
    return new Set(this.removedRelays);
  }

  getLastReconnectAttempts(): Map<string, number> {
    return new Map(this.lastReconnectAttempts);
  }

  isRelayRemoved(relayUrl: string): boolean {
    return this.removedRelays.has(relayUrl);
  }

  markRelayAsRemoved(relayUrl: string): void {
    this.removedRelays.add(relayUrl);
  }

  clearRemovedRelay(relayUrl: string): void {
    this.removedRelays.delete(relayUrl);
  }
  onRelayStatusChange(relay_url: string, status: number): Promise<void> {
    return this.db.getRelays().then(relays => {
      const statusString = mapNumericStatusToString(status);

      if (!relays.map(r => r.ws_uri).includes(relay_url)) {
        return;
      }

      // Check if this relay has been marked as removed by user
      if (this.removedRelays.has(relay_url)) {
        // Don't add removed relays back to the status list
        this.relayStatuses.current = this.relayStatuses.current.filter(
          relay => relay.url !== relay_url
        );
        return;
      }

      // Reset reconnection attempts tracker when relay connects successfully
      if (status === 3) {
        // Connected - clear both manual and auto reconnection attempts
        this.lastReconnectAttempts.delete(relay_url);
        this.lastReconnectAttempts.delete(`auto_${relay_url}`);
      }

      // Auto-reconnect logic for terminated/disconnected relays
      if (status === 5 || status === 4) {
        // Terminated or Disconnected
        const now = Date.now();
        const lastAutoAttempt = this.lastReconnectAttempts.get(`auto_${relay_url}`) || 0;
        const timeSinceLastAutoAttempt = now - lastAutoAttempt;

        // Only attempt auto-reconnection if more than 10 seconds have passed since last auto-attempt
        if (timeSinceLastAutoAttempt > 10000) {
          this.lastReconnectAttempts.set(`auto_${relay_url}`, now);

          // Use setTimeout to avoid blocking the status update
          setTimeout(async () => {
            try {
              await PortalAppManager.tryGetInstance().reconnectRelay(relay_url);
            } catch (_error) {}
          }, 2000);
        }
      }

      const index = this.relayStatuses.current.findIndex(relay => relay.url === relay_url);
      let newStatuses: RelayInfo[];

      // If relay is not in the list, add it
      if (index === -1) {
        newStatuses = [
          ...this.relayStatuses.current,
          { url: relay_url, status: statusString, connected: status === 3 },
        ];
      }
      // Otherwise, update the relay list
      else {
        newStatuses = [
          ...this.relayStatuses.current.slice(0, index),
          { url: relay_url, status: statusString, connected: status === 3 },
          ...this.relayStatuses.current.slice(index + 1),
        ];
      }

      this.relayStatuses.current = newStatuses;
      return Promise.resolve();
    });
  }
}
