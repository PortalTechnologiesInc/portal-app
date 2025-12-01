import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform, AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getMnemonic, getWalletUrl } from './SecureStorageService';
import {
  AuthChallengeEvent,
  AuthResponseStatus,
  CloseRecurringPaymentResponse,
  Currency_Tags,
  Mnemonic,
  Nwc,
  PaymentResponseContent,
  PaymentStatus,
  PaymentStatusNotifier,
  PortalApp,
  PortalAppInterface,
  RecurringPaymentRequest,
  RecurringPaymentResponseContent,
  RecurringPaymentStatus,
  RelayStatusListener,
  RelayStatusListenerImpl,
  SinglePaymentRequest,
  parseBolt11,
} from 'portal-app-lib';
import { openDatabaseAsync } from 'expo-sqlite';
import { DatabaseService } from './DatabaseService';
import { PortalAppManager } from './PortalAppManager';
import { LocalAuthChallengeListener, LocalClosedRecurringPaymentListener, LocalPaymentRequestListener } from '@/context/NostrServiceContext';
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

function handleRegistrationError(errorMessage: string) {
  console.error(errorMessage);
}

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
    const fiatCurrencyValue = Array.isArray(fiatCurrencyRaw)
      ? fiatCurrencyRaw[0]
      : fiatCurrencyRaw;
    const fiatCurrency =
      typeof fiatCurrencyValue === 'string'
        ? String(fiatCurrencyValue).toUpperCase()
        : 'UNKNOWN';
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
    const cachedName = await executeOperation(
      db => db.getCachedServiceName(serviceKey),
      null
    );
    if (cachedName) {
      return cachedName;
    }

    // Step 2: Fetch from network if not in cache
    try {
      const profile = await app.fetchProfile(serviceKey);
      const serviceName = getServiceNameFromProfile(profile);
      
      if (serviceName) {
        // Cache the result for future use
        await executeOperation(
          db => db.setCachedServiceName(serviceKey, serviceName),
          null
        );
        return serviceName;
      }
    } catch (fetchError) {
      // Network fetch failed, continue to fallback
      console.error('Failed to fetch service name from network for auto-reject notification:', fetchError);
    }

    // Step 3: Fallback to default
    return 'Unknown Service';
  } catch (error) {
    console.error('Failed to resolve service name for auto-reject notification:', error);
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
  executeOperation: <T>(
    operation: (db: DatabaseService) => Promise<T>,
    fallback?: T
  ) => Promise<T>,
  app: PortalAppInterface
): Promise<void> {
  try {
    const invoiceData = parseBolt11(request.content.invoice);
    const invoiceAmountMsat = Number(invoiceData.amountMsat);

    const formattedAmount = formatExpectedAmount(
      request.content.amount,
      request.content.currency
    );

    let serviceName = 'Unknown Service';
    try {
      serviceName = await getServiceNameForNotification(
        request.serviceKey,
        app,
        executeOperation
      );
    } catch (error) {
      console.error(
        'Failed to resolve service name for payment amount mismatch notification:',
        error
      );
    }

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
  } catch (error) {
    console.error(
      'Failed to send auto-reject notification for payment amount mismatch:',
      error
    );
  }
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

    // Listen for closed recurring payments
    app.listenClosedRecurringPayment(new LocalClosedRecurringPaymentListener(
      async (response: CloseRecurringPaymentResponse) => {
        console.log('Closed subscription received', response);
        const resolver = async () => { /* NOOP */ };
        await handleCloseRecurringPaymentResponse(response, executeOperationForNotification, resolver);
        abortController.abort();
      }
    )).catch(async e => {
      await notifyBackgroundError('Recurring payment listener error', e);
    });

    app.listenForPaymentRequest(
      new LocalPaymentRequestListener(
        async (request: SinglePaymentRequest, notifier: PaymentStatusNotifier) => {
          const id = request.eventId;

          const alreadyTracked = await executeOperationForNotification(
            db => db.markNotificationEventProcessed(id),
            false
          );
          if (alreadyTracked) {
            return;
          }

          console.log(`Single payment request with id ${id} received`, request);

          const resolver = function(status: PaymentStatus) {
            // Check if this is a rejection due to amount mismatch
            const statusTag = (status as any).tag;
            const statusInner = (status as any).inner;
            const isRejected =
              statusTag === 'Rejected' || status instanceof PaymentStatus.Rejected;
            const reason = statusInner?.reason;

            if (isRejected && reason === AMOUNT_MISMATCH_REJECTION_REASON) {
              (async () => {
                await sendPaymentAmountMismatchNotification(
                  request,
                  executeOperationForNotification,
                  app
                );
              })();
            }

            // Always notify the notifier (this is the original resolver behavior)
            notifier.notify({
              status,
              requestId: request.content.requestId,
            }).catch(error => {
              console.error('Error notifying payment status:', error);
            });
          };

          let preferredCurrency: Currency = Currency.SATS;
          const savedCurrency = await AsyncStorage.getItem('preferred_currency');
          if (savedCurrency && CurrencyHelpers.isValidCurrency(savedCurrency)) {
            preferredCurrency = savedCurrency;
          }

          await handleSinglePaymentRequest(
            nwcWallet,
            request,
            preferredCurrency,
            executeOperationForNotification,
            resolver,
            true
          );

          abortController.abort();
        },
        async (request: RecurringPaymentRequest): Promise<RecurringPaymentResponseContent> => {
          const id = request.eventId;

          const alreadyTracked = await executeOperationForNotification(
            db => db.markNotificationEventProcessed(id),
            false
          );
          if (alreadyTracked) {
            return new Promise<RecurringPaymentResponseContent>(resolve => {
              // Ignore
            });
          }

          console.log(`Recurring payment request with id ${id} received`, request);

          return new Promise<RecurringPaymentResponseContent>(resolve => {
            handleRecurringPaymentRequest(request, executeOperationForNotification, resolve)
              .then(askUser => {
                if (askUser) {
                  // Show notification to user for manual approval
                  Notifications.scheduleNotificationAsync({
                    content: {
                      title: 'Subscription Request',
                      body: `Subscription request for ${request.content.amount} ${request.content.currency.tag === Currency_Tags.Fiat && request.content.currency.inner} to ${request.recipient} requires approval`,
                      data: {
                        type: 'payment_request',
                        requestId: id,
                        amount: request.content.amount,
                      },
                    },
                    trigger: null, // Show immediately
                  });
                }
              })
              .finally(() => {
                abortController.abort();
              });
          });
        }
      )
    ).catch(async (e: any) => {
      await notifyBackgroundError('Payment request listener error', e);
      // TODO: re-initialize the app
    });

    app
      .listenForAuthChallenge(
        new LocalAuthChallengeListener(async (event: AuthChallengeEvent) => {
          const id = event.eventId;

          const alreadyTracked = await executeOperationForNotification(
            db => db.markNotificationEventProcessed(id),
            false
          );
          if (alreadyTracked) {
            return new Promise<AuthResponseStatus>(resolve => {
              // Ignore
            });
          }

          console.log(`Auth challenge with id ${id} received`, event);

          return new Promise<AuthResponseStatus>(resolve => {
            handleAuthChallenge(event, executeOperationForNotification, resolve)
              .then(askUser => {
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
              })
              .finally(() => {
                abortController.abort();
              });
          });
        })
      )
      .catch(async (e: any) => {
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
