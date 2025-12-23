import { Shield, X } from 'lucide-react-native';
import { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/useThemeColor';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '@/services/AppLockService';
import { PINKeypad } from './PINKeypad';
import { ThemedText } from './ThemedText';

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
  const { width, height } = useWindowDimensions();
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [enteredPIN, setEnteredPIN] = useState('');
  const [_confirmPIN, setConfirmPIN] = useState('');
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
  const isSmallScreen = height < 700;
  const rem = Math.min(Math.max(width / 390, 0.9), 1);
  const verticalRem = Math.min(Math.max(height / 844, 0.85), 1);
  const iconSize = 100 * rem;
  const headerSpacing = (isSmallScreen ? 20 : 32) * verticalRem;
  const contentPadding = 32 * rem;

  return (
    <Modal visible={visible} animationType="fade" transparent={false}>
      <SafeAreaView style={[styles.container, { backgroundColor }]} edges={['bottom']}>
        <TouchableOpacity
          onPress={handleCancel}
          style={[
            styles.closeButton,
            {
              top: 20,
              right: 20,
            },
          ]}
        >
          <X size={24} color={secondaryTextColor} />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingHorizontal: contentPadding,
              paddingBottom: 32 * verticalRem,
              paddingTop: isSmallScreen ? 24 * verticalRem : 0,
            },
          ]}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View
              style={[
                styles.iconContainer,
                {
                  backgroundColor: `${buttonPrimaryColor}20`,
                  width: iconSize,
                  height: iconSize,
                  borderRadius: iconSize / 2,
                  marginBottom: headerSpacing,
                },
              ]}
            >
              <Shield size={48 * rem} color={buttonPrimaryColor} />
            </View>
            <ThemedText style={[styles.title, { color: primaryTextColor, fontSize: 24 * rem }]}>
              {headerTitle}
            </ThemedText>
            <ThemedText
              style={[styles.subtitle, { color: secondaryTextColor, fontSize: 16 * rem }]}
            >
              {step === 'enter' ? enterText : confirmText}
            </ThemedText>
          </View>

          <View style={styles.pinContainer}>
            <View style={styles.errorContainer}>
              {error && (
                <ThemedText style={[styles.errorText, { color: errorColor, fontSize: 14 * rem }]}>
                  PINs do not match. Please try again.
                </ThemedText>
              )}
            </View>
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
  closeButton: {
    position: 'absolute',
    padding: 12,
    zIndex: 10,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 32,
    paddingTop: 0,
  },
  contentCompact: {
    justifyContent: 'flex-start',
    paddingTop: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 15,
  },
  title: {
    fontSize: 24,
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
  errorContainer: {
    minHeight: 40,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  pinContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
