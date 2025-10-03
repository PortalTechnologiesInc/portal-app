import { ThemedText } from '@/components/ThemedText';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useOnboarding } from '@/context/OnboardingContext';
import { useMnemonic } from '@/context/MnemonicContext';

export default function DeeplinkHandler() {
  const params = useLocalSearchParams();
  const { isOnboardingComplete } = useOnboarding();
  const { mnemonic } = useMnemonic();

  useEffect(() => {
    if (!isOnboardingComplete) {
      router.replace('/onboarding');
      return;
    }
    if (!mnemonic) {
      router.replace('/(tabs)/Settings');
      return;
    }
    router.replace('/(tabs)')
  }, [params, isOnboardingComplete, mnemonic]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ThemedText>Processing deeplink...</ThemedText>
    </View>
  );
}
