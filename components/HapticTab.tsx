import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';
import React, { useCallback } from 'react';
import { Platform } from 'react-native';

// Only import haptics on iOS for better performance
const shouldUseHaptics = Platform.OS === 'ios';

const HapticTabInner = (props: BottomTabBarButtonProps) => {
  // Memoize the onPressIn handler to prevent recreation on every render
  const handlePressIn = useCallback(
    (ev: any) => {
      // Only trigger haptics on iOS for better performance
      if (shouldUseHaptics) {
        // We'll disable haptics when switching between tabs to improve navigation performance
        // Only use haptic feedback for non-navigation interactions
        const isTabPress = ev?.target?.role === 'tab';
        if (!isTabPress) {
          // Add a soft haptic feedback when pressing down on interactive elements
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
      }
      props.onPressIn?.(ev);
    },
    [props.onPressIn]
  );

  return <PlatformPressable {...props} onPressIn={handlePressIn} />;
};

// Memoize the component to prevent unnecessary re-renders
export const HapticTab = React.memo(HapticTabInner);
