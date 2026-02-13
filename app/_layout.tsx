import { Asset } from 'expo-asset';
import * as Notifications from 'expo-notifications';
import { Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { keyToHex } from 'portal-app-lib';
import { Suspense, useEffect } from 'react';
import { SafeAreaView, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppLifecycleHandler } from '@/components/AppLifecycleHandler';
import { AppLockScreen } from '@/components/AppLockScreen';
import { DevTag } from '@/components/DevTag';
import { Colors } from '@/constants/Colors';
import { DATABASE_NAME } from '@/constants/Database';
import { ActivitiesProvider } from '@/context/ActivitiesContext';
import { AppLockProvider } from '@/context/AppLockContext';
import { CurrencyProvider } from '@/context/CurrencyContext';
import { DatabaseProvider } from '@/context/DatabaseContext';
import { DeeplinkProvider } from '@/context/DeeplinkContext';
import { ECashProvider } from '@/context/ECashContext';
import { KeyProvider, useKey } from '@/context/KeyContext';
import NostrServiceProvider, { useNostrService } from '@/context/NostrServiceContext';
import { OnboardingProvider, useOnboarding } from '@/context/OnboardingContext';
import { PaymentControllerProvider } from '@/context/PaymentControllerContext';
import { PendingRequestsProvider } from '@/context/PendingRequestsContext';
import { PortalAppProvider } from '@/context/PortalAppContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { UserProfileProvider } from '@/context/UserProfileContext';
import WalletManagerContextProvider from '@/context/WalletManagerContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import migrateDbIfNeeded from '@/migrations/DatabaseMigrations';
import registerPubkeysForPushNotificationsAsync from '@/services/NotificationService';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

const NotificationConfigurator = () => {
  const { publicKey } = useNostrService();

  useEffect(() => {
    if (publicKey) {
      registerPubkeysForPushNotificationsAsync([keyToHex(publicKey)]).catch((_error: any) => {});
    }

    const notificationListener = Notifications.addNotificationReceivedListener(_notification => {});

    const responseListener = Notifications.addNotificationResponseReceivedListener(_response => {});

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
  } catch (_error) {}
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
  const { mnemonic, nsec, isLoading } = useKey();
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
      <NostrServiceProvider mnemonic={mnemonic || ''} nsec={nsec || ''}>
        <WalletManagerContextProvider>
          <PortalAppProvider>
            <UserProfileProvider>
              <ActivitiesProvider>
                <PendingRequestsProvider>
                  <PaymentControllerProvider>
                    <DeeplinkProvider>
                      <NotificationConfigurator />
                      <Stack
                        screenOptions={{
                          headerShown: false,
                          contentStyle: { backgroundColor },
                        }}
                      />
                    </DeeplinkProvider>
                  </PaymentControllerProvider>
                </PendingRequestsProvider>
              </ActivitiesProvider>
            </UserProfileProvider>
          </PortalAppProvider>
        </WalletManagerContextProvider>
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
      <DevTag />
    </GestureHandlerRootView>
  );
};

export default function RootLayout() {
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams();

  useEffect(() => {
    if (pathname) {
      const entries: [string, string][] = Object.entries(globalParams).flatMap(([key, value]) => {
        if (value === undefined) return [];
        return Array.isArray(value)
          ? value.map(v => [key, String(v)] as [string, string])
          : [[key, String(value)] as [string, string]];
      });
      const queryString = new URLSearchParams(entries).toString();
      const _fullPath = queryString ? `${pathname}?${queryString}` : pathname;
    }
  }, [pathname, globalParams]);

  useEffect(() => {
    async function prepare() {
      try {
        // Preload required assets
        await preloadImages();

        // Increase delay to ensure all SecureStore operations complete on first launch
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (_error) {
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
