import { router } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { useEffect } from 'react';
import { BackHandler, Platform, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { onboardingStyles as styles } from '@/components/onboarding/styles';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function IdentityVerification() {
  const backgroundColor = useThemeColor({}, 'background');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryText = useThemeColor({}, 'buttonPrimaryText');

  useEffect(() => {
    if (Platform.OS === 'android') {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        return true; // Block back navigation
      });
      return () => backHandler.remove();
    }
  }, []);

  const handleStart = () => {
    router.push('/(onboarding)/age-verification');
  };

  const handleSkip = () => {
    router.push('/(onboarding)/pin-setup');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <OnboardingHeader onBack={() => {}} hideBackButton={true} />

        <View style={styles.stepWrapper}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.pageContainer, styles.scrollPageContainer]}>
              <View style={{ marginBottom: 20 }}>
                <ShieldCheck size={48} color={buttonPrimary} strokeWidth={1.5} />
              </View>
              <ThemedText type="title" style={styles.title}>
                Verify your age?
              </ThemedText>
              <ThemedText style={[styles.subtitle, { marginBottom: 16 }]}>
                Age verification is optional. It helps you access age-restricted content and
                services when needed.
              </ThemedText>
              <ThemedText style={{ fontSize: 15, textAlign: 'center', opacity: 0.8 }}>
                The process is quick and private. You can skip this step and verify later from
                settings.
              </ThemedText>
            </View>
          </ScrollView>

          <View style={[styles.footer, styles.footerStack]}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: buttonPrimary }]}
              onPress={handleStart}
            >
              <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>
                Start verification
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: 'transparent', borderWidth: 1, borderColor: buttonPrimary },
              ]}
              onPress={handleSkip}
            >
              <ThemedText style={[styles.buttonText, { color: buttonPrimary }]}>
                Skip for now
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}
