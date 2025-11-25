import React, { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
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
  disabled?: boolean;
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
  disabled = false,
}: PINKeypadProps) {
  const [pin, setPin] = useState('');
  const { width, height } = useWindowDimensions();
  const rem = Math.min(Math.max(width / 390, 0.85), 1);
  const verticalRem = Math.min(Math.max(height / 844, 0.85), 1);
  const keypadMaxWidth = Math.min(width * 0.9, 300 * rem);
  const buttonSize = Math.min(Math.max(54, 68 * rem), 72);
  const deleteSize = Math.max(44, 48 * rem);
  const dotSize = Math.max(14, 18 * rem);
  const rowGap = 12 * rem;
  const dotsMarginBottom = 28 * verticalRem;

  const dynamicStyles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          paddingHorizontal: 12 * rem,
        },
        dotsRow: {
          marginBottom: dotsMarginBottom,
          gap: rowGap,
        },
        dotsSpacer: {
          width: deleteSize,
        },
        dotsContainer: {
          gap: rowGap,
        },
        dot: {
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          borderWidth: 2,
        },
        dotPlaceholder: {
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          borderWidth: 2,
        },
        deleteButton: {
          width: deleteSize,
          height: deleteSize,
          borderRadius: deleteSize / 2,
        },
        keypad: {
          maxWidth: keypadMaxWidth,
        },
        keypadRow: {
          gap: rowGap,
          marginBottom: 16 * verticalRem,
        },
        keypadButton: {
          borderRadius: buttonSize / 2,
          minHeight: buttonSize,
          maxHeight: buttonSize,
        },
        keypadButtonText: {
          fontSize: 24 * rem,
        },
        submitButtonText: {
          fontSize: 16 * rem,
        },
        skipButtonText: {
          fontSize: 14 * rem,
        },
      }),
    [buttonSize, deleteSize, dotSize, dotsMarginBottom, keypadMaxWidth, rem, rowGap, verticalRem]
  );

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
    if (disabled) return;
    if (pin.length < maxLength) {
      const newPin = pin + number;
      setPin(newPin);
      if (autoSubmit && newPin.length === maxLength) {
        onPINComplete(newPin);
      }
    }
  };

  const handleDelete = () => {
    if (disabled) return;
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
    }
  };

  const handleClear = () => {
    if (disabled || pin.length === 0) return;
    setPin('');
  };

  const handleSubmit = () => {
    if (disabled) return;
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
        <View style={[styles.dotsContainer, dynamicStyles.dotsContainer]}>
          <View style={[styles.dotPlaceholder, dynamicStyles.dotPlaceholder]} />
        </View>
      );
    }

    return (
      <View style={[styles.dotsContainer, dynamicStyles.dotsContainer]}>
        {Array.from({ length: pin.length }).map((_, index) => (
          <View
            key={`dot-${index}-${pin.length}`}
            style={[
              styles.dot,
              dynamicStyles.dot,
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
    <View style={[styles.container, dynamicStyles.container, disabled && styles.disabled]}>
      <View style={[styles.dotsRow, dynamicStyles.dotsRow]}>
        <View style={dynamicStyles.dotsSpacer} />
        {renderDots()}
        <TouchableOpacity
          style={[
            styles.deleteButton,
            dynamicStyles.deleteButton,
            {
              backgroundColor: cardBackgroundColor,
              opacity: disabled ? 0.4 : pin.length === 0 ? 0.5 : 1,
            },
          ]}
          onPress={handleDelete}
          onLongPress={handleClear}
          delayLongPress={250}
          disabled={pin.length === 0 || disabled}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Delete size={22} color={pin.length > 0 ? primaryTextColor : secondaryTextColor} />
        </TouchableOpacity>
      </View>

      {/* Keypad */}
      <View style={[styles.keypad, dynamicStyles.keypad, disabled && styles.disabled]}>
        {/* Row 1: 1, 2, 3 */}
        <View style={[styles.keypadRow, dynamicStyles.keypadRow]}>
          {['1', '2', '3'].map(num => (
            <TouchableOpacity
              key={num}
              style={[
                styles.keypadButton,
                dynamicStyles.keypadButton,
                { backgroundColor: cardBackgroundColor, opacity: disabled ? 0.4 : 1 },
              ]}
              onPress={() => handleNumberPress(num)}
              activeOpacity={0.7}
              disabled={disabled}
            >
              <ThemedText
                style={[
                  styles.keypadButtonText,
                  dynamicStyles.keypadButtonText,
                  { color: primaryTextColor },
                ]}
              >
                {num}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Row 2: 4, 5, 6 */}
        <View style={[styles.keypadRow, dynamicStyles.keypadRow]}>
          {['4', '5', '6'].map(num => (
            <TouchableOpacity
              key={num}
              style={[
                styles.keypadButton,
                dynamicStyles.keypadButton,
                { backgroundColor: cardBackgroundColor, opacity: disabled ? 0.4 : 1 },
              ]}
              onPress={() => handleNumberPress(num)}
              activeOpacity={0.7}
              disabled={disabled}
            >
              <ThemedText
                style={[
                  styles.keypadButtonText,
                  dynamicStyles.keypadButtonText,
                  { color: primaryTextColor },
                ]}
              >
                {num}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Row 3: 7, 8, 9 */}
        <View style={[styles.keypadRow, dynamicStyles.keypadRow]}>
          {['7', '8', '9'].map(num => (
            <TouchableOpacity
              key={num}
              style={[
                styles.keypadButton,
                dynamicStyles.keypadButton,
                { backgroundColor: cardBackgroundColor, opacity: disabled ? 0.4 : 1 },
              ]}
              onPress={() => handleNumberPress(num)}
              activeOpacity={0.7}
              disabled={disabled}
            >
              <ThemedText
                style={[
                  styles.keypadButtonText,
                  dynamicStyles.keypadButtonText,
                  { color: primaryTextColor },
                ]}
              >
                {num}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Row 4: spacer, 0, OK */}
        <View style={[styles.keypadRow, dynamicStyles.keypadRow]}>
          {showSkipButton ? (
            <TouchableOpacity
              style={[
                styles.keypadButton,
                dynamicStyles.keypadButton,
                { backgroundColor: surfaceSecondary, opacity: disabled ? 0.4 : 1 },
              ]}
              onPress={disabled ? undefined : onSkipPress}
              activeOpacity={0.7}
              disabled={!onSkipPress || disabled}
            >
              <ThemedText
                style={[
                  styles.skipButtonText,
                  dynamicStyles.skipButtonText,
                  { color: primaryTextColor },
                ]}
              >
                {skipLabel}
              </ThemedText>
            </TouchableOpacity>
          ) : (
            <View style={[styles.keypadButton, dynamicStyles.keypadButton]} />
          )}
          <TouchableOpacity
            style={[
              styles.keypadButton,
              dynamicStyles.keypadButton,
              { backgroundColor: cardBackgroundColor, opacity: disabled ? 0.4 : 1 },
            ]}
            onPress={() => handleNumberPress('0')}
            activeOpacity={0.7}
            disabled={disabled}
          >
            <ThemedText
              style={[
                styles.keypadButtonText,
                dynamicStyles.keypadButtonText,
                { color: primaryTextColor },
              ]}
            >
              0
            </ThemedText>
          </TouchableOpacity>
          {showSubmitButton ? (
            <TouchableOpacity
              style={[
                styles.keypadButton,
                dynamicStyles.keypadButton,
                {
                  backgroundColor: canSubmit ? buttonPrimaryColor : inputBorderColor,
                  opacity: disabled ? 0.4 : canSubmit ? 1 : 0.6,
                },
              ]}
              onPress={handleSubmit}
              activeOpacity={0.7}
              disabled={!canSubmit || disabled}
            >
              <ThemedText
                style={[
                  styles.submitButtonText,
                  dynamicStyles.submitButtonText,
                  { color: canSubmit ? buttonPrimaryTextColor : secondaryTextColor },
                ]}
              >
                {autoSubmit ? 'OK' : submitLabel}
              </ThemedText>
            </TouchableOpacity>
          ) : (
            <View style={[styles.keypadButton, dynamicStyles.keypadButton]} />
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
  disabled: {
    opacity: 0.5,
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


