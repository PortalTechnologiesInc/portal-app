import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getMnemonic } from './SecureStorageService';
import { PortalAppManager } from './PortalAppManager';
import { AuthChallengeEvent, AuthResponseStatus, CloseRecurringPaymentResponse, Currency_Tags, Mnemonic, PaymentResponseContent, RecurringPaymentRequest, RecurringPaymentResponseContent, SinglePaymentRequest } from 'portal-app-lib';
import { DatabaseService } from './database';
import { LocalAuthChallengeListener, LocalClosedRecurringPaymentListener, LocalPaymentRequestListener } from '@/context/NostrServiceContext';
import { handleAuthChallenge, handleCloseRecurringPaymentResponse, handleRecurringPaymentRequest, handleSinglePaymentRequest } from './EventFilters';
import { openDatabaseAsync } from 'expo-sqlite';
import { DATABASE_NAME } from './database/DatabaseProvider';

const EXPO_PUSH_TOKEN_KEY = "expo_push_token_key"

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
    console.log('new expoPushToken setted: ', expoPushToken)
  } catch (e) {
    // Silent fail - this is not critical
    console.error('Failed to update the new expoPushToken in the app storage. The subscription to the notification service will be triggered again in the next app startup. The error is:', e);
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
  alert(errorMessage);
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
      console.error("Error while subscribing for notifications: ", e);
      handleRegistrationError(`${e}`);
    }
  } else {
    handleRegistrationError('Must use physical device for push notifications');
  }
}

export async function handleHeadlessNotification(event: String) {
  console.warn('0');
  // initLogger(new Logger(), LogLevel.Trace)
  try {

    const abortController = new AbortController();
    let mnemonic = await getMnemonic();
    if (!mnemonic) return;

    // Create Mnemonic object
    const mnemonicObj = new Mnemonic(mnemonic);
    const keypair = mnemonicObj.getKeypair();

    // Properly initialize SQLite database
    const sqlite = await openDatabaseAsync(DATABASE_NAME);
    const DB = new DatabaseService(sqlite);
    let relays = (await DB.getRelays()).map(relay => relay.ws_uri);

    let app = await PortalAppManager.getTemporaryInstance(keypair, relays);

    // TODO here inject the nostr event in the app lib


    app.listen({ signal: abortController.signal });

    console.warn("adding listeners");
    try {
      // await fetch('https://notifications.getportal.cc/', {
      await fetch('http://localhost:8000/', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (e) {
      console.error('Failed to send push token to server', e);
      return;
    }
    // Listen for closed recurring payments
    app.listenClosedRecurringPayment(new LocalClosedRecurringPaymentListener(
      (response: CloseRecurringPaymentResponse) => {
        console.log('Closed subscription received', response);
        return new Promise<void>(resolve => {
          handleCloseRecurringPaymentResponse(response, DB, resolve).then(askUser => { /* NOOP */ });
          abortController.abort();
        })
      }
    )).catch(e => {
      console.error('Error listening for recurring payments closing.', e);
    });
    console.warn("adding listeners 2");

    app.listenForPaymentRequest(
      new LocalPaymentRequestListener(
        (request: SinglePaymentRequest) => {
          const id = request.eventId;

          console.log(`Single payment request with id ${id} received`, request);

          return new Promise<PaymentResponseContent>(resolve => {
            handleSinglePaymentRequest(request, DB, resolve)
              .then(askUser => {
                if (askUser) {
                  // Show notification to user for manual approval
                  Notifications.scheduleNotificationAsync({
                    content: {
                      title: 'Payment Request',
                      body: `Payment request for ${request.content.amount} ${request.content.currency.tag === Currency_Tags.Fiat && request.content.currency.inner} requires approval`,
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
            abortController.abort();
          });
        },
        (request: RecurringPaymentRequest) => {
          const id = request.eventId;

          console.log(`Recurring payment request with id ${id} received`, request);

          return new Promise<RecurringPaymentResponseContent>(resolve => {
            handleRecurringPaymentRequest(request, DB, resolve)
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
            abortController.abort();
          });
        }
      )
    ).catch(e => {
      console.error('Error listening for payment request', e);
      // TODO: re-initialize the app
    });

    app
      .listenForAuthChallenge(
        new LocalAuthChallengeListener((event: AuthChallengeEvent) => {
          const id = event.eventId;

          console.log(`Auth challenge with id ${id} received`, event);

          return new Promise<AuthResponseStatus>(resolve => {
            handleAuthChallenge(event, DB, resolve)
              .then(askUser => {
                Notifications.scheduleNotificationAsync({
                  content: {
                    title: 'Subscription Request',
                    body: `Authentication request from ${event.recipient} requires approval`,
                    data: {
                      type: 'authentication_request',
                      requestId: id,
                    },
                  },
                  trigger: null, // Show immediately
                });
              });
            abortController.abort();
          });
        })
      )
      .catch(e => {
        console.error('Error listening for auth challenge', e);
        // TODO: re-initialize the app
      });
    console.warn("adding listeners end");
  } catch (e) {
    console.error(e);
  }
}