import React, { useState } from 'react';
import { StyleSheet, View, Modal, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from './ThemedText';
import { PINKeypad } from './PINKeypad';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Shield, X } from 'lucide-react-native';

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
  const enterText = enterMessage ?? 'Enter a 5-digit PIN to secure your app';
  const confirmText = confirmMessage ?? 'Confirm your PIN';

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <SafeAreaView style={[styles.container, { backgroundColor }]} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCancel} style={styles.closeButton}>
            <X size={24} color={secondaryTextColor} />
          </TouchableOpacity>
          <ThemedText style={[styles.title, { color: primaryTextColor }]}>{headerTitle}</ThemedText>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.content}>
          <View style={[styles.iconContainer, { backgroundColor: buttonPrimaryColor + '20' }]}>
            <Shield size={48} color={buttonPrimaryColor} />
          </View>

          <ThemedText style={[styles.instruction, { color: primaryTextColor }]}>
            {step === 'enter' ? enterText : confirmText}
          </ThemedText>

          {error && (
            <ThemedText style={[styles.errorText, { color: errorColor }]}>
              PINs do not match. Please try again.
            </ThemedText>
          )}

          <View style={styles.pinContainer}>
            <PINKeypad
              key={step}
              onPINComplete={handlePINEnter}
              maxLength={5}
              showDots={true}
              error={error}
              onError={() => setError(false)}
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  instruction: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  pinContainer: {
    width: '100%',
    alignItems: 'center',
  },
});

