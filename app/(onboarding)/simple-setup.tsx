import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { onboardingStyles as styles } from '@/components/onboarding/styles';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useKey } from '@/context/KeyContext';
import { useNostrService } from '@/context/NostrServiceContext';
import { SEED_ORIGIN_KEY, useOnboardingFlow } from '@/context/OnboardingFlowContext';
import { useUserProfile } from '@/context/UserProfileContext';
import { useWalletManager } from '@/context/WalletManagerContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { WALLET_TYPE } from '@/models/WalletType';
import {
  backupSeedToCloud,
  getCloudBackupEnabled,
  hasCloudBackup,
  isCloudBackupAvailable,
  restoreSeedFromCloud,
  setCloudBackupEnabled,
} from '@/services/CloudBackupService';
import { getMnemonic } from '@/services/SecureStorageService';
import { generateRandomGamertag } from '@/utils/common';

export default function SimpleSetup() {
  const backgroundColor = useThemeColor({}, 'background');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const { setMnemonic } = useKey();
  const { generateNewSeedPhrase, clearSeedPhrase, setOnboardingError } = useOnboardingFlow();
  const { fetchProfile, setProfile, waitForProfileSetup, hasProfileAssigned } = useUserProfile();
  const { getWallet } = useWalletManager();

  const nostrService = useNostrService();
  const nostrServiceRef = useRef(nostrService);
  nostrServiceRef.current = nostrService;

  const [step, setStep] = useState<
    | 'generate-key'
    | 'save-securestore'
    | 'backup-cloud'
    | 'generate-profile'
    | 'wallet-setup'
    | 'restore-cloud'
  >('generate-key');

  const stepMessages = {
    'restore-cloud': 'Restoring your key from cloud backup...',
    'generate-key': 'Creating your secure identity...',
    'save-securestore': 'Saving your key to secure storage...',
    'backup-cloud': 'Backing up your key to the cloud...',
    'generate-profile': 'Generating your profile...',
    'wallet-setup': 'Setting up your wallet...',
  };
  const stepErrors = {
    'restore-cloud': 'Failed to restore key from cloud backup',
    'generate-key': 'Failed to generate key',
    'save-securestore': 'Failed to save key to secure storage',
    'backup-cloud': 'Failed to backup key to cloud',
    'generate-profile': 'Failed to generate profile',
    'wallet-setup': 'Failed to setup wallet',
  };

  const generateKey = async () => {
    // Check if mnemonic already exists (e.g., from a previous failed attempt)
    const existingMnemonic = await getMnemonic();
    if (existingMnemonic) {
      return; // Use existing mnemonic, don't regenerate
    }

    const newSeedPhrase = generateNewSeedPhrase();
    await setMnemonic(newSeedPhrase);
  };

  const backupOnCloud = async () => {
    // Permission already requested on onboarding permissions page; avoid showing banner here
    const available = await isCloudBackupAvailable({ requestPermission: false });
    if (!available) {
      if (__DEV__) {
        console.warn(
          'Cloud backup not available (add a Google account on Android, or sign in to iCloud on iOS), skipping...'
        );
      }
      return; // Skip silently (no Google/iCloud account)
    }
    const mnemonic = await getMnemonic();
    if (!mnemonic) {
      throw new Error('No mnemonic to backup');
    }
    await backupSeedToCloud(mnemonic);
  };

  const generateProfile = async () => {
    // Use ref to always get the latest nostrService state (avoids stale closure)
    let retries = 0;
    const maxRetries = 60; // 30 seconds total
    while (!nostrServiceRef.current.isInitialized && retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 500));
      retries++;
    }

    if (!nostrServiceRef.current.isInitialized || !nostrServiceRef.current.publicKey) {
      throw new Error('Nostr service not initialized');
    }

    if (hasProfileAssigned()) {
      return; // Profile already exists, skip
    }

    const result = await fetchProfile(nostrServiceRef.current.publicKey!);

    if (result.found && result.username) {
      const success = await waitForProfileSetup(15000);
      if (!success) {
        throw new Error('Profile setup timeout');
      }
      return;
    }

    const randomUsername = generateRandomGamertag();
    await setProfile(randomUsername, '');
    const success = await waitForProfileSetup(15000);
    if (!success) {
      throw new Error('Profile setup timeout');
    }
  };

  const setupWallet = async () => {
    // Small delay to ensure mnemonic is saved and KeyContext is updated
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get/create Breez wallet - this will initialize it if not already done
    await getWallet(WALLET_TYPE.BREEZ);
  };

  useEffect(() => {
    const setup = async () => {
      let currentStep: typeof step = 'generate-key';
      try {
        await setCloudBackupEnabled(true); // Default on for simple setup only

        // 1) If there is an existing cloud backup, offer Restore vs Create new identity.
        const existingBackup = await hasCloudBackup();
        if (existingBackup) {
          const choice: 'restore' | 'new' = await new Promise(resolve => {
            Alert.alert(
              'Cloud backup found',
              'We found an existing Portal backup in your cloud storage. Do you want to restore it or create a new identity?',
              [
                {
                  text: 'Create new identity',
                  style: 'destructive',
                  onPress: () => resolve('new'),
                },
                {
                  text: 'Restore from cloud',
                  style: 'default',
                  onPress: () => resolve('restore'),
                },
              ],
              { cancelable: false }
            );
          });

          if (choice === 'restore') {
            currentStep = 'restore-cloud';
            setStep(currentStep);
            const restoredMnemonic = await restoreSeedFromCloud();
            await setMnemonic(restoredMnemonic);
            await SecureStore.setItemAsync(SEED_ORIGIN_KEY, 'simple');

            currentStep = 'generate-profile';
            setStep(currentStep);
            await generateProfile();

            currentStep = 'wallet-setup';
            setStep(currentStep);
            await setupWallet();

            router.replace('/(onboarding)/identity-verification');
            return;
          }
        }

        // 2) No backup found, or user chose to create a new identity.
        currentStep = 'generate-key';
        setStep(currentStep);
        await generateKey();
        currentStep = 'save-securestore';
        setStep(currentStep);
        await SecureStore.setItemAsync(SEED_ORIGIN_KEY, 'simple');
        currentStep = 'backup-cloud';
        setStep(currentStep);
        if (await getCloudBackupEnabled()) await backupOnCloud();
        currentStep = 'generate-profile';
        setStep(currentStep);
        await generateProfile();
        currentStep = 'wallet-setup';
        setStep(currentStep);
        await setupWallet();
        router.replace('/(onboarding)/identity-verification');
      } catch (error) {
        setOnboardingError({
          message: stepErrors[currentStep as keyof typeof stepErrors],
          retryRoute: '/(onboarding)/simple-setup',
        });
        router.replace('/(onboarding)/onboarding-error');
      }
    };

    setup();
    // biome-ignore lint/correctness/useExhaustiveDependencies: we want to run the setup function only once
  }, []);

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
        <OnboardingHeader onBack={() => {}} hideBackButton={true} />
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
