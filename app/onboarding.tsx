import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Key,
  Lock,
  Shield,
  Zap,
} from 'lucide-react-native';
import { generateMnemonic, Mnemonic, Nsec } from 'portal-app-lib';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PINKeypad } from '@/components/PINKeypad';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAppLock } from '@/context/AppLockContext';
import { useKey } from '@/context/KeyContext';
import { useNostrService } from '@/context/NostrServiceContext';
import { useOnboarding } from '@/context/OnboardingContext';
import { useUserProfile } from '@/context/UserProfileContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { WALLET_TYPE } from '@/models/WalletType';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '@/services/AppLockService';
import { generateRandomGamertag } from '@/utils/common';
import { showToast } from '@/utils/Toast';

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
  | 'pin-setup'
  | 'profile-setup'
  | 'profile-setup-error'
  | 'splash';

export default function Onboarding() {
  const { completeOnboarding } = useOnboarding();
  const { setMnemonic, setNsec } = useKey();
  const { setupPIN, setLockEnabled, isBiometricAvailable } = useAppLock();
  const { fetchProfile, setProfile, waitForProfileSetup, hasProfileAssigned } = useUserProfile();
  const nostrService = useNostrService();
  const params = useLocalSearchParams();
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
  const [importType, setImportType] = useState<'seed' | 'nsec'>('seed');
  const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter');
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [_isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [pinSetupPreviousStep, _setPinSetupPreviousStep] = useState<OnboardingStep>('import');

  // Support debug mode: jump to specific step via query parameter
  useEffect(() => {
    if (__DEV__ && params.step) {
      const stepParam = params.step as string;
      if (
        [
          'welcome',
          'backup-warning',
          'choice',
          'generate',
          'verify',
          'import',
          'pin-setup',
          'profile-setup',
          'profile-setup-error',
          'splash',
        ].includes(stepParam)
      ) {
        setCurrentStep(stepParam as OnboardingStep);
      }
    }
  }, [params.step]);

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const surfaceSecondary = useThemeColor({}, 'surfaceSecondary');
  const textPrimary = useThemeColor({}, 'textPrimary');
  const inputBackground = useThemeColor({}, 'inputBackground');
  const inputPlaceholder = useThemeColor({}, 'inputPlaceholder');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryText = useThemeColor({}, 'buttonPrimaryText');
  const buttonDanger = useThemeColor({}, 'buttonDanger');

  const { width, height } = useWindowDimensions();
  const shortestSide = Math.min(width, height);
  const isSmallDevice = shortestSide <= 375;

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

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

  useEffect(() => {
    let isMounted = true;
    isBiometricAvailable()
      .then(result => {
        if (isMounted) {
          setIsBiometricSupported(result);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsBiometricSupported(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [isBiometricAvailable]);

  // Check for app reset completion and show toast
  useEffect(() => {
    const checkResetComplete = async () => {
      try {
        const resetFlag = await AsyncStorage.getItem('app_reset_complete');
        if (resetFlag === 'true') {
          // Show toast after a small delay to ensure screen is fully rendered
          setTimeout(() => {
            showToast('App reset successful!', 'success');
          }, 300);
          // Remove the flag
          await AsyncStorage.removeItem('app_reset_complete');
        }
      } catch (_error) {
        // Ignore errors checking flag
      }
    };

    // Check immediately and also with a small delay to catch flag set after mount
    checkResetComplete();
    const timeoutId = setTimeout(checkResetComplete, 200);
    return () => clearTimeout(timeoutId);
  }, []);

  const resetPinState = useCallback(() => {
    setPinStep('enter');
    setEnteredPin('');
    setPinError('');
  }, []);

  // Handle profile setup for imported seeds before completing onboarding
  const handleProfileSetup = useCallback(async () => {
    try {
      // Check if seed was imported
      const seedOrigin = await SecureStore.getItemAsync(SEED_ORIGIN_KEY);
      if (seedOrigin !== 'imported') {
        // Not an imported seed, proceed normally
        return true;
      }

      // Wait for NostrService to be initialized
      let retries = 0;
      const maxRetries = 30; // Wait up to 15 seconds for initialization
      while (!nostrService.isInitialized && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500));
        retries++;
      }

      if (!nostrService.isInitialized || !nostrService.publicKey) {
        // NostrService not ready, show error
        return false;
      }

      // Check if profile is already assigned
      if (hasProfileAssigned()) {
        return true;
      }

      // Try to fetch existing profile
      const result = await fetchProfile(nostrService.publicKey);

      if (result.found && result.username) {
        // Profile found, wait for it to be set
        const success = await waitForProfileSetup(15000);
        return success;
      }

      // No profile found, generate and set one
      const randomUsername = generateRandomGamertag();
      try {
        await setProfile(randomUsername, '');
        // Wait for profile setup to complete
        const success = await waitForProfileSetup(15000);
        return success;
      } catch (_error) {
        // Profile setup failed
        return false;
      }
    } catch (_error) {
      // Error during profile setup
      return false;
    }
  }, [nostrService, hasProfileAssigned, fetchProfile, setProfile, waitForProfileSetup]);

  const goToPreviousStep = useCallback(() => {
    const previousSteps: Record<OnboardingStep, OnboardingStep | null> = {
      welcome: null,
      'backup-warning': 'welcome',
      choice: 'backup-warning',
      generate: 'choice',
      verify: 'generate',
      import: 'choice',
      'pin-setup': pinSetupPreviousStep,
      'profile-setup': 'pin-setup',
      'profile-setup-error': 'profile-setup',
      splash: null,
    };

    const previousStep = previousSteps[currentStep];
    if (previousStep) {
      setCurrentStep(previousStep);
    }
  }, [currentStep, pinSetupPreviousStep]);

  // Add this function to your component
  const okBack = useCallback(
    (stateToClear?: () => void) => {
      // Clear the specified state if provided
      if (stateToClear) {
        stateToClear();
      }
      // Navigate to previous step
      goToPreviousStep();
    },
    [goToPreviousStep]
  );

  // set the preferred wallet as Breez by default on first load
  useEffect(() => {
    const setPreferredWalletDefault = async () => {
      await AsyncStorage.setItem('preferred_wallet', JSON.stringify(WALLET_TYPE.BREEZ));
    };
    setPreferredWalletDefault();
  }, []);

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
          case 'pin-setup':
            okBack(() => resetPinState());
            break;
          case 'profile-setup':
            // Go back to pin-setup
            setCurrentStep('pin-setup');
            return true; // Block default back behavior
          case 'profile-setup-error':
            // Allow retry by going back to profile-setup
            setCurrentStep('profile-setup');
            // Retry profile setup
            handleProfileSetup().then(success => {
              if (success) {
                setCurrentStep('splash');
                setTimeout(() => {
                  completeOnboarding();
                }, 2000);
              } else {
                setCurrentStep('profile-setup-error');
              }
            });
            return true; // Block default back behavior
          case 'import':
            okBack(() => {
              setSeedPhrase('');
              setImportType('seed');
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
  }, [currentStep, okBack, resetPinState, handleProfileSetup, completeOnboarding]);

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
      return { isValid: false, error: 'Please enter a seed phrase.' };
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
    } catch {
      return {
        isValid: false,
        error: 'Invalid seed phrase. Please check your words and try again.',
      };
    }
  };

  const validateImportedNsec = (nsec: string): { isValid: boolean; error?: string } => {
    const trimmedNsec = nsec.trim().toLowerCase();

    if (!trimmedNsec) {
      return { isValid: false, error: 'Please enter an nsec.' };
    }

    // Use the actual Nsec class to validate, which handles all valid formats
    try {
      new Nsec(trimmedNsec);
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error:
          error instanceof Error
            ? error.message
            : 'Invalid Nsec. Please check your Nsec and try again.',
      };
    }
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

      // Go to dashboard
      handleSkipWalletSetup();
    } catch (_error) {
      // Still go to dashboard even if saving fails
      handleSkipWalletSetup();
    }
  };

  const handleGenerateComplete = async () => {
    // In development mode, skip verification and go to dashboard directly
    if (__DEV__) {
      try {
        // Save the mnemonic using our provider
        await setMnemonic(seedPhrase);

        // Mark this as a generated seed (no need to fetch profile)
        await SecureStore.setItemAsync(SEED_ORIGIN_KEY, 'generated');

        // Go to dashboard
        handleSkipWalletSetup();
      } catch (_error) {
        // Still go to dashboard even if saving fails
        handleSkipWalletSetup();
      }
      return;
    }

    // In production mode, go to verification step
    handleContinueToVerification();
  };

  const handleImport = async () => {
    await setSeedPhrase('');
    setImportType('seed');
    setCurrentStep('import');
  };

  const handleImportNsec = async () => {
    await setSeedPhrase('');
    setImportType('nsec');
    setCurrentStep('import');
  };

  const handleCopySeedPhrase = () => {
    Clipboard.setStringAsync(seedPhrase);
  };

  const handleImportMnemonicComplete = async () => {
    const validation = validateImportedMnemonic(seedPhrase);

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

      // Proceed to Dashboard
      handleSkipWalletSetup();
    } catch (_error) {
      Alert.alert('Error', 'Failed to save your seed phrase. Please try again.');
    }
  };

  const handleImportNsecComplete = async () => {
    const validation = validateImportedNsec(seedPhrase);

    if (!validation.isValid) {
      Alert.alert('Invalid Nsec', validation.error || 'Please check your Nsec and try again.');
      return;
    }

    try {
      const normalizedNsec = seedPhrase.trim().toLowerCase();
      await setNsec(normalizedNsec);

      // Mark this as an imported seed (should fetch profile first)
      await SecureStore.setItemAsync(SEED_ORIGIN_KEY, 'imported');
      // Go to wallet setup step
      handleSkipWalletSetup();
    } catch (_error) {
      Alert.alert('Error', 'Failed to save your Nsec. Please try again.');
    }
  };

  const handleSkipWalletSetup = () => {
    // Skip wallet setup and go to PIN setup
    resetPinState();
    setCurrentStep('pin-setup');
  };

  const handleCompletionWithoutPIN = async () => {
    // Complete onboarding without setting up a PIN
    resetPinState();

    // Check if we need to set up profile for imported seed
    setCurrentStep('profile-setup');
    const profileSetupSuccess = await handleProfileSetup();

    if (!profileSetupSuccess) {
      // Profile setup failed, show error page
      setCurrentStep('profile-setup-error');
      return;
    }

    // Profile setup successful, proceed to splash
    setCurrentStep('splash');
    setTimeout(() => {
      completeOnboarding();
    }, 2000);
  };

  const handlePinEntryComplete = async (pin: string) => {
    if (isSavingPin) {
      return;
    }

    if (pinStep === 'enter') {
      setEnteredPin(pin);
      setPinStep('confirm');
      setPinError('');
      return;
    }

    if (pin !== enteredPin) {
      setPinError('PINs do not match. Please try again.');
      setTimeout(() => {
        resetPinState();
      }, 1500);
      return;
    }

    try {
      setIsSavingPin(true);
      await setupPIN(pin);
      // Always enable app lock when setting up PIN in onboarding
      await setLockEnabled(true);
      resetPinState();

      // Check if we need to set up profile for imported seed
      setCurrentStep('profile-setup');
      const profileSetupSuccess = await handleProfileSetup();

      if (!profileSetupSuccess) {
        // Profile setup failed, show error page
        setCurrentStep('profile-setup-error');
        return;
      }

      // Profile setup successful, proceed to splash
      setCurrentStep('splash');
      setTimeout(() => {
        completeOnboarding();
      }, 2000);
    } catch (_error) {
      setPinError('Unable to save PIN. Please try again.');
    } finally {
      setIsSavingPin(false);
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
      case 'pin-setup':
        return () => okBack(() => resetPinState());
      case 'profile-setup':
        return () => setCurrentStep('pin-setup');
      case 'profile-setup-error':
        return () => {
          // Retry profile setup
          setCurrentStep('profile-setup');
          handleProfileSetup().then(success => {
            if (success) {
              setCurrentStep('splash');
              setTimeout(() => {
                completeOnboarding();
              }, 2000);
            } else {
              setCurrentStep('profile-setup-error');
            }
          });
        };
      case 'import':
        return () =>
          okBack(() => {
            setSeedPhrase('');
            setImportType('seed');
          });
      default:
        return () => okBack();
    }
  };

  // Helper function to check if back button should be shown
  const shouldShowBackButton = () => {
    return (
      currentStep !== 'welcome' &&
      currentStep !== ('splash' as OnboardingStep) &&
      currentStep !== 'profile-setup' &&
      currentStep !== 'profile-setup-error'
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        {/* Header with Back Button */}
        {shouldShowBackButton() && (
          <ThemedView style={styles.header}>
            <TouchableOpacity
              onPress={getBackButtonHandler()}
              style={styles.backButton}
              activeOpacity={0.7}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            >
              <ArrowLeft size={24} color={textPrimary} />
            </TouchableOpacity>
            <ThemedText style={[styles.headerText, { color: textPrimary }]}>
              Portal Setup
            </ThemedText>
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
                <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>
                  Get Started
                </ThemedText>
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
                  <ThemedText
                    style={[styles.warningText, isSmallDevice && styles.warningTextSmall]}
                  >
                    Portal generates a unique 12-word seed phrase that gives you complete control
                    over your digital identity and authentication.
                  </ThemedText>
                </View>

                <View style={styles.warningPointsContainer}>
                  <View style={styles.warningPoint}>
                    <CheckCircle size={20} color="#27ae60" />
                    <ThemedText style={styles.warningPointText}>
                      <ThemedText type="defaultSemiBold">Write it down</ThemedText> on paper and
                      store it safely
                    </ThemedText>
                  </View>

                  <View style={styles.warningPoint}>
                    <CheckCircle size={20} color="#27ae60" />
                    <ThemedText style={styles.warningPointText}>
                      <ThemedText type="defaultSemiBold">Never share it</ThemedText> with anyone -
                      not even Portal support
                    </ThemedText>
                  </View>

                  <View style={styles.warningPoint}>
                    <CheckCircle size={20} color="#27ae60" />
                    <ThemedText style={styles.warningPointText}>
                      <ThemedText type="defaultSemiBold">Keep multiple copies</ThemedText> in
                      secure, separate locations
                    </ThemedText>
                  </View>

                  <View style={styles.warningPoint}>
                    <AlertTriangle size={20} color="#e74c3c" />
                    <ThemedText style={styles.warningPointText}>
                      <ThemedText type="defaultSemiBold">
                        If you lose it, you lose access
                      </ThemedText>{' '}
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
                      Import Existing Seed Phrase
                    </ThemedText>
                    <ThemedText style={styles.choiceButtonDescription}>
                      Restore your identity using an existing 12-word seed phrase
                    </ThemedText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.choiceButton, { backgroundColor: cardBackgroundColor }]}
                    onPress={handleImportNsec}
                  >
                    <Lock size={24} color={buttonPrimary} />
                    <ThemedText type="defaultSemiBold" style={styles.choiceButtonTitle}>
                      Import Nsec
                    </ThemedText>
                    <ThemedText style={styles.choiceButtonDescription}>
                      Restore your identity using an existing Nsec private key
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
                      {importType === 'nsec' ? 'Import Nsec' : 'Import Seed Phrase'}
                    </ThemedText>
                    <ThemedText style={styles.subtitle}>
                      {importType === 'nsec'
                        ? 'Enter your Nsec private key'
                        : 'Enter your 12-word seed phrase'}
                    </ThemedText>
                  </View>

                  <View style={styles.inputContainer}>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: inputBackground, color: textPrimary },
                      ]}
                      placeholder={
                        importType === 'nsec'
                          ? 'Enter your Nsec private key (nsec1...)'
                          : 'Enter your 12-word seed phrase separated by spaces'
                      }
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
                  onPress={
                    importType === 'nsec' ? handleImportNsecComplete : handleImportMnemonicComplete
                  }
                >
                  <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>
                    Import
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        )}

        {/* PIN Setup Step */}
        {currentStep === 'pin-setup' && (
          <View style={[styles.stepWrapper, styles.pinSetupFull]}>
            <View style={styles.pinSetupContent}>
              <View style={[styles.pinIconContainer, { backgroundColor: `${buttonPrimary}20` }]}>
                <Shield size={32} color={buttonPrimary} />
              </View>
              <ThemedText type="title" style={styles.title}>
                Secure Portal with a PIN
              </ThemedText>
              <ThemedText style={styles.subtitle}>
                Protect your app by requiring a PIN for sensitive actions.
              </ThemedText>
              {isSavingPin && (
                <ThemedText style={[styles.pinSavingText, { color: textPrimary }]}>
                  Saving PIN...
                </ThemedText>
              )}
              <View style={styles.pinKeypadContainer}>
                <View style={styles.pinErrorContainer}>
                  {pinError ? (
                    <ThemedText
                      style={[styles.errorText, styles.pinErrorText, { color: buttonDanger }]}
                    >
                      {pinError}
                    </ThemedText>
                  ) : null}
                </View>
                <PINKeypad
                  key={pinStep}
                  onPINComplete={handlePinEntryComplete}
                  minLength={PIN_MIN_LENGTH}
                  maxLength={PIN_MAX_LENGTH}
                  autoSubmit={false}
                  submitLabel={pinStep === 'enter' ? 'Next' : 'Confirm'}
                  showDots
                  error={!!pinError}
                  onError={() => setPinError('')}
                  showSkipButton
                  onSkipPress={handleCompletionWithoutPIN}
                  skipLabel="Skip"
                />
              </View>
            </View>
          </View>
        )}

        {/* Profile Setup Step */}
        {currentStep === 'profile-setup' && (
          <View style={[styles.stepWrapper, styles.pinSetupFull]}>
            <View style={styles.pinSetupContent}>
              <View style={[styles.pinIconContainer, { backgroundColor: `${buttonPrimary}20` }]}>
                <Shield size={32} color={buttonPrimary} />
              </View>
              <ThemedText type="title" style={styles.title}>
                Setting Up Your Profile
              </ThemedText>
              <ThemedText style={styles.subtitle}>
                Please wait while we set up your digital identity...
              </ThemedText>
              <ActivityIndicator size="large" color={buttonPrimary} style={styles.loadingSpinner} />
            </View>
          </View>
        )}

        {/* Profile Setup Error Step */}
        {currentStep === 'profile-setup-error' && (
          <View style={styles.stepWrapper}>
            <ScrollView
              contentContainerStyle={[styles.scrollContent, styles.centeredScrollContent]}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.pageContainer}>
                <View style={styles.warningIconContainer}>
                  <AlertTriangle size={isSmallDevice ? 48 : 64} color="#e74c3c" />
                </View>

                <ThemedText type="title" style={styles.warningTitle}>
                  Profile Setup Failed
                </ThemedText>

                <View style={[styles.warningCard, { backgroundColor: cardBackgroundColor }]}>
                  <ThemedText
                    style={[styles.warningText, isSmallDevice && styles.warningTextSmall]}
                  >
                    We couldn't set up your profile right now. This might be due to a network
                    connection issue.
                  </ThemedText>
                </View>

                <View style={styles.warningPointsContainer}>
                  <ThemedText style={styles.warningPointText}>
                    Please check your internet connection and try again later.
                  </ThemedText>
                </View>
              </View>
            </ScrollView>
            <View style={[styles.footer, styles.footerStack]}>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: buttonPrimary }]}
                onPress={() => {
                  // Retry profile setup
                  setCurrentStep('profile-setup');
                  handleProfileSetup().then(success => {
                    if (success) {
                      setCurrentStep('splash');
                      setTimeout(() => {
                        completeOnboarding();
                      }, 2000);
                    } else {
                      setCurrentStep('profile-setup-error');
                    }
                  });
                }}
              >
                <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>
                  Try Again
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
  centeredScrollContent: {
    justifyContent: 'center',
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
    marginBottom: 10,
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
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '600',
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
  pinIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  pinSetupFull: {
    justifyContent: 'center',
  },
  pinSetupContent: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 24,
  },
  pinKeypadContainer: {
    width: '100%',
    marginTop: 10,
    alignItems: 'center',
  },
  pinErrorContainer: {
    minHeight: 40,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  pinErrorText: {
    textAlign: 'center',
  },
  pinSavingText: {
    textAlign: 'center',
    marginBottom: 12,
    fontSize: 14,
    opacity: 0.8,
  },
  loadingSpinner: {
    marginTop: 30,
    marginBottom: 20,
  },
  // Header styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    position: 'relative',
    minHeight: 56,
  },
  backButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'flex-start',
    zIndex: 1,
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
