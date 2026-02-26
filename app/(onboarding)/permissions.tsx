import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Bell, Check, Cloud } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Platform, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { onboardingStyles as styles } from '@/components/onboarding/styles';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useOnboardingFlow } from '@/context/OnboardingFlowContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { isCloudBackupAvailable } from '@/services/CloudBackupService';
import { setNotificationsEnabled } from '@/services/NotificationService';

const PERMISSIONS_SKIPPED_KEY = 'portal_onboarding_permissions_skipped';

export async function getOnboardingPermissionsSkipped(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(PERMISSIONS_SKIPPED_KEY);
    return v === 'true';
  } catch {
    return false;
  }
}

export async function setOnboardingPermissionsSkipped(skipped: boolean): Promise<void> {
  try {
    if (skipped) {
      await AsyncStorage.setItem(PERMISSIONS_SKIPPED_KEY, 'true');
    } else {
      await AsyncStorage.removeItem(PERMISSIONS_SKIPPED_KEY);
    }
  } catch {}
}

export default function PermissionsScreen() {
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryText = useThemeColor({}, 'buttonPrimaryText');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const { onboardingPath } = useOnboardingFlow();

  const [notificationsGranted, setNotificationsGranted] = useState(false);
  const [cloudBackupReady, setCloudBackupReady] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [loadingCloudBackup, setLoadingCloudBackup] = useState(false);

  const refreshNotificationStatus = useCallback(async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setNotificationsGranted(status === 'granted');
  }, []);

  const refreshCloudBackupStatus = useCallback(async () => {
    try {
      // Only check, do not request (avoid dialog on load)
      const available = await isCloudBackupAvailable({ requestPermission: false });
      setCloudBackupReady(available);
    } catch {
      setCloudBackupReady(false);
    }
  }, []);

  useEffect(() => {
    refreshNotificationStatus();
    refreshCloudBackupStatus();
  }, [refreshNotificationStatus, refreshCloudBackupStatus]);

  const handleRequestNotifications = async () => {
    if (notificationsGranted) return;
    setLoadingNotifications(true);
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      const granted = status === 'granted';
      setNotificationsGranted(granted);
      if (granted) await setNotificationsEnabled(true);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const handleRequestCloudBackup = async () => {
    if (cloudBackupReady) return;
    setLoadingCloudBackup(true);
    try {
      const available = await isCloudBackupAvailable();
      setCloudBackupReady(available);
    } finally {
      setLoadingCloudBackup(false);
    }
  };

  const goNext = () => {
    if (onboardingPath === 'advanced') {
      router.push('/(onboarding)/backup-warning');
    } else {
      router.replace('/(onboarding)/simple-setup');
    }
  };

  const handleNotNow = async () => {
    await setOnboardingPermissionsSkipped(true);
    goNext();
  };

  const cloudBackupLabel = Platform.OS === 'android' ? 'Google Drive backup' : 'iCloud backup';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <OnboardingHeader onBack={() => router.back()} title="Permissions" />

        <View style={styles.stepWrapper}>
          <View style={[styles.pageContainer, styles.scrollPageContainer]}>
            <ThemedText type="title" style={styles.title}>
              Enable permissions
            </ThemedText>
            <ThemedText style={[styles.subtitle, { marginBottom: 24 }]}>
              Grant these so Portal can notify you and back up your key to the cloud. You can change
              them later in Settings.
            </ThemedText>

            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[
                  styles.choiceButton,
                  {
                    backgroundColor: cardBackgroundColor,
                    borderWidth: notificationsGranted ? 2 : 0,
                    borderColor: notificationsGranted ? '#22c55e' : 'transparent',
                  },
                ]}
                onPress={handleRequestNotifications}
                disabled={loadingNotifications}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {notificationsGranted ? (
                    <View style={{ width: 40, alignItems: 'center' }}>
                      <Check size={24} color="#22c55e" />
                    </View>
                  ) : (
                    <Bell size={24} color={buttonPrimary} />
                  )}
                  <View style={{ flex: 1, alignItems: 'flex-start' }}>
                    <ThemedText type="defaultSemiBold" style={styles.choiceButtonTitle}>
                      Notifications
                    </ThemedText>
                    <ThemedText style={[styles.choiceButtonDescription, { color: textSecondary }]}>
                      For payment requests and alerts
                    </ThemedText>
                  </View>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.choiceButton,
                  {
                    backgroundColor: cardBackgroundColor,
                    borderWidth: cloudBackupReady ? 2 : 0,
                    borderColor: cloudBackupReady ? '#22c55e' : 'transparent',
                  },
                ]}
                onPress={handleRequestCloudBackup}
                disabled={loadingCloudBackup}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {cloudBackupReady ? (
                    <View style={{ width: 40, alignItems: 'center' }}>
                      <Check size={24} color="#22c55e" />
                    </View>
                  ) : (
                    <Cloud size={24} color={buttonPrimary} />
                  )}
                  <View style={{ flex: 1, alignItems: 'flex-start' }}>
                    <ThemedText type="defaultSemiBold" style={styles.choiceButtonTitle}>
                      {cloudBackupLabel}
                    </ThemedText>
                    <ThemedText style={[styles.choiceButtonDescription, { color: textSecondary }]}>
                      {Platform.OS === 'android'
                        ? 'Backs up your key to your Google Drive account'
                        : 'Backs up your key to your iCloud account'}
                    </ThemedText>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.footer, styles.footerStack]}>
            <TouchableOpacity
              style={[
                styles.button,
                {
                  backgroundColor: buttonPrimary,
                  opacity:
                    onboardingPath === 'advanced' || (notificationsGranted && cloudBackupReady)
                      ? 1
                      : 0.5,
                },
              ]}
              onPress={goNext}
              disabled={
                onboardingPath !== 'advanced' && (!notificationsGranted || !cloudBackupReady)
              }
            >
              <ThemedText style={[styles.buttonText, { color: buttonPrimaryText }]}>
                Continue
              </ThemedText>
            </TouchableOpacity>
            {onboardingPath === 'advanced' && (
              <TouchableOpacity
                style={[
                  styles.button,
                  {
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderColor: buttonPrimary,
                  },
                ]}
                onPress={handleNotNow}
              >
                <ThemedText style={[styles.buttonText, { color: buttonPrimary }]}>
                  Not now
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}
