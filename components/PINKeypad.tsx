import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Delete } from 'lucide-react-native';

interface PINKeypadProps {
  onPINComplete: (pin: string) => void;
  maxLength?: number;
  showDots?: boolean;
  error?: boolean;
  onError?: () => void;
}

export function PINKeypad({
  onPINComplete,
  maxLength = 5,
  showDots = true,
  error = false,
  onError,
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

  const handleNumberPress = (number: string) => {
    if (pin.length < maxLength) {
      const newPin = pin + number;
      setPin(newPin);
      if (newPin.length === maxLength) {
        onPINComplete(newPin);
      }
    }
  };

  const handleDelete = () => {
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
    }
  };

  const handleClear = () => {
    setPin('');
    if (onError) {
      onError();
    }
  };

  // Clear PIN when error prop changes to false (after showing error)
  React.useEffect(() => {
    if (!error && pin.length > 0) {
      setPin('');
    }
  }, [error]);

  return (
    <View style={styles.container}>
      {/* PIN Dots Display */}
      {showDots && (
        <View style={styles.dotsContainer}>
          {Array.from({ length: maxLength }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    index < pin.length
                      ? error
                        ? errorColor
                        : buttonPrimaryColor
                      : inputBorderColor,
                  borderColor: index < pin.length ? buttonPrimaryColor : inputBorderColor,
                },
              ]}
            />
          ))}
        </View>
      )}

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

        {/* Row 4: Empty, 0, Delete */}
        <View style={styles.keypadRow}>
          <View style={styles.keypadButton} />
          <TouchableOpacity
            style={[styles.keypadButton, { backgroundColor: cardBackgroundColor }]}
            onPress={() => handleNumberPress('0')}
            activeOpacity={0.7}
          >
            <ThemedText style={[styles.keypadButtonText, { color: primaryTextColor }]}>0</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.keypadButton, { backgroundColor: cardBackgroundColor }]}
            onPress={handleDelete}
            activeOpacity={0.7}
            disabled={pin.length === 0}
          >
            <Delete
              size={24}
              color={pin.length > 0 ? primaryTextColor : secondaryTextColor}
            />
          </TouchableOpacity>
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
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
    gap: 12,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
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
});

