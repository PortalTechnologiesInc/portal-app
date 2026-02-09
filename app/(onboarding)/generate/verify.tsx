import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { onboardingStyles as styles } from '@/components/onboarding/styles';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useKey } from '@/context/KeyContext';
import { SEED_ORIGIN_KEY, useOnboardingFlow } from '@/context/OnboardingFlowContext';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function VerifySeed() {
  const { setMnemonic } = useKey();
  const { seedPhrase, verificationChallenge, clearVerificationChallenge, clearSeedPhrase } =
    useOnboardingFlow();

  const [word1, setWord1] = useState('');
  const [word2, setWord2] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const backgroundColor = useThemeColor({}, 'background');
  const inputBackground = useThemeColor({}, 'inputBackground');
  const inputPlaceholder = useThemeColor({}, 'inputPlaceholder');
  const textPrimary = useThemeColor({}, 'textPrimary');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryText = useThemeColor({}, 'buttonPrimaryText');

  useEffect(() => {
    // Don't redirect if we're in the middle of verifying
    if (isVerifying) return;

    if (!seedPhrase || !verificationChallenge) {
      router.replace('/(onboarding)/generate');
    }
  }, [seedPhrase, verificationChallenge, isVerifying]);

  const handleBack = useCallback(() => {
    clearVerificationChallenge();
    setWord1('');
    setWord2('');
    router.back();
  }, [clearVerificationChallenge]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => backHandler.remove();
  }, [handleBack]);

  const handleVerificationComplete = async () => {
    if (!verificationChallenge) return;

    const isWord1Correct =
      word1.trim().toLowerCase() === verificationChallenge.word1.value.toLowerCase();
    const isWord2Correct =
      word2.trim().toLowerCase() === verificationChallenge.word2.value.toLowerCase();

    if (!isWord1Correct || !isWord2Correct) {
      Alert.alert(
        'Incorrect Words',
        "The words you entered don't match your seed phrase. Please check your backup and try again.",
        [
          {
            text: 'Try Again',
            onPress: () => {
              setWord1('');
              setWord2('');
            },
          },
          {
            text: 'Go Back to Seed',
            onPress: () => {
              clearVerificationChallenge();
              router.replace('/(onboarding)/generate');
            },
          },
        ]
      );
      return;
    }

    setIsVerifying(true);

    try {
      await setMnemonic(seedPhrase);
      await SecureStore.setItemAsync(SEED_ORIGIN_KEY, 'generated');

      // Clear state after saving
      clearVerificationChallenge();
      clearSeedPhrase();

      // Navigate to PIN setup
      router.push('/(onboarding)/pin-setup');
    } catch (_error) {
      // Proceed even if saving fails (legacy behavior).
      clearVerificationChallenge();
      clearSeedPhrase();
      router.push('/(onboarding)/pin-setup');
    }
  };

  if (!verificationChallenge) {
    return null;
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <OnboardingHeader onBack={handleBack} />

        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
        >
          <View style={styles.stepWrapper}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={[styles.pageContainer, styles.scrollPageContainer]}>
                <ThemedText type="title" style={styles.title}>
                  Verify Your Seed Phrase
                </ThemedText>
                <ThemedText style={styles.subtitle}>
                  Please enter the words you wrote down to confirm your backup
                </ThemedText>

                <View style={styles.verificationContainer}>
                  <ThemedText style={styles.verificationText}>
                    Enter word #{verificationChallenge.word1.index + 1}:
                  </ThemedText>
                  <TextInput
                    testID="verification-input-1"
                    style={[
                      styles.verificationInput,
                      { backgroundColor: inputBackground, color: textPrimary },
                    ]}
                    placeholder={`Word ${verificationChallenge.word1.index + 1}`}
                    placeholderTextColor={inputPlaceholder}
                    value={word1}
                    onChangeText={setWord1}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />

                  <ThemedText style={styles.verificationText}>
                    Enter word #{verificationChallenge.word2.index + 1}:
                  </ThemedText>
                  <TextInput
                    testID="verification-input-2"
                    style={[
                      styles.verificationInput,
                      { backgroundColor: inputBackground, color: textPrimary },
                    ]}
                    placeholder={`Word ${verificationChallenge.word2.index + 1}`}
                    placeholderTextColor={inputPlaceholder}
                    value={word2}
                    onChangeText={setWord2}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                </View>
              </View>
            </ScrollView>

            <View style={[styles.footer, styles.footerStack]}>
              <TouchableOpacity
                style={[styles.button, styles.finishButton, { backgroundColor: buttonPrimary }]}
                onPress={handleVerificationComplete}
                disabled={isVerifying}
              >
                <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>
                  Verify and Continue
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </ThemedView>
    </SafeAreaView>
  );
}
