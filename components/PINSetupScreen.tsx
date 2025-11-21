import React, { useState } from 'react';
import { StyleSheet, View, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from './ThemedText';
import { PINKeypad } from './PINKeypad';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Shield, X } from 'lucide-react-native';
import { PIN_MIN_LENGTH, PIN_MAX_LENGTH } from '@/services/AppLockService';

interface PINSetupScreenProps {
  visible: boolean;
  onComplete: (pin: string) => void;
  onCancel: () => void;
  title?: string;
  enterMessage?: string;
  confirmMessage?: string;
}

export function PINSetupScreen({
  visible,
  onComplete,
  onCancel,
  title,
  enterMessage,
  confirmMessage,
}: PINSetupScreenProps) {
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [enteredPIN, setEnteredPIN] = useState('');
  const [confirmPIN, setConfirmPIN] = useState('');
  const [error, setError] = useState(false);

  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const errorColor = useThemeColor({}, 'buttonDanger');

  const handlePINEnter = (pin: string) => {
    if (step === 'enter') {
      setEnteredPIN(pin);
      setStep('confirm');
      setError(false);
    } else {
      setConfirmPIN(pin);
      if (pin === enteredPIN) {
        onComplete(pin);
        // Reset state
        setStep('enter');
        setEnteredPIN('');
        setConfirmPIN('');
        setError(false);
      } else {
        setError(true);
        // Clear and restart
        setTimeout(() => {
          setStep('enter');
          setEnteredPIN('');
          setConfirmPIN('');
          setError(false);
        }, 2000);
      }
    }
  };

  const handleCancel = () => {
    setStep('enter');
    setEnteredPIN('');
    setConfirmPIN('');
    setError(false);
    onCancel();
  };

  const headerTitle = title ?? 'Set PIN';
  const enterText = enterMessage ?? 'Enter a PIN to secure your app';
  const confirmText = confirmMessage ?? 'Confirm your PIN';
  const isConfirmStep = step === 'confirm';
  const confirmLength = enteredPIN.length || PIN_MIN_LENGTH;
  const keypadMinLength = isConfirmStep ? confirmLength : PIN_MIN_LENGTH;
  const keypadMaxLength = PIN_MAX_LENGTH;
  const keypadAutoSubmit = false;

  return (
    <Modal visible={visible} animationType="fade" transparent={false}>
      <SafeAreaView style={[styles.container, { backgroundColor }]} edges={['top', 'bottom']}>
        <View style={[styles.topBar, { top: Math.max(insets.top, 12) }]}>
          <TouchableOpacity onPress={handleCancel} style={styles.closeButton}>
            <X size={24} color={secondaryTextColor} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: buttonPrimaryColor + '20' }]}>
              <Shield size={48} color={buttonPrimaryColor} />
            </View>
            <ThemedText style={[styles.title, { color: primaryTextColor }]}>{headerTitle}</ThemedText>
            <ThemedText style={[styles.subtitle, { color: secondaryTextColor }]}>
              {step === 'enter' ? enterText : confirmText}
            </ThemedText>
          </View>

          <View style={styles.pinContainer}>
            {error && (
              <ThemedText style={[styles.errorText, { color: errorColor }]}>
                PINs do not match. Please try again.
              </ThemedText>
            )}
            <PINKeypad
              key={step}
              onPINComplete={handlePINEnter}
              minLength={keypadMinLength}
              maxLength={keypadMaxLength}
              autoSubmit={keypadAutoSubmit}
              submitLabel={keypadAutoSubmit ? undefined : 'OK'}
              showSubmitButton={!keypadAutoSubmit}
              showDots={true}
              error={error}
              onError={() => setError(false)}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 8,
    alignItems: 'flex-end',
    position: 'absolute',
    top: 0,
    zIndex: 10,
  },
  closeButton: {
    padding: 8,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 32,
    paddingTop: 0,
  },
  header: {
    alignItems: 'center',
    marginBottom: 15,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  pinContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

