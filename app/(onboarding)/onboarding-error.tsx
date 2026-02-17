import { router } from 'expo-router';
import { AlertCircle, AlertTriangle } from 'lucide-react-native';
import { useEffect } from 'react';
import { ScrollView, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { onboardingStyles as styles } from '@/components/onboarding/styles';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useOnboardingFlow } from '@/context/OnboardingFlowContext';
import { useThemeColor } from '@/hooks/useThemeColor';

const iconMap = {
  error: AlertCircle,
  alert: AlertTriangle,
  warning: AlertTriangle,
};

export default function OnboardingError() {
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryText = useThemeColor({}, 'buttonPrimaryText');
  const { onboardingError, setOnboardingError } = useOnboardingFlow();

  const { width, height } = useWindowDimensions();
  const shortestSide = Math.min(width, height);
  const isSmallDevice = shortestSide <= 375;

  // Redirect to welcome if no error state (only on mount to handle direct navigation)
  useEffect(() => {
    if (!onboardingError) {
      router.replace('/(onboarding)/welcome');
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: only check on mount
  }, []);

  if (!onboardingError) {
    return null;
  }

  const IconComponent = iconMap[onboardingError.icon || 'error'];
  const iconColor = onboardingError.icon === 'error' ? '#e74c3c' : '#f39c12';

  const handleTryAgain = () => {
    const retryRoute = onboardingError.retryRoute;
    // Navigate to retry route - don't clear error state here to avoid redirect loop
    // The error state will be cleared when the retry route component mounts
    router.replace(retryRoute as any);
  };

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
                <IconComponent size={isSmallDevice ? 48 : 64} color={iconColor} />
              </View>

              <ThemedText type="title" style={styles.warningTitle}>
                Setup Failed
              </ThemedText>

              <View style={[styles.warningCard, { backgroundColor: cardBackgroundColor }]}>
                <ThemedText style={[styles.warningText, isSmallDevice && styles.warningTextSmall]}>
                  {onboardingError.message}
                </ThemedText>
              </View>
            </View>
          </ScrollView>

          <View style={[styles.footer, styles.footerStack]}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: buttonPrimary }]}
              onPress={handleTryAgain}
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
