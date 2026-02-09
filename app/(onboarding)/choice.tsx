import { router } from 'expo-router';
import { Key, Lock, Shield } from 'lucide-react-native';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { onboardingStyles as styles } from '@/components/onboarding/styles';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useOnboardingFlow } from '@/context/OnboardingFlowContext';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function Choice() {
  const { generateNewSeedPhrase, clearSeedPhrase } = useOnboardingFlow();

  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');

  const handleGenerate = () => {
    generateNewSeedPhrase();
    router.push('/(onboarding)/generate');
  };

  const handleImportSeed = () => {
    clearSeedPhrase();
    router.push('/(onboarding)/import');
  };

  const handleImportNsec = () => {
    clearSeedPhrase();
    router.push('/(onboarding)/import/nsec');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <OnboardingHeader onBack={() => router.back()} />

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
                  onPress={handleImportSeed}
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
      </ThemedView>
    </SafeAreaView>
  );
}

