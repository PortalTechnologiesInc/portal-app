import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Colors } from '@/constants/Colors';
import { useOnboarding } from '@/context/OnboardingContext';

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
