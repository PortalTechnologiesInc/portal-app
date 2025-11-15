import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useOnboarding } from '@/context/OnboardingContext';
import { Colors } from '@/constants/Colors';

const isDevelopmentDeeplink = (url: string): boolean => {
  // Check if it's an Expo development client deeplink
  return url.includes('expo-development-client') || url.includes('exps://');
};

export default function Index() {
  const { isOnboardingComplete, isLoading } = useOnboarding();

  // Show loading while checking for deeplink or onboarding state
  if (isLoading) {
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

  // Simple navigation decision based on onboarding completion
  return <Redirect href={isOnboardingComplete ? '/(tabs)' : '/onboarding'} />;
}
