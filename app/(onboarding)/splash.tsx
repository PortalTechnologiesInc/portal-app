import { useEffect } from 'react';
import { Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { onboardingLogo } from '@/components/onboarding/assets';
import { onboardingStyles as styles } from '@/components/onboarding/styles';
import { ThemedView } from '@/components/ThemedView';
import { useOnboarding } from '@/context/OnboardingContext';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function OnboardingSplash() {
  const { completeOnboarding } = useOnboarding();
  const backgroundColor = useThemeColor({}, 'background');

  useEffect(() => {
    const timeout = setTimeout(() => {
      completeOnboarding().catch(() => {});
    }, 2000);
    return () => clearTimeout(timeout);
  }, [completeOnboarding]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={[styles.container, styles.splashContainer]}>
        <Image source={onboardingLogo} style={styles.splashLogo} resizeMode="contain" />
      </ThemedView>
    </SafeAreaView>
  );
}
