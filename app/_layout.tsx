import React, { useEffect, useState } from 'react';
import { Text, View, SafeAreaView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { OnboardingProvider, useOnboarding } from '@/context/OnboardingContext';
import { UserProfileProvider } from '@/context/UserProfileContext';
import { PendingRequestsProvider } from '@/context/PendingRequestsContext';
import { DeeplinkProvider } from '@/context/DeeplinkContext';
import { ActivitiesProvider } from '@/context/ActivitiesContext';
import { DatabaseProvider } from '@/services/database/DatabaseProvider';
import { MnemonicProvider, useMnemonic } from '@/context/MnemonicContext';
import NostrServiceProvider from '@/context/NostrServiceContext';
import { AppLockProvider, useAppLock } from '@/context/AppLockContext';
import { AppLockScreen } from '@/components/AppLockScreen';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '@/constants/Colors';
import { Asset } from 'expo-asset';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { useThemeColor } from '@/hooks/useThemeColor';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

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
      backgroundColor={currentTheme === 'light' ? Colors.primaryWhite : Colors.darkerGray}
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

// App content with all data providers - only rendered after successful authentication
const AuthenticatedAppContent = () => {
  const { isOnboardingComplete } = useOnboarding();
  const { mnemonic, walletUrl } = useMnemonic();
  const backgroundColor = useThemeColor({}, 'background');

  // Create screens array based on conditions
  const screens = [
    // Always include deeplink screen
    <Stack.Screen key="deeplink" name="[...deeplink]" />,
  ];

  // Add screens based on app state
  if (!isOnboardingComplete) {
    screens.push(<Stack.Screen key="onboarding" name="onboarding" />);
  } else if (!mnemonic) {
    screens.push(<Stack.Screen key="settings-only" name="settings" options={{ presentation: 'modal' }} />);
  } else {
    // User is onboarded and has mnemonic - show all main screens
    screens.push(
      <Stack.Screen key="tabs" name="(tabs)" options={{ headerShown: false }} />,
      <Stack.Screen key="settings" name="settings" options={{ presentation: 'modal' }} />,
      <Stack.Screen key="wallet" name="wallet" options={{ presentation: 'modal' }} />,
      <Stack.Screen key="qr" name="qr" options={{ presentation: 'fullScreenModal' }} />,
      <Stack.Screen key="subscription" name="subscription" />,
      <Stack.Screen key="activity" name="activity" />
    );
  }

  return (
    <DatabaseProvider>
      <NostrServiceProvider mnemonic={mnemonic || ''} walletUrl={walletUrl}>
        <UserProfileProvider>
          <ActivitiesProvider>
            <PendingRequestsProvider>
              <DeeplinkProvider>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: {
                      backgroundColor,
                    },
                  }}
                >
                  {screens}
                </Stack>
              </DeeplinkProvider>
            </PendingRequestsProvider>
          </ActivitiesProvider>
        </UserProfileProvider>
      </NostrServiceProvider>
    </DatabaseProvider>
  );
};

// App content wrapper that handles app lock - only initializes data providers after authentication
const AppContentWrapper = () => {
  const { isLocked } = useAppLock();

  if (isLocked) {
    return <AppLockScreen />;
  }

  // Only initialize data providers after successful authentication
  return (
    <MnemonicProvider>
      <OnboardingProvider>
        <AuthenticatedAppContent />
      </OnboardingProvider>
    </MnemonicProvider>
  );
};

// Themed root view wrapper - only contains minimal providers needed before authentication
const ThemedRootView = () => {
  const backgroundColor = useThemeColor({}, 'background');

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor }}>
      <ThemedStatusBar />
      <AppLockProvider>
        <AppContentWrapper />
      </AppLockProvider>
    </GestureHandlerRootView>
  );
};

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function prepare() {
      try {
        // Preload required assets
        await preloadImages();

        // Add a shorter delay to ensure initialization is complete
        await new Promise(resolve => setTimeout(resolve, 300));
        setIsReady(true);
      } catch (error) {
        console.error('Error preparing app:', error);
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
    <ThemeProvider>
      <ThemedRootView />
    </ThemeProvider>
  );
}
