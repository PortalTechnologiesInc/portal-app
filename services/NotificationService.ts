import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const EXPO_PUSH_TOKEN_KEY = 'expo_push_token_key';

async function subscribeToNotificationService(expoPushToken: string, pubkeys: string[]) {
  const lastExpoPushNotificationToken = await SecureStore.getItemAsync(EXPO_PUSH_TOKEN_KEY);
  // if (expoPushToken == lastExpoPushNotificationToken) {
  //     return;
  // }

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
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function handleRegistrationError(errorMessage: string) {
  alert(errorMessage);
  throw new Error(errorMessage);
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
    console.log('Must use physical device for push notifications');
  }
}
