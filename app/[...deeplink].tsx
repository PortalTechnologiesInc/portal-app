import { ThemedText } from '@/components/ThemedText';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useOnboarding } from '@/context/OnboardingContext';
import { useMnemonic } from '@/context/MnemonicContext';
import { useNostrService } from '@/context/NostrServiceContext';

export default function DeeplinkHandler() {
  const params = useLocalSearchParams();
  const { isOnboardingComplete } = useOnboarding();
  const { mnemonic } = useMnemonic();
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
