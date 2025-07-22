import React, { useEffect, useState, useRef } from 'react';
import { Text, View, SafeAreaView, Button, Platform } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { OnboardingProvider, useOnboarding } from '@/context/OnboardingContext';
import { UserProfileProvider } from '@/context/UserProfileContext';
import { PendingRequestsProvider } from '@/context/PendingRequestsContext';
import { DeeplinkProvider } from '@/context/DeeplinkContext';
import { ActivitiesProvider } from '@/context/ActivitiesContext';
import { DatabaseProvider } from '@/services/database/DatabaseProvider';
import { MnemonicProvider, useMnemonic } from '@/context/MnemonicContext';
import NostrServiceProvider, { useNostrService } from '@/context/NostrServiceContext';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '@/constants/Colors';
import { Asset } from 'expo-asset';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { CurrencyProvider } from '@/context/CurrencyContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import registerPubkeysForPushNotificationsAsync from '@/services/NotificationService'
import * as TaskManager from 'expo-task-manager';
import { keyToHex } from 'portal-app-lib';
import * as Notifications from 'expo-notifications';

import { ECashProvider } from '@/context/ECashContext';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND-NOTIFICATION-TASK';

TaskManager.defineTask<Notifications.NotificationTaskPayload>(BACKGROUND_NOTIFICATION_TASK, async ({ data, error, executionInfo }) => {
  console.log('Received a notification task payload!');
  console.error('error: ', error);
  const isNotificationResponse = 'actionIdentifier' in data;
  if (isNotificationResponse) {
    // Do something with the notification response from user
  } else {
    // Do something with the data from notification that was received
  }
});


const NotificationConfigurator = () => {
  const { publicKey } = useNostrService();

  useEffect(() => {
    if (publicKey) {
      console.log('sto per registrarmi');
      registerPubkeysForPushNotificationsAsync([keyToHex(publicKey)]).catch((error: any) => {
        console.error('Error registering for push notifications:', error);
      });
      Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
    }

    const notificationListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response received:', response);
    });

    return () => {
      notificationListener.remove();
      responseListener.remove();
    };
  }, [publicKey]);

  return null;
};

// Function to preload images for performance
const preloadImages = async () => {
  try {
    // Preload any local assets needed on startup
    const assetPromises = [
      Asset.loadAsync(require('../assets/images/appLogo.png')),
      // Add any other assets that need to be preloaded here
    ];

    await Promise.all(assetPromises);
    console.log('Assets preloaded successfully');
  } catch (error) {
    console.error('Error preloading assets:', error);
  }
};

// Status bar wrapper that respects theme
const ThemedStatusBar = () => {
  const { currentTheme } = useTheme();

  return (
    <StatusBar
      style={currentTheme === 'light' ? 'dark' : 'light'}
      backgroundColor={currentTheme === 'light' ? Colors.light.background : Colors.dark.background}
    />
  );
};

// Loading screen content that respects theme
const LoadingScreenContent = () => {
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor }}>
      <ThemedStatusBar />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: textColor }}>Loading...</Text>
      </View>
    </SafeAreaView>
  );
};

// AuthenticatedAppContent renders the actual app content after authentication checks
const AuthenticatedAppContent = () => {
  const { isOnboardingComplete, isLoading: onboardingLoading } = useOnboarding();
  const { mnemonic, walletUrl, isLoading: mnemonicLoading } = useMnemonic();

  // Don't render anything until both contexts are loaded
  // Let app/index.tsx handle the navigation logic
  if (onboardingLoading || mnemonicLoading) {
    return null; // Show nothing while loading - app/index.tsx will show loading indicator
  }

  return (
    <ECashProvider mnemonic={mnemonic || ''}>
      <NostrServiceProvider mnemonic={mnemonic || ''} walletUrl={walletUrl}>
        <UserProfileProvider>
          <ActivitiesProvider>
            <PendingRequestsProvider>
              <DeeplinkProvider>
                <NotificationConfigurator />
                <Stack screenOptions={{ headerShown: false }} />
              </DeeplinkProvider>
            </PendingRequestsProvider>
          </ActivitiesProvider>
        </UserProfileProvider>
      </NostrServiceProvider>
    </ECashProvider>
  );
};

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Preload required assets
        await preloadImages();

        // Increase delay to ensure all SecureStore operations complete on first launch
        await new Promise(resolve => setTimeout(resolve, 500));
        setIsReady(true);
      } catch (error) {
        console.error('Error preparing app:', error);
        // Set ready to true even on error to prevent infinite loading
        setIsReady(true);
      } finally {
        await SplashScreen.hideAsync();
      }
    }

    prepare();
  }, []);

  if (!isReady) {
    return (
      <ThemeProvider>
        <LoadingScreenContent />
      </ThemeProvider>
    );
  }

  return (
    <DatabaseProvider>
      <ThemeProvider>
        <CurrencyProvider>
          <ThemedRootView />
        </CurrencyProvider>
      </ThemeProvider>
    </DatabaseProvider>
  );
}

// Themed root view wrapper
const ThemedRootView = () => {
  const backgroundColor = useThemeColor({}, 'background');

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor }}>
      <ThemedStatusBar />
      <MnemonicProvider>
        <OnboardingProvider>
          <AuthenticatedAppContent />
        </OnboardingProvider>
      </MnemonicProvider>
    </GestureHandlerRootView>
  );
};
