import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useKey } from '@/context/KeyContext';
import { useNostrService } from '@/context/NostrServiceContext';
import { useOnboarding } from '@/context/OnboardingContext';

export default function DeeplinkHandler() {
  const params = useLocalSearchParams();
  const { isOnboardingComplete } = useOnboarding();
  const { mnemonic } = useKey();
  const { isInitialized } = useNostrService();

  useEffect(() => {
    if (!isOnboardingComplete) {
      router.replace('/onboarding');
      return;
    }
    if (!isInitialized) return;
    if (!mnemonic) {
      router.replace('/(tabs)/Settings');
      return;
    }
    router.replace('/(tabs)');
  }, [params, isOnboardingComplete, mnemonic, isInitialized]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ThemedText>Processing deeplink...</ThemedText>
    </View>
  );
}
