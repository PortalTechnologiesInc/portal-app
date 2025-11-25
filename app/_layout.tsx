import React, { useEffect, useState, Suspense } from 'react';
import { Text, View, SafeAreaView, Button, Platform, AppState } from 'react-native';
import { Stack, usePathname, useGlobalSearchParams } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { OnboardingProvider, useOnboarding } from '@/context/OnboardingContext';
import { UserProfileProvider } from '@/context/UserProfileContext';
import { PendingRequestsProvider } from '@/context/PendingRequestsContext';
import { DeeplinkProvider } from '@/context/DeeplinkContext';
import { ActivitiesProvider } from '@/context/ActivitiesContext';
import { DatabaseProvider } from '@/context/DatabaseContext';
import { KeyProvider, useKey } from '@/context/KeyContext';
import NostrServiceProvider, { useNostrService } from '@/context/NostrServiceContext';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '@/constants/Colors';
import { Asset } from 'expo-asset';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { CurrencyProvider } from '@/context/CurrencyContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import registerPubkeysForPushNotificationsAsync from '@/services/NotificationService';
import { keyToHex } from 'portal-app-lib';
import * as Notifications from 'expo-notifications';
import { ECashProvider } from '@/context/ECashContext';
import { SQLiteProvider } from 'expo-sqlite';
import migrateDbIfNeeded from '@/migrations/DatabaseMigrations';
import { PaymentControllerProvider } from '@/context/PaymentControllerContext';
import { AppLockProvider } from '@/context/AppLockContext';
import { AppLockScreen } from '@/components/AppLockScreen';
import { AppLifecycleHandler } from '@/components/AppLifecycleHandler';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

// Database name constant to ensure consistency
export const DATABASE_NAME = 'portal-app.db';

const NotificationConfigurator = () => {
  const { publicKey } = useNostrService();

  useEffect(() => {
    if (publicKey) {
      registerPubkeysForPushNotificationsAsync([keyToHex(publicKey)]).catch((error: any) => {
        console.error('Error registering for push notifications:', error);
      });
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
  const { isLoading: onboardingLoading } = useOnboarding();
  const { mnemonic, nsec, walletUrl, isLoading } = useKey();
  const backgroundColor = useThemeColor({}, 'background');

  // Show loading screen with proper background while contexts are loading
  if (onboardingLoading || isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor }}>
        <LoadingScreenContent />
      </View>
    );
  }

  return (
    <ECashProvider mnemonic={mnemonic || ''} nsec={nsec || ''}>
      <NostrServiceProvider mnemonic={mnemonic || ''} nsec={nsec || ''} walletUrl={walletUrl}>
        <UserProfileProvider>
          <ActivitiesProvider>
            <PendingRequestsProvider>
              <PaymentControllerProvider>
                <DeeplinkProvider>
                  <NotificationConfigurator />
                  <Stack screenOptions={{ headerShown: false }} />
                </DeeplinkProvider>
              </PaymentControllerProvider>
            </PendingRequestsProvider>
          </ActivitiesProvider>
        </UserProfileProvider>
      </NostrServiceProvider>
    </ECashProvider>
  );
};

// Themed root view wrapper
const ThemedRootView = () => {
  const backgroundColor = useThemeColor({}, 'background');

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor }}>
      <ThemedStatusBar />
      <AppLockProvider>
        <OnboardingProvider>
          <AppLifecycleHandler />
          <AuthenticatedAppContent />
        </OnboardingProvider>
        <AppLockScreen />
      </AppLockProvider>
    </GestureHandlerRootView>
  );
};

export default function RootLayout() {
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams();

  useEffect(() => {
    if (pathname) {
      const entries: [string, string][] = Object.entries(globalParams).flatMap(
        ([key, value]) => {
          if (value === undefined) return [];
          return Array.isArray(value)
            ? value.map(v => [key, String(v)] as [string, string])
            : ([[key, String(value)] as [string, string]]);
        }
      );
      const queryString = new URLSearchParams(entries).toString();
      const fullPath = queryString ? `${pathname}?${queryString}` : pathname;
      console.log('[Route]', fullPath);
    }
  }, [pathname, globalParams]);

  useEffect(() => {
    async function prepare() {
      try {
        // Preload required assets
        await preloadImages();

        // Increase delay to ensure all SecureStore operations complete on first launch
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error('Error preparing app:', error);
        // Set ready to true even on error to prevent infinite loading
      } finally {
        await SplashScreen.hideAsync();
      }
    }

    prepare();
  }, []);

  // Suspense fallback with splash screen background to prevent white flash
  const SuspenseFallback = () => {
    return (
      <View style={{ flex: 1, backgroundColor: '#141416' }}>
        <StatusBar style="light" backgroundColor="#141416" />
      </View>
    );
  };

  return (
    <Suspense fallback={<SuspenseFallback />}>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded} useSuspense={true}>
        <KeyProvider>
          <DatabaseProvider>
            <ThemeProvider>
              <CurrencyProvider>
                <ThemedRootView />
              </CurrencyProvider>
            </ThemeProvider>
          </DatabaseProvider>
        </KeyProvider>
      </SQLiteProvider>
    </Suspense>
  );
}
