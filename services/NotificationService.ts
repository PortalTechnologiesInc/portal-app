import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getMnemonic, getWalletUrl } from './SecureStorageService';
import { AuthResponseStatus, Currency_Tags, Mnemonic, Nwc, PaymentStatus, PortalApp, RecurringPaymentRequest, RecurringPaymentResponseContent, RelayStatusListener, SinglePaymentRequest } from 'portal-app-lib';
import { openDatabaseAsync } from 'expo-sqlite';
import { DatabaseService } from './DatabaseService';
import { PortalAppManager } from './PortalAppManager';
import { handleAuthChallenge, handleCloseRecurringPaymentResponse, handleRecurringPaymentRequest, handleSinglePaymentRequest } from './EventFilters';
import { mapNumericStatusToString, getServiceNameFromProfile } from '@/utils/nostrHelper';
import { RelayInfo } from '@/utils/common';
import { Currency, CurrencyHelpers } from '@/utils/currency';
import AsyncStorage from '@react-native-async-storage/async-storage';

const EXPO_PUSH_TOKEN_KEY = 'expo_push_token_key';

async function subscribeToNotificationService(expoPushToken: string, pubkeys: string[]) {
  const lastExpoPushNotificationToken = await SecureStore.getItemAsync(EXPO_PUSH_TOKEN_KEY);
  if (expoPushToken == lastExpoPushNotificationToken) {
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
  } catch (e) {
    console.error('Failed to send push token to server', e);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(EXPO_PUSH_TOKEN_KEY);
    await SecureStore.setItemAsync(EXPO_PUSH_TOKEN_KEY, expoPushToken);
    console.log('new expoPushToken setted: ', expoPushToken);
  } catch (e) {
    // Silent fail - this is not critical
    console.error(
      'Failed to update the new expoPushToken in the app storage. The subscription to the notification service will be triggered again in the next app startup. The error is:',
      e
    );
  }
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

function handleRegistrationError(errorMessage: string) {
  console.error(errorMessage);
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
      console.error('Error while subscribing for notifications: ', e);
      handleRegistrationError(`${e}`);
    }
  } else {
    // Silently skip push notification registration on emulator/simulator
    console.log('Skipping push notification registration (emulator/simulator detected)');
  }
}

export async function handleHeadlessNotification(event: String, databaseName: string) {
  try {
    const abortController = new AbortController();
    let mnemonic = await getMnemonic();
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
      } catch (_notificationError) {
        // Intentionally swallow notification errors to avoid recursive failures
      }
    };

    let executeOperationForNotification = async <T,>(
      operation: (db: DatabaseService) => Promise<T>,
      fallback?: T
    ): Promise<T> => {
      try {
        // Properly initialize SQLite database
        const sqlite = await openDatabaseAsync(databaseName);
        const db = new DatabaseService(sqlite);
        return await operation(db);
      } catch (error: any) {
        // Handle "Access to closed resource" errors gracefully
        await notifyBackgroundError('Database operation failed', error?.message || error);
        if (fallback !== undefined) return fallback;
        throw error;
      }
    };

    // Get relays using the executeOperationForNotification helper
    const notificationRelays = ["wss://relay.getportal.cc"];

    let relayListener = await executeOperationForNotification(async (db) => new NotificationRelayStatusListener(db));

    let nwcWallet: Nwc | null = null;
    try {
      const walletUrl = (await getWalletUrl()).trim();
      if (walletUrl) {
        const nwcRelayListener: RelayStatusListener = {
          onRelayStatusChange: async (relay_url: string, status: number): Promise<void> => {
            const statusString = mapNumericStatusToString(status);
            console.log('💰 [NWC STATUS UPDATE] Relay:', relay_url, '→', statusString, `(${status})`);
          },
        };

        const walletInstance = new Nwc(walletUrl, nwcRelayListener);
        nwcWallet = walletInstance;
      } else {
        console.log(
          'Skipping NWC initialization during headless notification: no wallet URL configured'
        );
      }
    } catch (error) {
      await notifyBackgroundError('NWC initialization failed', error);
    }

    let app = await PortalApp.create(keypair, notificationRelays, relayListener);
    app.listen({ signal: abortController.signal });

    // Listen for closed recurring payments using new API pattern
    (async () => {
      while (true) {
        let event;
        try {
          event = await app.nextClosedRecurringPayment({ signal: abortController.signal });
        } catch (error) {
          // Abort signal or other error - break the loop
          break;
        }

        console.log('Closed subscription received', event);
        const resolver = async () => { /* NOOP */ };
        await handleCloseRecurringPaymentResponse(event, executeOperationForNotification, resolver);
        abortController.abort();
      }
    })().catch(async (e: any) => {
      await notifyBackgroundError('Recurring payment listener error', e);
    });

    // Listen for payment requests using new API pattern
    (async () => {
      while (true) {
        let result: any;
        try {
          result = await app.nextPaymentRequest({ signal: abortController.signal });
        } catch (error) {
          // Abort signal or other error - break the loop
          break;
        }

        // Handle single payment request (has notifier)
        if (result.notifier) {
          const event = result.event as SinglePaymentRequest;
          const notifier = result.notifier as any; // PaymentStatusNotifier type from library

          const id = event.eventId;
          const alreadyTracked = await executeOperationForNotification(
            db => db.markNotificationEventProcessed(id),
            false
          );
          if (alreadyTracked) {
            continue;
          }

          console.log(`Single payment request with id ${id} received`, event);

          const resolver = async (status: PaymentStatus) => {
            await notifier.notify({
              status,
              requestId: event.content.requestId,
            });
          };

          let preferredCurrency: Currency = Currency.SATS;
          const savedCurrency = await AsyncStorage.getItem('preferred_currency');
          if (savedCurrency && CurrencyHelpers.isValidCurrency(savedCurrency)) {
            preferredCurrency = savedCurrency;
          }

          await handleSinglePaymentRequest(
            nwcWallet,
            event,
            preferredCurrency,
            executeOperationForNotification,
            resolver,
            true
          );

          abortController.abort();
        }
        // Handle recurring payment request (no notifier)
        else {
          const event = result.event as RecurringPaymentRequest;

          const id = event.eventId;
          const alreadyTracked = await executeOperationForNotification(
            db => db.markNotificationEventProcessed(id),
            false
          );
          if (alreadyTracked) {
            continue;
          }

          console.log(`Recurring payment request with id ${id} received`, event);

          const resolve = (response: RecurringPaymentResponseContent) => {
            app.replyRecurringPaymentRequest(event, response);
          };

          await handleRecurringPaymentRequest(event, executeOperationForNotification, resolve).then(
            askUser => {
              if (askUser) {
                // Show notification to user for manual approval
                Notifications.scheduleNotificationAsync({
                  content: {
                    title: 'Subscription Request',
                    body: `Subscription request for ${event.content.amount} ${event.content.currency.tag === Currency_Tags.Fiat && event.content.currency.inner} to ${event.recipient} requires approval`,
                    data: {
                      type: 'payment_request',
                      requestId: id,
                      amount: event.content.amount,
                    },
                  },
                  trigger: null, // Show immediately
                });
              }
              abortController.abort();
            }
          );
        }
      }
    })().catch(async (e: any) => {
      await notifyBackgroundError('Payment request listener error', e);
    });

    // Listen for auth challenges using new API pattern
    (async () => {
      while (true) {
        let event;
        try {
          event = await app.nextAuthChallenge({ signal: abortController.signal });
        } catch (error) {
          // Abort signal or other error - break the loop
          break;
        }

        const id = event.eventId;
        const alreadyTracked = await executeOperationForNotification(
          db => db.markNotificationEventProcessed(id),
          false
        );
        if (alreadyTracked) {
          continue;
        }

        console.log(`Auth challenge with id ${id} received`, event);

        const resolve = (status: AuthResponseStatus) => {
          app.replyAuthChallenge(event, status);
        };

        await handleAuthChallenge(event, executeOperationForNotification, resolve).then(askUser => {
          if (askUser) {
            Notifications.scheduleNotificationAsync({
              content: {
                title: 'Authentication Request',
                body: `Authentication request requires approval`,
                data: {
                  type: 'authentication_request',
                  requestId: id,
                },
              },
              trigger: null, // Show immediately
            });
          }
          abortController.abort();
        });
      }
    })().catch(async (e: any) => {
      await notifyBackgroundError('Auth challenge listener error', e);
      // TODO: re-initialize the app
    });
  } catch (e) {
    console.error(e);
  }
}
class NotificationRelayStatusListener implements RelayStatusListener {
  db: DatabaseService;
  private relayStatuses: RelayInfo[] = [];
  private removedRelays: Set<string> = new Set();
  private lastReconnectAttempts: Map<string, number> = new Map();

  public constructor(db: DatabaseService) {
    this.db = db;
  }

  getRelayStatuses(): RelayInfo[] {
    return [...this.relayStatuses];
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
        console.log(
          '📡😒 [STATUS UPDATE IGNORED] Relay:',
          relay_url,
          '→',
          statusString,
          `(${status})`
        );
        return;
      }

      console.log('📡 [STATUS UPDATE] Relay:', relay_url, '→', statusString, `(${status})`);

      // Check if this relay has been marked as removed by user
      if (this.removedRelays.has(relay_url)) {
        // Don't add removed relays back to the status list
        this.relayStatuses = this.relayStatuses.filter(relay => relay.url !== relay_url);
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
            } catch (error) {
              console.error('❌ Auto-reconnect failed for relay:', relay_url, error);
            }
          }, 2000);
        }
      }

      const index = this.relayStatuses.findIndex(relay => relay.url === relay_url);
      let newStatuses: RelayInfo[];

      // If relay is not in the list, add it
      if (index === -1) {
        newStatuses = [
          ...this.relayStatuses,
          { url: relay_url, status: statusString, connected: status === 3 },
        ];
      }
      // Otherwise, update the relay list
      else {
        newStatuses = [
          ...this.relayStatuses.slice(0, index),
          { url: relay_url, status: statusString, connected: status === 3 },
          ...this.relayStatuses.slice(index + 1),
        ];
      }

      this.relayStatuses = newStatuses;

      return Promise.resolve();
    });
  }
}
