import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { onboardingStyles as styles } from '@/components/onboarding/styles';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useKey } from '@/context/KeyContext';
import { SEED_ORIGIN_KEY, useOnboardingFlow } from '@/context/OnboardingFlowContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { validateImportedMnemonic } from '@/utils/onboarding';

export default function ImportSeedPhrase() {
  const { setMnemonic } = useKey();
  const { seedPhrase, setSeedPhrase, clearSeedPhrase } = useOnboardingFlow();

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const backgroundColor = useThemeColor({}, 'background');
  const inputBackground = useThemeColor({}, 'inputBackground');
  const inputPlaceholder = useThemeColor({}, 'inputPlaceholder');
  const textPrimary = useThemeColor({}, 'textPrimary');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryText = useThemeColor({}, 'buttonPrimaryText');

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () =>
      setIsKeyboardVisible(true)
    );
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () =>
      setIsKeyboardVisible(false)
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const handleBack = useCallback(() => {
    clearSeedPhrase();
    router.back();
  }, [clearSeedPhrase]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => backHandler.remove();
  }, [handleBack]);

  const handleImportComplete = async () => {
    const validation = validateImportedMnemonic(seedPhrase);
    if (!validation.isValid) {
      Alert.alert('Invalid Seed Phrase', validation.error);
      return;
    }

    try {
      const normalizedPhrase = seedPhrase.trim().toLowerCase();
      await setMnemonic(normalizedPhrase);
      await SecureStore.setItemAsync(SEED_ORIGIN_KEY, 'imported');
      clearSeedPhrase();
      router.push('/(onboarding)/pin-setup');
    } catch (_error) {
      Alert.alert('Error', 'Failed to save your seed phrase. Please try again.');
    }
  };

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
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            >
              <View style={[styles.pageContainer, styles.importPageContainer]}>
                <View style={styles.importTextContainer}>
                  <ThemedText type="title" style={styles.title}>
                    Import Seed Phrase
                  </ThemedText>
                  <ThemedText style={styles.subtitle}>
                    Enter your 12-word seed phrase
                  </ThemedText>
                </View>

                <View style={styles.inputContainer}>
                  <TextInput
                    style={[styles.input, { backgroundColor: inputBackground, color: textPrimary }]}
                    placeholder="Enter your 12-word seed phrase separated by spaces"
                    placeholderTextColor={inputPlaceholder}
                    value={seedPhrase}
                    onChangeText={setSeedPhrase}
                    multiline
                    numberOfLines={4}
                    autoCorrect={false}
                    autoCapitalize="none"
                    returnKeyType={Platform.OS === 'ios' ? 'done' : 'default'}
                    blurOnSubmit
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>
              </View>
            </ScrollView>

            <View
              style={[
                styles.footer,
                styles.footerStack,
                isKeyboardVisible && styles.footerCompact,
              ]}
            >
              <TouchableOpacity
                style={[styles.button, styles.finishButton, { backgroundColor: buttonPrimary }]}
                onPress={handleImportComplete}
              >
                <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>
                  Import
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </ThemedView>
    </SafeAreaView>
  );
}

