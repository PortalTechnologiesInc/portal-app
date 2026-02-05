import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { onboardingStyles as styles } from '@/components/onboarding/styles';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useNostrService } from '@/context/NostrServiceContext';
import { SEED_ORIGIN_KEY } from '@/context/OnboardingFlowContext';
import { useUserProfile } from '@/context/UserProfileContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { generateRandomGamertag } from '@/utils/common';

export default function ProfileSetup() {
  const backgroundColor = useThemeColor({}, 'background');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');

  const nostrService = useNostrService();
  const { fetchProfile, setProfile, waitForProfileSetup, hasProfileAssigned } = useUserProfile();

  useEffect(() => {
    let isMounted = true;

    const handleProfileSetup = async () => {
      try {
        const seedOrigin = await SecureStore.getItemAsync(SEED_ORIGIN_KEY);
        if (seedOrigin !== 'imported') {
          return true;
        }

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
      } catch (_error) {
        return false;
      }
    };

    const run = async () => {
      const success = await handleProfileSetup();
      if (!isMounted) return;
      router.replace(success ? '/(onboarding)/splash' : '/(onboarding)/profile-setup-error');
    };

    run();

    return () => {
      isMounted = false;
    };
  }, [nostrService, fetchProfile, setProfile, waitForProfileSetup, hasProfileAssigned]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <View style={[styles.stepWrapper, styles.pinSetupFull]}>
          <View style={styles.pinSetupContent}>
            <ThemedText type="title" style={styles.title}>
              Setting Up Your Profile
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              Please wait while we set up your digital identity...
            </ThemedText>
            <ActivityIndicator size="large" color={buttonPrimary} style={styles.loadingSpinner} />
          </View>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}
