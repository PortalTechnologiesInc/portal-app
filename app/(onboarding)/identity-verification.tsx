import { router } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, Platform, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { onboardingStyles as styles } from '@/components/onboarding/styles';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function IdentityVerification() {
  const backgroundColor = useThemeColor({}, 'background');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryText = useThemeColor({}, 'buttonPrimaryText');

  useEffect(() => {
    if (Platform.OS === 'android') {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        return true; // Block back navigation
      });
      return () => backHandler.remove();
    }
  }, []);

  const handleStart = () => {
    // TODO: Start verification process
    router.push('/(onboarding)/pin-setup');
  };

  const handleSkip = () => {
    router.push('/(onboarding)/pin-setup');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <OnboardingHeader onBack={() => {}} hideBackButton={true} />

        <View style={styles.stepWrapper}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.pageContainer, styles.scrollPageContainer]}>
              <ThemedText type="title" style={styles.title}>
                Identity Verification
              </ThemedText>
              <ThemedText style={styles.subtitle}>
                Verify your identity to enhance security (optional)
              </ThemedText>

              {/* TODO: Add camera preview here for video streaming */}
              <View
                style={{
                  width: '100%',
                  height: 300,
                  backgroundColor: '#1a1a1a',
                  borderRadius: 12,
                  marginTop: 20,
                }}
              >
                {/* Camera preview placeholder */}
              </View>
            </View>
          </ScrollView>

          <View style={[styles.footer, styles.footerStack]}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: buttonPrimary }]}
              onPress={handleStart}
            >
              <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>
                Start
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: 'transparent', borderWidth: 1, borderColor: buttonPrimary },
              ]}
              onPress={handleSkip}
            >
              <ThemedText style={[styles.buttonText, { color: buttonPrimary }]}>Skip</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}
