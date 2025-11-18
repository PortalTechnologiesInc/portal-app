import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Delete } from 'lucide-react-native';

interface PINKeypadProps {
  onPINComplete: (pin: string) => void;
  minLength?: number;
  maxLength?: number;
  showDots?: boolean;
  error?: boolean;
  onError?: () => void;
  autoSubmit?: boolean;
  submitLabel?: string;
  showSubmitButton?: boolean;
  showSkipButton?: boolean;
  onSkipPress?: () => void;
  skipLabel?: string;
}

export function PINKeypad({
  onPINComplete,
  minLength: providedMinLength = 5,
  maxLength = 5,
  showDots = true,
  error = false,
  onError,
  autoSubmit = true,
  submitLabel = 'Enter',
  showSubmitButton = true,
  showSkipButton = false,
  onSkipPress,
  skipLabel = 'Skip',
}: PINKeypadProps) {
  const [pin, setPin] = useState('');

  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');
  const inputBorderColor = useThemeColor({}, 'inputBorder');
  const errorColor = useThemeColor({}, 'buttonDanger');
  const surfaceSecondary = useThemeColor({}, 'surfaceSecondary');
  const normalizedMinLength = Math.min(Math.max(providedMinLength, 1), maxLength);
  const canSubmit = pin.length >= Math.max(normalizedMinLength, 4);

  const handleNumberPress = (number: string) => {
    if (pin.length < maxLength) {
      const newPin = pin + number;
      setPin(newPin);
      if (autoSubmit && newPin.length === maxLength) {
        onPINComplete(newPin);
      }
    }
  };

  const handleDelete = () => {
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
    }
  };

  const handleSubmit = () => {
    if (canSubmit) {
      onPINComplete(pin);
    }
  };

  // Clear PIN when error prop changes to false (after showing error)
  React.useEffect(() => {
    if (!error && pin.length > 0) {
      setPin('');
    }
  }, [error]);

  const renderDots = () => {
    if (!showDots) {
      return null;
    }

    if (pin.length === 0) {
      return (
        <View style={styles.dotsContainer}>
          <View style={styles.dotPlaceholder} />
        </View>
      );
    }

    return (
      <View style={styles.dotsContainer}>
        {Array.from({ length: pin.length }).map((_, index) => (
          <View
            key={`dot-${index}-${pin.length}`}
            style={[
              styles.dot,
              {
                backgroundColor:
                  error
                    ? errorColor
                    : buttonPrimaryColor,
                borderColor: error ? errorColor : buttonPrimaryColor,
              },
            ]}
          />
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.dotsRow}>
        <View style={styles.dotsSpacer} />
        {renderDots()}
        <TouchableOpacity
          style={[
            styles.deleteButton,
            {
              backgroundColor: cardBackgroundColor,
              opacity: pin.length === 0 ? 0.5 : 1,
            },
          ]}
          onPress={handleDelete}
          disabled={pin.length === 0}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Delete size={22} color={pin.length > 0 ? primaryTextColor : secondaryTextColor} />
        </TouchableOpacity>
      </View>

      {/* Keypad */}
      <View style={styles.keypad}>
        {/* Row 1: 1, 2, 3 */}
        <View style={styles.keypadRow}>
          {['1', '2', '3'].map(num => (
            <TouchableOpacity
              key={num}
              style={[styles.keypadButton, { backgroundColor: cardBackgroundColor }]}
              onPress={() => handleNumberPress(num)}
              activeOpacity={0.7}
            >
              <ThemedText style={[styles.keypadButtonText, { color: primaryTextColor }]}>
                {num}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Row 2: 4, 5, 6 */}
        <View style={styles.keypadRow}>
          {['4', '5', '6'].map(num => (
            <TouchableOpacity
              key={num}
              style={[styles.keypadButton, { backgroundColor: cardBackgroundColor }]}
              onPress={() => handleNumberPress(num)}
              activeOpacity={0.7}
            >
              <ThemedText style={[styles.keypadButtonText, { color: primaryTextColor }]}>
                {num}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Row 3: 7, 8, 9 */}
        <View style={styles.keypadRow}>
          {['7', '8', '9'].map(num => (
            <TouchableOpacity
              key={num}
              style={[styles.keypadButton, { backgroundColor: cardBackgroundColor }]}
              onPress={() => handleNumberPress(num)}
              activeOpacity={0.7}
            >
              <ThemedText style={[styles.keypadButtonText, { color: primaryTextColor }]}>
                {num}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Row 4: spacer, 0, OK */}
        <View style={styles.keypadRow}>
          {showSkipButton ? (
            <TouchableOpacity
              style={[styles.keypadButton, { backgroundColor: surfaceSecondary }]}
              onPress={onSkipPress}
              activeOpacity={0.7}
              disabled={!onSkipPress}
            >
              <ThemedText style={[styles.skipButtonText, { color: primaryTextColor }]}>
                {skipLabel}
              </ThemedText>
            </TouchableOpacity>
          ) : (
            <View style={styles.keypadButton} />
          )}
          <TouchableOpacity
            style={[styles.keypadButton, { backgroundColor: cardBackgroundColor }]}
            onPress={() => handleNumberPress('0')}
            activeOpacity={0.7}
          >
            <ThemedText style={[styles.keypadButtonText, { color: primaryTextColor }]}>0</ThemedText>
          </TouchableOpacity>
          {showSubmitButton ? (
            <TouchableOpacity
              style={[
                styles.keypadButton,
                {
                  backgroundColor: canSubmit ? buttonPrimaryColor : inputBorderColor,
                  opacity: canSubmit ? 1 : 0.6,
                },
              ]}
              onPress={handleSubmit}
              activeOpacity={0.7}
              disabled={!canSubmit}
            >
              <ThemedText
                style={[
                  styles.submitButtonText,
                  { color: canSubmit ? buttonPrimaryTextColor : secondaryTextColor },
                ]}
              >
                {autoSubmit ? 'OK' : submitLabel}
              </ThemedText>
            </TouchableOpacity>
          ) : (
            <View style={styles.keypadButton} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  dotsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    gap: 12,
  },
  dotsSpacer: {
    width: 48,
  },
  dotsContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  dotPlaceholder: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  deleteButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypad: {
    width: '100%',
    maxWidth: 300,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  keypadButton: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 60,
    maxHeight: 80,
  },
  keypadButtonText: {
    fontSize: 24,
    fontWeight: '600',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  skipButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});


