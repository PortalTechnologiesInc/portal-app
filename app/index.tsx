import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useOnboarding } from '@/context/OnboardingContext';
import { Colors } from '@/constants/Colors';
import * as Linking from 'expo-linking';

const isDevelopmentDeeplink = (url: string): boolean => {
  // Check if it's an Expo development client deeplink
  return url.includes('expo-development-client') || url.includes('exps://');
};

export default function Index() {
  const { isOnboardingComplete, isLoading } = useOnboarding();
  const [isCheckingDeeplink, setIsCheckingDeeplink] = useState(true);
  const [hasDeeplink, setHasDeeplink] = useState(false);

  useEffect(() => {
    const checkForDeeplink = async () => {
      try {
        // Check if app was opened with a deeplink
        const initialUrl = await Linking.getInitialURL();
        
        if (initialUrl && !isDevelopmentDeeplink(initialUrl)) {
          // App was opened with a real deeplink (not development), let the deeplink handler manage navigation
          console.log('App opened with deeplink, preventing index redirect:', initialUrl);
          setHasDeeplink(true);
          return;
        }
        
        if (initialUrl) {
          console.log('Development deeplink detected, ignoring:', initialUrl);
        }
        
        setHasDeeplink(false);
      } catch (error) {
        console.error('Error checking for deeplink:', error);
        setHasDeeplink(false);
      } finally {
        setIsCheckingDeeplink(false);
      }
    };

    checkForDeeplink();
  }, []);

  // Show loading while checking for deeplink or onboarding state
  if (isLoading || isCheckingDeeplink) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#000000',
        }}
      >
        <ActivityIndicator size="large" color={Colors.almostWhite} />
      </View>
    );
  }

  // If app was opened with a real deeplink (not development), don't render any redirect - let deeplink handler take over
  if (hasDeeplink) {
    return null;
  }

  // Simple navigation decision based on onboarding completion
  return <Redirect href={isOnboardingComplete ? '/(tabs)' : '/onboarding'} />;
}
