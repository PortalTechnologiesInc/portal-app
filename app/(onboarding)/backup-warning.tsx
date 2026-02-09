import { router } from 'expo-router';
import { AlertTriangle, CheckCircle } from 'lucide-react-native';
import { useWindowDimensions, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { onboardingStyles as styles } from '@/components/onboarding/styles';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function BackupWarning() {
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryText = useThemeColor({}, 'buttonPrimaryText');

  const { width, height } = useWindowDimensions();
  const shortestSide = Math.min(width, height);
  const isSmallDevice = shortestSide <= 375;

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
              onPress={() => router.push('/(onboarding)/choice')}
            >
              <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>
                I Understand - Continue
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}

