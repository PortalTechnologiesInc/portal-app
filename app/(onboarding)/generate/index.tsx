import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { BackHandler, Platform, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { onboardingStyles as styles } from '@/components/onboarding/styles';
import { useKey } from '@/context/KeyContext';
import { SEED_ORIGIN_KEY, useOnboardingFlow } from '@/context/OnboardingFlowContext';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function GenerateSeed() {
  const { setMnemonic } = useKey();
  const {
    seedPhrase,
    generateNewSeedPhrase,
    createChallengeFromSeedPhrase,
    clearSeedPhrase,
    clearVerificationChallenge,
  } = useOnboardingFlow();

  const backgroundColor = useThemeColor({}, 'background');
  const surfaceSecondary = useThemeColor({}, 'surfaceSecondary');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryText = useThemeColor({}, 'buttonPrimaryText');

  useEffect(() => {
    if (!seedPhrase) {
      generateNewSeedPhrase();
    }
  }, [seedPhrase, generateNewSeedPhrase]);

  const handleBack = useCallback(() => {
    clearVerificationChallenge();
    clearSeedPhrase();
    router.back();
  }, [clearSeedPhrase, clearVerificationChallenge]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => backHandler.remove();
  }, [handleBack]);

  const handleCopySeedPhrase = () => {
    if (!seedPhrase) return;
    Clipboard.setStringAsync(seedPhrase);
  };

  const handleGenerateComplete = async () => {
    if (!seedPhrase) return;

    // In development mode, skip verification and proceed directly.
    if (__DEV__) {
      try {
        await setMnemonic(seedPhrase);
        await SecureStore.setItemAsync(SEED_ORIGIN_KEY, 'generated');
      } catch (_error) {
        // Still proceed to PIN setup even if saving fails (legacy behavior).
      } finally {
        clearVerificationChallenge();
        clearSeedPhrase();
        router.push('/(onboarding)/pin-setup');
      }
      return;
    }

    createChallengeFromSeedPhrase();
    router.push('/(onboarding)/generate/verify');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <OnboardingHeader onBack={handleBack} />

        <View style={styles.stepWrapper}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={[styles.pageContainer, styles.scrollPageContainer]}>
              <ThemedText type="title" style={styles.title}>
                Your Seed Phrase
              </ThemedText>
              <ThemedText style={styles.subtitle}>
                Write down these 12 words and keep them safe
              </ThemedText>

              <View style={styles.seedContainer}>
                {seedPhrase.split(' ').map((word: string, index: number) => (
                  <View
                    key={`word-${index}-${word}`}
                    style={[styles.wordContainer, { backgroundColor: surfaceSecondary }]}
                  >
                    <ThemedText style={styles.wordText}>
                      {index + 1}. {word}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={[styles.footer, styles.footerStack]}>
            <TouchableOpacity
              style={[styles.button, styles.copyButton, { backgroundColor: buttonPrimary }]}
              onPress={handleCopySeedPhrase}
            >
              <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>
                Copy to Clipboard
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.finishButton, { backgroundColor: buttonPrimary }]}
              onPress={handleGenerateComplete}
            >
              <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>
                I&apos;ve Written It Down
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}

