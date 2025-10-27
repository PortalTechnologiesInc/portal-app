import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  TextInput,
  BackHandler,
  ScrollView,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useOnboarding } from '@/context/OnboardingContext';
import { useMnemonic } from '@/context/MnemonicContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import {
  Shield,
  Key,
  Zap,
  Globe,
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ArrowLeft,
  Copy,
} from 'lucide-react-native';

import * as Clipboard from 'expo-clipboard';

import { SafeAreaView } from 'react-native-safe-area-context';
import { generateMnemonic, Mnemonic } from 'portal-app-lib';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { useNostrService } from '@/context/NostrServiceContext';

// Preload all required assets
const onboardingLogo = require('../assets/images/appLogo.png');

// Key to track if seed was generated or imported
const SEED_ORIGIN_KEY = 'portal_seed_origin';

type OnboardingStep =
  | 'welcome'
  | 'backup-warning'
  | 'choice'
  | 'generate'
  | 'verify'
  | 'import'
  | 'wallet-setup'
  | 'wallet-connect'
  | 'splash';

export default function Onboarding() {
  const { completeOnboarding } = useOnboarding();
  const { setMnemonic, walletUrl, setWalletUrl } = useMnemonic();
  const router = useRouter();
  const { walletInfo, refreshWalletInfo, nwcConnectionStatus, nwcConnectionError, nwcConnecting } =
    useNostrService();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [seedPhrase, setSeedPhrase] = useState('');
  const [verificationWords, setVerificationWords] = useState<{
    word1: { index: number; value: string };
    word2: { index: number; value: string };
  }>({
    word1: { index: 0, value: '' },
    word2: { index: 0, value: '' },
  });
  const [userInputs, setUserInputs] = useState({ word1: '', word2: '' });
  const [walletInput, setWalletInput] = useState('');
  const [isSavingWallet, setIsSavingWallet] = useState(false);

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const surfaceSecondary = useThemeColor({}, 'surfaceSecondary');
  const textPrimary = useThemeColor({}, 'textPrimary');
  const inputBackground = useThemeColor({}, 'inputBackground');
  const inputPlaceholder = useThemeColor({}, 'inputPlaceholder');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryText = useThemeColor({}, 'buttonPrimaryText');

  const { width, height } = useWindowDimensions();
  const shortestSide = Math.min(width, height);
  const isSmallDevice = shortestSide <= 375;

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const goToPreviousStep = () => {
    const previousSteps: Record<OnboardingStep, OnboardingStep | null> = {
      welcome: null,
      'backup-warning': 'welcome',
      choice: 'backup-warning',
      generate: 'choice',
      verify: 'generate',
      import: 'choice',
      'wallet-setup': 'choice',
      'wallet-connect': 'wallet-setup',
      splash: null,
    };

    const previousStep = previousSteps[currentStep];
    if (previousStep) {
      setCurrentStep(previousStep);
    }
  };

  // Add this function to your component
  const okBack = (stateToClear?: () => void) => {
    // Clear the specified state if provided
    if (stateToClear) {
      stateToClear();
    }

    // Navigate to previous step
    goToPreviousStep();
  };

  // Use in back gesture handler
  useEffect(() => {
    if (Platform.OS === 'android') {
      const backAction = () => {
        if (currentStep === 'welcome') {
          return true; // Block exit from app
        }

        // Call okBack with appropriate state clearing based on current step
        switch (currentStep) {
          case 'generate':
            okBack(() => setSeedPhrase(''));
            break;
          case 'verify':
            okBack(() => {
              setVerificationWords({
                word1: { index: 0, value: '' },
                word2: { index: 0, value: '' },
              });
              setUserInputs({ word1: '', word2: '' });
            });
            break;
          case 'wallet-connect':
            okBack(() => setWalletInput(''));
            break;
          case 'import':
            okBack(() => setSeedPhrase(''));
            break;
          case 'wallet-setup':
            // Clear wallet connection status when going back from wallet setup
            okBack(() => {
              setIsSavingWallet(false);
              // Reset wallet connection state if needed
              // This ensures clean state when returning to wallet setup
            });
            break;
          case 'backup-warning':
            // No state clearing needed - just informational step
            okBack();
            break;
          case 'choice':
            // No state clearing needed - just selection step
            okBack();
            break;
          default:
            okBack(); // No state clearing needed
        }

        return true;
      };

      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
      return () => backHandler.remove();
    }
  }, [currentStep, okBack]);

  const handleGenerate = async () => {
    const mnemonic = generateMnemonic().toString();
    setSeedPhrase(mnemonic);
    setCurrentStep('generate');
  };

  const handleContinueToVerification = () => {
    // Generate 2 random word positions for verification
    const words = seedPhrase.split(' ');
    const randomIndex1 = Math.floor(Math.random() * 12);
    let randomIndex2 = Math.floor(Math.random() * 12);

    // Ensure the second word is different from the first
    while (randomIndex2 === randomIndex1) {
      randomIndex2 = Math.floor(Math.random() * 12);
    }

    // Sort indices to display them in order
    const [firstIndex, secondIndex] = [randomIndex1, randomIndex2].sort((a, b) => a - b);

    setVerificationWords({
      word1: { index: firstIndex, value: words[firstIndex] },
      word2: { index: secondIndex, value: words[secondIndex] },
    });

    // Reset user inputs
    setUserInputs({ word1: '', word2: '' });

    setCurrentStep('verify');
  };

  const validateImportedMnemonic = (phrase: string): { isValid: boolean; error?: string } => {
    const trimmedPhrase = phrase.trim().toLowerCase();

    if (!trimmedPhrase) {
      return { isValid: false, error: 'Please enter a seed or nsec.' };
    }

    const words = trimmedPhrase.split(/\s+/);

    if (words.length !== 12) {
      return { isValid: false, error: 'Seed phrase must be exactly 12 words' };
    }

    try {
      // Use portal-app-lib's Mnemonic class for validation
      // If the mnemonic is invalid, the constructor will throw an error
      new Mnemonic(trimmedPhrase);
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: 'Invalid seed phrase. Please check your words and try again.',
      };
    }
  };

  const validateImportedNsec = (nsec: string): { isValid: boolean; error?: string } => {
    const trimmedNsec = nsec.trim().toLowerCase();

    if (!trimmedNsec) {
      return { isValid: false, error: 'Please enter a seed or nsec.' };
    }

    const validNsec = /^nsec1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{52}$/.test(trimmedNsec);

    if (!validNsec) {
      return { isValid: false, error: 'Invalid Nsec. Please check your Nsec and try again.' };
    }

    return { isValid: true };
  };

  const handleVerificationComplete = async () => {
    // Check if the entered words match the expected words
    const isWord1Correct =
      userInputs.word1.trim().toLowerCase() === verificationWords.word1.value.toLowerCase();
    const isWord2Correct =
      userInputs.word2.trim().toLowerCase() === verificationWords.word2.value.toLowerCase();

    if (!isWord1Correct || !isWord2Correct) {
      Alert.alert(
        'Incorrect Words',
        "The words you entered don't match your seed phrase. Please check your backup and try again.",
        [
          {
            text: 'Try Again',
            onPress: () => {
              setUserInputs({ word1: '', word2: '' });
            },
          },
          {
            text: 'Go Back to Seed',
            onPress: () => setCurrentStep('generate'),
          },
        ]
      );
      return;
    }

    // Words are correct, proceed with saving
    try {
      // Save the mnemonic using our provider
      await setMnemonic(seedPhrase);

      // Mark this as a generated seed (no need to fetch profile)
      await SecureStore.setItemAsync(SEED_ORIGIN_KEY, 'generated');

      // Go to wallet setup step
      setCurrentStep('wallet-setup');
    } catch (error) {
      console.error('Failed to save mnemonic:', error);
      // Still continue with onboarding even if saving fails
      setCurrentStep('wallet-setup');
    }
  };

  const handleGenerateComplete = async () => {
    // In development mode, skip verification and go to wallet setup
    if (__DEV__) {
      try {
        // Save the mnemonic using our provider
        await setMnemonic(seedPhrase);

        // Mark this as a generated seed (no need to fetch profile)
        await SecureStore.setItemAsync(SEED_ORIGIN_KEY, 'generated');

        // Go to wallet setup step
        setCurrentStep('wallet-setup');
      } catch (error) {
        console.error('Failed to save mnemonic in dev mode:', error);
        // Still continue with onboarding even if saving fails
        setCurrentStep('wallet-setup');
      }
      return;
    }

    // In production mode, go to verification step
    handleContinueToVerification();
  };

  const handleImport = async () => {
    await setSeedPhrase('');
    setCurrentStep('import');
  };

  const handleCopySeedPhrase = () => {
    Clipboard.setStringAsync(seedPhrase);
  };

  const handleImportComplete = async () => {

    const isNsec = seedPhrase.startsWith("nsec1");

    const validation = isNsec ? validateImportedNsec(seedPhrase) : validateImportedMnemonic(seedPhrase);

    if (!validation.isValid) {
      Alert.alert(
        'Invalid Seed Phrase',
        validation.error || 'Please check your seed phrase and try again.'
      );
      return;
    }

    try {
      const normalizedPhrase = seedPhrase.trim().toLowerCase();
      await setMnemonic(normalizedPhrase);

      // Mark this as an imported seed (should fetch profile first)
      await SecureStore.setItemAsync(SEED_ORIGIN_KEY, 'imported');

      // Go to wallet setup step
      setCurrentStep('wallet-setup');
    } catch (error) {
      console.error('Failed to save imported mnemonic:', error);
      Alert.alert('Error', 'Failed to save your seed phrase. Please try again.');
    }
  };

  const handleWalletSetup = () => {
    // Go to inline wallet connect step
    setWalletInput(walletUrl || '');
    setCurrentStep('wallet-connect');
  };

  const handleSkipWalletSetup = () => {
    // Skip wallet setup and complete onboarding
    setCurrentStep('splash');
    setTimeout(() => {
      completeOnboarding();
    }, 2000);
  };

  // Local URL validation adapted from wallet screen
  const validateNwcUrl = (url: string): { isValid: boolean; error?: string } => {
    if (!url.trim()) {
      return { isValid: false, error: 'URL cannot be empty' };
    }

    try {
      // Normalize protocol
      let normalized = url.trim();
      if (normalized.startsWith('nostrwalletconnect:')) {
        normalized = normalized.replace('nostrwalletconnect:', 'nostr+walletconnect://');
      } else if (normalized.startsWith('nwc://')) {
        normalized = normalized.replace('nwc://', 'nostr+walletconnect://');
      }

      const urlObj = new URL(normalized);

      if (!/^nostr\+walletconnect:\/\//.test(normalized)) {
        return { isValid: false, error: 'Unsupported NWC URL format' };
      }

      // secret may be in pathname (after protocol) or as query param
      const secret = urlObj.pathname.replace(/^\/+/, '') || urlObj.searchParams.get('secret');
      const relay = urlObj.searchParams.get('relay');

      if (!secret) {
        return { isValid: false, error: 'Missing secret' };
      }
      if (!relay) {
        return { isValid: false, error: 'Missing relay parameter' };
      }
      if (!relay.startsWith('wss://') && !relay.startsWith('ws://')) {
        return { isValid: false, error: 'Relay must be a websocket URL (wss:// or ws://)' };
      }

      return { isValid: true };
    } catch {
      return { isValid: false, error: 'Invalid URL format' };
    }
  };

  // Show splash screen when transitioning to home
  if (currentStep === 'splash') {
    return (
      <ThemedView style={[styles.container, styles.splashContainer]}>
        <Image source={onboardingLogo} style={styles.splashLogo} resizeMode="contain" />
      </ThemedView>
    );
  }

  // Helper function to get back button handler for current step
  const getBackButtonHandler = () => {
    switch (currentStep) {
      case 'generate':
        return () => okBack(() => setSeedPhrase(''));
      case 'verify':
        return () =>
          okBack(() => {
            setVerificationWords({
              word1: { index: 0, value: '' },
              word2: { index: 0, value: '' },
            });
            setUserInputs({ word1: '', word2: '' });
          });
      case 'wallet-connect':
        return () => okBack(() => setWalletInput(''));
      case 'import':
        return () => okBack(() => setSeedPhrase(''));
      case 'wallet-setup':
        return () => okBack(() => setIsSavingWallet(false));
      default:
        return () => okBack();
    }
  };

  // Helper function to check if back button should be shown
  const shouldShowBackButton = () => {
    return currentStep !== 'welcome' && currentStep !== ('splash' as OnboardingStep);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        {/* Header with Back Button */}
        {shouldShowBackButton() && (
          <ThemedView style={styles.header}>
            <TouchableOpacity onPress={getBackButtonHandler()} style={styles.backButton}>
              <ArrowLeft size={24} color={textPrimary} />
            </TouchableOpacity>
            <ThemedText style={[styles.headerText, { color: textPrimary }]}>Portal Setup</ThemedText>
            <View style={styles.headerLogoWrapper}>
              <Image source={onboardingLogo} style={styles.headerLogo} resizeMode="contain" />
            </View>
          </ThemedView>
        )}

        {/* Logo */}
        {currentStep === 'welcome' && (
          <View style={styles.logoContainer}>
            <Image source={onboardingLogo} style={styles.logo} resizeMode="contain" />
          </View>
        )}

        {/* Welcome Step */}
        {currentStep === 'welcome' && (
          <View style={styles.stepWrapper}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.pageContainer, styles.scrollPageContainer]}>
                <ThemedText type="title" style={styles.mainTitle}>
                  Welcome to Portal
                </ThemedText>
                <ThemedText style={styles.subtitle}>Your sovereign digital identity app</ThemedText>

                {/* Feature Cards */}
                <View style={styles.featureContainer}>
                  <View style={[styles.featureCard, { backgroundColor: cardBackgroundColor }]}>
                    <Shield size={28} color={buttonPrimary} />
                    <ThemedText type="defaultSemiBold" style={styles.featureTitle}>
                      Self-Sovereign Identity
                    </ThemedText>
                    <ThemedText style={styles.featureDescription}>
                      Own and control your digital identity without relying on centralized services
                    </ThemedText>
                  </View>

                  <View style={[styles.featureCard, { backgroundColor: cardBackgroundColor }]}>
                    <Zap size={28} color={buttonPrimary} />
                    <ThemedText type="defaultSemiBold" style={styles.featureTitle}>
                      Wallet Integration
                    </ThemedText>
                    <ThemedText style={styles.featureDescription}>
                      Connect and interact with Lightning wallets through Nostr Wallet Connect
                    </ThemedText>
                  </View>
                </View>
              </View>
            </ScrollView>
            <View style={[styles.footer, styles.footerStack]}>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: buttonPrimary }]}
                onPress={() => setCurrentStep('backup-warning')}
              >
                <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>Get Started</ThemedText>
                <ArrowRight size={20} color={buttonPrimaryText} style={styles.buttonIcon} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Backup Warning Step */}
        {currentStep === 'backup-warning' && (
          <View style={styles.stepWrapper}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.pageContainer, styles.scrollPageContainer]}>
                <View style={styles.warningIconContainer}>
                  <AlertTriangle size={isSmallDevice ? 48 : 64} color="#f39c12" />
                </View>

                <ThemedText type="title" style={styles.warningTitle}>
                  Important Security Notice
                </ThemedText>

                <View style={[styles.warningCard, { backgroundColor: cardBackgroundColor }]}>
                  <ThemedText
                    type="defaultSemiBold"
                    style={[styles.warningCardTitle, isSmallDevice && styles.warningCardTitleSmall]}
                  >
                    Your seed phrase is your master key
                  </ThemedText>
                  <ThemedText style={[styles.warningText, isSmallDevice && styles.warningTextSmall]}>
                    Portal generates a unique 12-word seed phrase that gives you complete control over
                    your digital identity and authentication.
                  </ThemedText>
                </View>

                <View style={styles.warningPointsContainer}>
                  <View style={styles.warningPoint}>
                    <CheckCircle size={20} color="#27ae60" />
                    <ThemedText style={styles.warningPointText}>
                      <ThemedText type="defaultSemiBold">Write it down</ThemedText> on paper and store
                      it safely
                    </ThemedText>
                  </View>

                  <View style={styles.warningPoint}>
                    <CheckCircle size={20} color="#27ae60" />
                    <ThemedText style={styles.warningPointText}>
                      <ThemedText type="defaultSemiBold">Never share it</ThemedText> with anyone - not
                      even Portal support
                    </ThemedText>
                  </View>

                  <View style={styles.warningPoint}>
                    <CheckCircle size={20} color="#27ae60" />
                    <ThemedText style={styles.warningPointText}>
                      <ThemedText type="defaultSemiBold">Keep multiple copies</ThemedText> in secure,
                      separate locations
                    </ThemedText>
                  </View>

                  <View style={styles.warningPoint}>
                    <AlertTriangle size={20} color="#e74c3c" />
                    <ThemedText style={styles.warningPointText}>
                      <ThemedText type="defaultSemiBold">If you lose it, you lose access</ThemedText>{' '}
                      - we cannot recover it
                    </ThemedText>
                  </View>
                </View>
              </View>
            </ScrollView>
            <View style={[styles.footer, styles.footerStack]}>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: buttonPrimary }]}
                onPress={() => setCurrentStep('choice')}
              >
                <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>
                  I Understand - Continue
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Choice Step */}
        {currentStep === 'choice' && (
          <View style={styles.stepWrapper}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.pageContainer, styles.scrollPageContainer]}>
                <ThemedText type="title" style={styles.title}>
                  Setup Your Identity
                </ThemedText>
                <ThemedText style={styles.subtitle}>
                  Choose how you want to create your digital identity
                </ThemedText>

                <View style={styles.buttonGroup}>
                  <TouchableOpacity
                    style={[styles.choiceButton, { backgroundColor: cardBackgroundColor }]}
                    onPress={handleGenerate}
                  >
                    <Key size={24} color={buttonPrimary} />
                    <ThemedText type="defaultSemiBold" style={styles.choiceButtonTitle}>
                      Generate New Seed Phrase
                    </ThemedText>
                    <ThemedText style={styles.choiceButtonDescription}>
                      Create a new 12-word seed phrase for a fresh start
                    </ThemedText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.choiceButton, { backgroundColor: cardBackgroundColor }]}
                    onPress={handleImport}
                  >
                    <Shield size={24} color={buttonPrimary} />
                    <ThemedText type="defaultSemiBold" style={styles.choiceButtonTitle}>
                      Import Existing Seed or Nsec
                    </ThemedText>
                    <ThemedText style={styles.choiceButtonDescription}>
                      Restore your identity using an existing seed phrase or Nsec
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        )}

        {/* Generate Step */}
        {currentStep === 'generate' && (
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
                <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>Copy to Clipboard</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.finishButton, { backgroundColor: buttonPrimary }]}
                onPress={handleGenerateComplete}
              >
                <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>
                  I've Written It Down
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Verify Step */}
        {currentStep === 'verify' && (
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
                      Enter word #{verificationWords.word1.index + 1}:
                    </ThemedText>
                    <TextInput
                      style={[
                        styles.verificationInput,
                        { backgroundColor: inputBackground, color: textPrimary },
                      ]}
                      placeholder={`Word ${verificationWords.word1.index + 1}`}
                      placeholderTextColor={inputPlaceholder}
                      value={userInputs.word1}
                      onChangeText={text => setUserInputs(prev => ({ ...prev, word1: text }))}
                      autoCorrect={false}
                      autoCapitalize="none"
                    />

                    <ThemedText style={styles.verificationText}>
                      Enter word #{verificationWords.word2.index + 1}:
                    </ThemedText>
                    <TextInput
                      style={[
                        styles.verificationInput,
                        { backgroundColor: inputBackground, color: textPrimary },
                      ]}
                      placeholder={`Word ${verificationWords.word2.index + 1}`}
                      placeholderTextColor={inputPlaceholder}
                      value={userInputs.word2}
                      onChangeText={text => setUserInputs(prev => ({ ...prev, word2: text }))}
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
                >
                  <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>
                    Verify and Continue
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        )}

        {/* Import Step */}
        {currentStep === 'import' && (
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
                      Import Seed Phrase or Nsec
                    </ThemedText>
                    <ThemedText style={styles.subtitle}>Enter your 12-word seed phrase or Nsec</ThemedText>
                  </View>

                  <View style={styles.inputContainer}>
                    <TextInput
                      style={[styles.input, { backgroundColor: inputBackground, color: textPrimary }]}
                      placeholder="Enter your Nsec or 12-word seed phrase separated by spaces"
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
                style={[styles.footer, styles.footerStack, isKeyboardVisible && styles.footerCompact]}
              >
                <TouchableOpacity
                  style={[styles.button, styles.finishButton, { backgroundColor: buttonPrimary }]}
                  onPress={handleImportComplete}
                >
                  <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>Import</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        )}

        {/* Wallet Setup Step */}
        {currentStep === 'wallet-setup' && (
          <View style={styles.stepWrapper}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.pageContainer, styles.scrollPageContainer]}>
                <View style={styles.walletIconContainer}>
                  <Zap size={64} color={buttonPrimary} />
                </View>

                <ThemedText type="title" style={styles.title}>
                  Connect Your Wallet
                </ThemedText>
                <ThemedText style={styles.subtitle}>
                  Add a Lightning wallet to enable payments and transactions
                </ThemedText>

                <View style={[styles.walletSetupCard, { backgroundColor: cardBackgroundColor }]}>
                  <ThemedText type="defaultSemiBold" style={styles.walletSetupCardTitle}>
                    Why connect a wallet?
                  </ThemedText>
                  <ThemedText style={styles.walletSetupText}>
                    Connecting a Lightning wallet allows you to make payments, receive refunds, and
                    interact with Lightning-enabled services through the Nostr network.
                  </ThemedText>
                </View>

                <View style={styles.walletSetupPointsContainer}>
                  <View style={styles.walletSetupPoint}>
                    <CheckCircle size={20} color="#27ae60" />
                    <ThemedText style={styles.walletSetupPointText}>
                      <ThemedText type="defaultSemiBold">Make payments</ThemedText> to other users and
                      services
                    </ThemedText>
                  </View>

                  <View style={styles.walletSetupPoint}>
                    <CheckCircle size={20} color="#27ae60" />
                    <ThemedText style={styles.walletSetupPointText}>
                      <ThemedText type="defaultSemiBold">Receive refunds</ThemedText> from Lightning
                      payments
                    </ThemedText>
                  </View>

                  <View style={styles.walletSetupPoint}>
                    <CheckCircle size={20} color="#27ae60" />
                    <ThemedText style={styles.walletSetupPointText}>
                      <ThemedText type="defaultSemiBold">Subscriptions</ThemedText> management &
                      recurring payouts
                    </ThemedText>
                  </View>
                </View>
              </View>
            </ScrollView>
            <View style={styles.footer}>
              <View style={styles.buttonGroup}>
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: buttonPrimary }]}
                  onPress={handleWalletSetup}
                >
                  <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>
                    Add Wallet
                  </ThemedText>
                  <ArrowRight size={20} color={buttonPrimaryText} style={styles.buttonIcon} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.skipButton, { backgroundColor: surfaceSecondary }]}
                  onPress={handleSkipWalletSetup}
                >
                  <ThemedText style={[styles.skipButtonText, { color: textPrimary }]}>
                    Skip for Now
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Wallet Connect Step */}
        {currentStep === 'wallet-connect' && (
          <View style={styles.stepWrapper}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.pageContainer, styles.scrollPageContainer]}>
                <ThemedText type="title" style={styles.title}>
                  Connect Lightning Wallet
                </ThemedText>
                <ThemedText style={styles.subtitle}>Paste your Nostr Wallet Connect URL</ThemedText>

                <View style={styles.inputContainer}>
                  <TextInput
                    style={[styles.input, { backgroundColor: inputBackground, color: textPrimary }]}
                    placeholder="nostr+walletconnect://..."
                    placeholderTextColor={inputPlaceholder}
                    value={walletInput}
                    onChangeText={setWalletInput}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                </View>

                {/* Single action button is below the status section */}

                <View style={[styles.walletStatusContainer, { width: '100%' }]}>
                  <View style={styles.walletStatusRow}>
                    <ThemedText style={styles.walletStatusLabel}>Connection:</ThemedText>
                    <ThemedText
                      style={[
                        styles.walletStatusValue,
                        nwcConnectionStatus === true && { color: '#27ae60' },
                        nwcConnectionStatus === false && { color: '#e74c3c' },
                      ]}
                    >
                      {!walletInput.trim() && !walletUrl
                        ? 'Waiting'
                        : nwcConnectionStatus === true
                          ? 'Connected'
                          : nwcConnectionStatus === false
                            ? 'Error connecting'
                            : nwcConnecting
                              ? 'Connecting...'
                              : 'Waiting'}
                    </ThemedText>
                  </View>

                  <View style={styles.walletInfoRowMini}>
                    <ThemedText style={styles.walletInfoLabelMini}>Balance:</ThemedText>
                    {nwcConnectionStatus === true &&
                    walletInfo?.data &&
                    'get_balance' in walletInfo.data ? (
                      <ThemedText style={styles.walletInfoValueMini}>
                        ⚡ {Math.floor((walletInfo.data as any).get_balance / 1000).toLocaleString()}{' '}
                        sats
                      </ThemedText>
                    ) : (
                      <ThemedText style={[styles.walletInfoValueMini, { opacity: 0.5 }]}>
                        {!walletInput.trim() && !walletUrl
                          ? 'Waiting'
                          : nwcConnectionStatus === false
                            ? 'Error connecting'
                            : nwcConnecting
                              ? 'Connecting...'
                              : 'Waiting'}
                      </ThemedText>
                    )}
                  </View>
                </View>
              </View>
            </ScrollView>
            <View style={[styles.footer, styles.footerStack]}>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.finishButton,
                  { backgroundColor: buttonPrimary },
                  (isSavingWallet || nwcConnecting) && { opacity: 0.6 },
                ]}
                onPress={async () => {
                  // If connected and URL hasn't changed, finish; otherwise attempt to connect
                  if (nwcConnectionStatus === true && walletInput === walletUrl) {
                    setCurrentStep('splash');
                    setTimeout(() => completeOnboarding(), 2000);
                    return;
                  }

                  if (!walletInput.trim()) {
                    Alert.alert('Wallet URL required', 'Please paste your wallet URL to connect.');
                    return;
                  }

                  const validation = validateNwcUrl(walletInput);
                  if (!validation.isValid) {
                    Alert.alert('Invalid URL', validation.error || 'Invalid URL');
                    return;
                  }

                  try {
                    setIsSavingWallet(true);
                    await setWalletUrl(walletInput.trim());
                    // Give some time for connection attempt
                    setTimeout(async () => {
                      await refreshWalletInfo();
                    }, 2000);
                  } catch (e) {
                    console.error('Failed to save wallet URL:', e);
                    Alert.alert('Error', 'Failed to save wallet URL. Please try again.');
                  } finally {
                    setIsSavingWallet(false);
                  }
                }}
                disabled={isSavingWallet || nwcConnecting}
              >
                <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>
                  {nwcConnectionStatus === true && walletInput === walletUrl
                    ? 'Finish'
                    : isSavingWallet
                      ? 'Saving...'
                      : 'Connect'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    flexGrow: 1,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  logo: {
    width: '60%',
    height: 60,
  },
  pageContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  scrollPageContainer: {
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  stepWrapper: {
    flex: 1,
    width: '100%',
  },
  footer: {
    width: '100%',
    paddingTop: 12,
    paddingBottom: 32,
  },
  footerStack: {
    gap: 12,
  },
  mainTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 30,
    textAlign: 'center',
    opacity: 0.7,
  },
  // Feature Cards
  featureContainer: {
    width: '100%',
    marginBottom: 30,
    gap: 15,
  },
  featureCard: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
  },
  featureTitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  featureDescription: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 20,
  },
  // Warning Step
  warningIconContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  warningTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#f39c12',
  },
  warningCard: {
    width: '100%',
    padding: 20,
    borderRadius: 12,
    marginBottom: 30,
  },
  warningCardTitle: {
    fontSize: 18,
    marginBottom: 10,
    textAlign: 'center',
  },
  warningCardTitleSmall: {
    fontSize: 16,
  },
  warningText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.8,
  },
  warningTextSmall: {
    fontSize: 14,
    lineHeight: 20,
  },
  warningPointsContainer: {
    width: '100%',
    marginBottom: 40,
    gap: 15,
  },
  warningPoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  warningPointText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  // Choice Step
  choiceButton: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  choiceButtonTitle: {
    fontSize: 18,
    textAlign: 'center',
  },
  choiceButtonDescription: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 18,
  },
  // Buttons
  buttonGroup: {
    width: '100%',
    gap: 15,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 8,
    width: '100%',
    marginVertical: 5,
  },
  buttonText: {
    fontSize: 16,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  buttonIcon: {
    marginLeft: 8,
  },
  finishButton: {
    marginTop: 10,
  },
  copyButton: {
    marginTop: 30,
  },
  // Seed Generation
  seedContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 20,
    width: '100%',
  },
  wordContainer: {
    width: '45%',
    padding: 12,
    margin: 5,
    borderRadius: 8,
  },
  wordText: {
    textAlign: 'center',
    fontSize: 16,
  },
  // Import
  inputContainer: {
    width: '100%',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    borderRadius: 8,
    padding: 15,
    minHeight: 44,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  // Splash
  splashContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  splashLogo: {
    width: '70%',
    height: '30%',
    maxWidth: 300,
  },
  // Verification
  verificationContainer: {
    width: '100%',
    marginBottom: 20,
    alignItems: 'center',
    gap: 15,
  },
  verificationText: {
    fontSize: 16,
    marginBottom: 5,
    textAlign: 'center',
    fontWeight: '600',
  },
  verificationInput: {
    width: '100%',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    marginBottom: 10,
  },
  // Wallet Setup Step
  walletIconContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  walletSetupCard: {
    width: '100%',
    padding: 20,
    borderRadius: 12,
    marginBottom: 30,
  },
  walletSetupCardTitle: {
    fontSize: 18,
    marginBottom: 10,
    textAlign: 'center',
  },
  walletSetupText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.8,
  },
  walletSetupPointsContainer: {
    width: '100%',
    marginBottom: 40,
    gap: 15,
  },
  walletSetupPoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  walletSetupPointText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 8,
    width: '100%',
    marginVertical: 5,
  },
  skipButtonText: {
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  // Header styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    position: 'relative',
  },
  backButton: {
    padding: 8,
    marginLeft: -30,
  },
  headerText: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    position: 'absolute',
    left: 0,
    right: 0,
  },
  headerLogoWrapper: {
    padding: 8,
    marginRight: -30,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  headerLogo: {
    width: 36,
    height: 36,
  },
  // Wallet connect mini status styles
  walletStatusContainer: {
    marginTop: 16,
    width: '100%',
  },
  walletStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  walletStatusLabel: {
    fontSize: 17,
    opacity: 0.7,
  },
  walletStatusValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  walletStatusError: {
    marginTop: 4,
    fontSize: 13,
    color: '#e74c3c',
    fontStyle: 'italic',
  },
  walletInfoRowMini: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  walletInfoLabelMini: {
    fontSize: 17,
    opacity: 0.7,
  },
  walletInfoValueMini: {
    fontSize: 16,
    fontWeight: '600',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  // New styles for choice step
  choicePageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 40,
    gap: 24,
  },
  choiceTextContainer: {
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  choiceButtonGroup: {
    width: '100%',
    gap: 15,
  },
  // New styles for import step
  importPageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 40,
    gap: 24,
  },
  importTextContainer: {
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  footerCompact: {
    marginBottom: -50,
  },
});
