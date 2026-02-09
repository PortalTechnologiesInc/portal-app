import { router } from 'expo-router';
import { AlertTriangle } from 'lucide-react-native';
import { ScrollView, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { onboardingStyles as styles } from '@/components/onboarding/styles';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function ProfileSetupError() {
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
                <ThemedText style={[styles.warningText, isSmallDevice && styles.warningTextSmall]}>
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
              onPress={() => router.replace('/(onboarding)/profile-setup')}
            >
              <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>
                Try Again
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}

