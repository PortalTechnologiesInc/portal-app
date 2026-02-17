import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { onboardingStyles as styles } from '@/components/onboarding/styles';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useKey } from '@/context/KeyContext';
import { useNostrService } from '@/context/NostrServiceContext';
import { SEED_ORIGIN_KEY, useOnboardingFlow } from '@/context/OnboardingFlowContext';
import { useUserProfile } from '@/context/UserProfileContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { generateRandomGamertag } from '@/utils/common';

export default function SimpleSetup() {
  const backgroundColor = useThemeColor({}, 'background');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const { setMnemonic } = useKey();
  const { generateNewSeedPhrase, clearSeedPhrase, setOnboardingError, seedPhrase } =
    useOnboardingFlow();
  const { fetchProfile, setProfile, waitForProfileSetup, hasProfileAssigned } = useUserProfile();

  const nostrService = useNostrService();
  const [step, setStep] = useState<
    'generate-key' | 'save-securestore' | 'backup-cloud' | 'generate-profile'
  >('generate-key');

  const stepMessages = {
    'generate-key': 'Creating your secure identity...',
    'save-securestore': 'Saving your key to secure storage...',
    'backup-cloud': 'Backing up your key to the cloud...',
    'generate-profile': 'Generating your profile...',
  };
  const stepErrors = {
    'generate-key': 'Failed to generate key',
    'save-securestore': 'Failed to save key to secure storage',
    'backup-cloud': 'Failed to backup key to cloud',
    'generate-profile': 'Failed to generate profile',
  };

  const generateKey = async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const newSeedPhrase = generateNewSeedPhrase();
    await setMnemonic(newSeedPhrase);
  };

  const backupOnCloud = async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    // TODO: Implement backup to cloud
  };

  const generateProfile = async () => {
    let retries = 0;
    const maxRetries = 30;
    while (!nostrService.isInitialized && retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 500));
      retries++;
    }

    if (!nostrService.isInitialized || !nostrService.publicKey) {
      return false;
    }

    if (hasProfileAssigned()) {
      return true;
    }

    const result = await fetchProfile(nostrService.publicKey);

    if (result.found && result.username) {
      return await waitForProfileSetup(15000);
    }

    const randomUsername = generateRandomGamertag();
    try {
      await setProfile(randomUsername, '');
      return await waitForProfileSetup(15000);
    } catch (_error) {
      return false;
    }
  };

  useEffect(() => {
    const setup = async () => {
      try {
        await generateKey();
        setStep('save-securestore');
        await SecureStore.setItemAsync(SEED_ORIGIN_KEY, 'generated');
        setStep('backup-cloud');
        await backupOnCloud();
        setStep('generate-profile');
        await generateProfile();
        router.replace('/(onboarding)/identity-verification');
      } catch (error) {
        setOnboardingError({
          message: 'Failed to generate key',
          retryRoute: '/(onboarding)/simple-setup',
        });
        router.replace('/(onboarding)/onboarding-error');
      }
    };

    setup();
  }, [setMnemonic, generateNewSeedPhrase, clearSeedPhrase]);

  useEffect(() => {
    return () => {
      clearSeedPhrase(); // Cleanup if we exit the screen
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'android') {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => backHandler.remove();
    }
  }, []);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <View style={[styles.stepWrapper, styles.pinSetupFull]}>
          <View style={styles.pinSetupContent}>
            <ThemedText type="title" style={styles.title}>
              {stepMessages[step as keyof typeof stepMessages]}
            </ThemedText>
            <ActivityIndicator size="large" color={buttonPrimary} style={styles.loadingSpinner} />
          </View>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}
