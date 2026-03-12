import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Wallet } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useOnboarding } from '@/context/OnboardingContext';
import { usePortalApp } from '@/context/PortalAppContext';
import { useThemeColor } from '@/hooks/useThemeColor';

const REVOLUT_BANNER_DISMISSED_KEY = 'portal_revolut_banner_dismissed';
const FIRST_LAUNCH_KEY = 'portal_first_launch_completed';

type WelcomeBannerProps = {
  onCompleted?: () => void;
};

export function WelcomeBanner({ onCompleted }: WelcomeBannerProps) {
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');

  const [isDismissed, setIsDismissed] = useState<boolean | null>(null);
  const [visible, setVisible] = useState<boolean>(false);

  const { isOnboardingComplete, isLoading } = useOnboarding();
  const appService = usePortalApp();

  const checkFirstLaunch = useCallback(async () => {
    try {
      if (isLoading) return;

      if (!isOnboardingComplete) {
        setVisible(false);
        return;
      }

      const firstLaunch = await SecureStore.getItemAsync(FIRST_LAUNCH_KEY);
      setVisible(firstLaunch !== 'true');
    } catch (_e) {
      setVisible(false);
    }
  }, [isOnboardingComplete, isLoading]);

  useEffect(() => {
    checkFirstLaunch();
  }, [checkFirstLaunch]);

  // Re-check FIRST_LAUNCH_KEY when screen comes into focus
  // This ensures banner hides immediately after scan button click
  useFocusEffect(
    useCallback(() => {
      checkFirstLaunch();
    }, [checkFirstLaunch])
  );

  useEffect(() => {
    const checkDismissed = async () => {
      try {
        const dismissed = await SecureStore.getItemAsync(REVOLUT_BANNER_DISMISSED_KEY);
        setIsDismissed(dismissed === 'true');
      } catch (_e) {
        setIsDismissed(false);
      }
    };
    checkDismissed();
  }, []);

  useEffect(() => {
    if (Object.values(appService.pendingRequests).length > 0) {
      // Auto-dismiss when pending requests appear (same as old behavior)
      const autoDismiss = async () => {
        try {
          await SecureStore.setItemAsync(FIRST_LAUNCH_KEY, 'true');
          setVisible(false);
          onCompleted?.();
        } catch (_e) {}
      };
      autoDismiss();
    }
  }, [appService.pendingRequests, onCompleted]);

  const handleDismiss = useCallback(async () => {
    try {
      await SecureStore.setItemAsync(REVOLUT_BANNER_DISMISSED_KEY, 'true');
      setIsDismissed(true);
      await SecureStore.setItemAsync(FIRST_LAUNCH_KEY, 'true');
      setVisible(false);
      onCompleted?.();
    } catch (_e) {}
  }, [onCompleted]);

  if (isDismissed === null || isDismissed === true || !visible) {
    return null;
  }

  return (
    <View style={styles.welcomeContainer}>
      <ThemedView style={[styles.welcomeCard, { backgroundColor: cardBackgroundColor }]}>
        <ThemedText
          type="title"
          style={styles.welcomeTitle}
          darkColor={Colors.almostWhite}
          lightColor={Colors.gray900}
        >
          Welcome to Portal App!
        </ThemedText>

        <ThemedText
          style={styles.welcomeSubtitle}
          darkColor={Colors.dirtyWhite}
          lightColor={Colors.gray700}
        >
          Your secure mobile identity wallet for authentication and payments
        </ThemedText>

        <View style={styles.illustrationContainer}>
          <Wallet size={80} color={buttonPrimaryColor} style={styles.illustration} />
        </View>

        <ThemedText
          style={styles.welcomeDescription}
          darkColor={Colors.dirtyWhite}
          lightColor={Colors.gray700}
        >
          You’re all set to start using Portal for secure authentication and payments.
        </ThemedText>

        <TouchableOpacity style={styles.dismissButton} onPress={handleDismiss}>
          <ThemedText
            style={styles.dismissText}
            darkColor={Colors.dirtyWhite}
            lightColor={Colors.gray600}
          >
            Dismiss
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  welcomeContainer: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  welcomeCard: {
    borderRadius: 20,
    padding: 24,
    minHeight: 200,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  illustrationContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  illustration: {
    opacity: 0.9,
  },
  welcomeDescription: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 30,
  },
  dismissButton: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 8,
  },
  dismissText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
