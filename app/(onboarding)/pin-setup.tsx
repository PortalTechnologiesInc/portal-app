import { router } from 'expo-router';
import { Shield } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { onboardingStyles as styles } from '@/components/onboarding/styles';
import { PINKeypad } from '@/components/PINKeypad';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAppLock } from '@/context/AppLockContext';
import { useOnboardingFlow } from '@/context/OnboardingFlowContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '@/services/AppLockService';

export default function PinSetup() {
  const { setupPIN, setLockEnabled } = useAppLock();
  const { pinStep, setPinStep, enteredPin, setEnteredPin, pinError, setPinError, resetPinState } =
    useOnboardingFlow();

  const [isSavingPin, setIsSavingPin] = useState(false);

  const backgroundColor = useThemeColor({}, 'background');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const buttonDanger = useThemeColor({}, 'buttonDanger');
  const textPrimary = useThemeColor({}, 'textPrimary');

  useEffect(() => {
    resetPinState();
  }, [resetPinState]);

  const handleBack = useCallback(() => {
    resetPinState();
    router.back();
  }, [resetPinState]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => backHandler.remove();
  }, [handleBack]);

  const handleCompletionWithoutPIN = async () => {
    resetPinState();
    router.push('/(onboarding)/profile-setup');
  };

  const handlePinEntryComplete = async (pin: string) => {
    if (isSavingPin) return;

    if (pinStep === 'enter') {
      setEnteredPin(pin);
      setPinStep('confirm');
      setPinError('');
      return;
    }

    if (pin !== enteredPin) {
      setPinError('PINs do not match. Please try again.');
      setTimeout(() => {
        resetPinState();
      }, 1500);
      return;
    }

    try {
      setIsSavingPin(true);
      await setupPIN(pin);
      await setLockEnabled(true);
      resetPinState();
      router.push('/(onboarding)/profile-setup');
    } catch (_error) {
      setPinError('Unable to save PIN. Please try again.');
    } finally {
      setIsSavingPin(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <OnboardingHeader onBack={handleBack} />

        <View style={[styles.stepWrapper, styles.pinSetupFull]}>
          <View style={styles.pinSetupContent}>
            <View style={[styles.pinIconContainer, { backgroundColor: `${buttonPrimary}20` }]}>
              <Shield size={32} color={buttonPrimary} />
            </View>
            <ThemedText type="title" style={styles.title}>
              Secure Portal with a PIN
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              Protect your app by requiring a PIN for sensitive actions.
            </ThemedText>
            {isSavingPin && (
              <ThemedText style={[styles.pinSavingText, { color: textPrimary }]}>
                Saving PIN...
              </ThemedText>
            )}
            <View style={styles.pinKeypadContainer}>
              <View style={styles.pinErrorContainer}>
                {pinError ? (
                  <ThemedText
                    style={[styles.errorText, styles.pinErrorText, { color: buttonDanger }]}
                  >
                    {pinError}
                  </ThemedText>
                ) : null}
              </View>
              <PINKeypad
                key={pinStep}
                onPINComplete={handlePinEntryComplete}
                minLength={PIN_MIN_LENGTH}
                maxLength={PIN_MAX_LENGTH}
                autoSubmit={false}
                submitLabel={pinStep === 'enter' ? 'Next' : 'Confirm'}
                showDots
                error={!!pinError}
                onError={() => setPinError('')}
                showSkipButton
                onSkipPress={handleCompletionWithoutPIN}
                skipLabel="Skip"
              />
            </View>
          </View>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}
