import { router } from 'expo-router';
import { ArrowRight, Shield, Zap } from 'lucide-react-native';
import { useEffect } from 'react';
import { BackHandler, Image, Platform, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { onboardingLogo } from '@/components/onboarding/assets';
import { onboardingStyles as styles } from '@/components/onboarding/styles';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function Welcome() {
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryText = useThemeColor({}, 'buttonPrimaryText');

  useEffect(() => {
    if (Platform.OS === 'android') {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => backHandler.remove();
    }
  }, []);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <View style={styles.logoContainer}>
          <Image source={onboardingLogo} style={styles.logo} resizeMode="contain" />
        </View>

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
              onPress={() => router.push('/(onboarding)/backup-warning')}
            >
              <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>
                Get Started
              </ThemedText>
              <ArrowRight size={20} color={buttonPrimaryText} style={styles.buttonIcon} />
            </TouchableOpacity>
          </View>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}
