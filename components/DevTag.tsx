import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';

const TAG_WIDTH = 60;
const TAG_HEIGHT = 32;

export function DevTag() {
  const router = useRouter();
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Initial position (bottom right)
  const getInitialPosition = () => ({
    x: screenWidth - TAG_WIDTH - 16 - insets.right,
    y: screenHeight - TAG_HEIGHT - 16 - insets.bottom,
  });

  const [position, setPosition] = useState(getInitialPosition);
  const pan = useRef(new Animated.ValueXY(getInitialPosition())).current;
  const isDragging = useRef(false);
  const tapTimeout = useRef<NodeJS.Timeout | null>(null);
  const startPosition = useRef(position);

  if (!__DEV__) {
    return null;
  }

  // Update position when screen dimensions change
  useEffect(() => {
    const newPosition = getInitialPosition();
    setPosition(newPosition);
    pan.setValue({ x: newPosition.x, y: newPosition.y });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenWidth, screenHeight, insets.bottom, insets.right]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Start dragging if moved more than 5 pixels
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        isDragging.current = false;
        startPosition.current = position;
        pan.setOffset({
          x: position.x,
          y: position.y,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gestureState) => {
        isDragging.current = true;
        if (tapTimeout.current) {
          clearTimeout(tapTimeout.current);
          tapTimeout.current = null;
        }
        pan.setValue({ x: gestureState.dx, y: gestureState.dy });
      },
      onPanResponderRelease: (_, gestureState) => {
        pan.flattenOffset();

        // Calculate new position with bounds checking
        const maxX = screenWidth - TAG_WIDTH - 16 - insets.right;
        const maxY = screenHeight - TAG_HEIGHT - 16 - insets.bottom;
        const minX = 16 + insets.left;
        const minY = insets.top + 16;

        const newX = Math.max(minX, Math.min(maxX, startPosition.current.x + gestureState.dx));
        const newY = Math.max(minY, Math.min(maxY, startPosition.current.y + gestureState.dy));

        setPosition({ x: newX, y: newY });
        pan.setValue({ x: newX, y: newY });

        // If not dragging, treat as tap
        if (!isDragging.current) {
          tapTimeout.current = setTimeout(() => {
            router.push('/(tabs)/Debug');
          }, 100);
        }
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: buttonPrimaryColor,
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <ThemedText style={[styles.text, { color: buttonPrimaryTextColor }]}>DEV</ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: -80,
    left: 0,
    width: TAG_WIDTH,
    height: TAG_HEIGHT,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.5,
    zIndex: 9999,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
