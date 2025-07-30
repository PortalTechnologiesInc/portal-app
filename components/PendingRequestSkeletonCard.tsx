import React from 'react';
import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, type ViewStyle, type StyleProp } from 'react-native';
import { ThemedText } from './ThemedText';
import { Colors } from '@/constants/Colors';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Layout } from '@/constants/Layout';

// Animated pulse component for skeleton loading effect
const SkeletonPulse = ({ style }: { style: StyleProp<ViewStyle> }) => {
  const translateX = useRef(new Animated.Value(-100)).current;
  const skeletonHighlightColor = useThemeColor({}, 'skeletonHighlight');

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(translateX, {
        toValue: Layout.cardWidth,
        duration: 1500,
        useNativeDriver: true,
      })
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [translateX]);

  return (
    <View style={[styles.skeletonContainer, style]}>
      <View style={[styles.pulse, style]} />
      <Animated.View
        style={[
          styles.shimmer,
          { backgroundColor: skeletonHighlightColor },
          {
            transform: [{ translateX }],
          },
        ]}
      />
    </View>
  );
};

export const PendingRequestSkeletonCard: React.FC = React.memo(() => {
  // Theme colors
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const skeletonBaseColor = useThemeColor({}, 'skeletonBase');
  const skeletonHighlightColor = useThemeColor({}, 'skeletonHighlight');
  const shadowColor = useThemeColor({}, 'shadowColor');

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: cardBackgroundColor, shadowColor, width: Layout.cardWidth },
      ]}
    >
      <SkeletonPulse
        style={[styles.skeletonText, styles.typeText, { backgroundColor: skeletonBaseColor }]}
      />
      <SkeletonPulse
        style={[styles.skeletonText, styles.nameText, { backgroundColor: skeletonBaseColor }]}
      />
      <SkeletonPulse
        style={[styles.skeletonText, styles.infoText, { backgroundColor: skeletonBaseColor }]}
      />
      <View style={[styles.skeletonBlock, { backgroundColor: skeletonHighlightColor }]} />

      {/* Add spacing to match the buttons area height */}
      <View style={styles.actionsArea}>
        <SkeletonPulse style={styles.actionsSkeleton} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 14,
    minWidth: 250,
    marginHorizontal: 5,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  skeletonContainer: {
    position: 'relative',
    overflow: 'hidden',
  },
  pulse: {
    // backgroundColor handled by theme
    borderRadius: 4,
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 60,
    height: '100%',
    // backgroundColor handled by theme
    transform: [{ skewX: '-20deg' }],
  },
  skeletonText: {
    height: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  typeText: {
    width: '40%',
  },
  nameText: {
    width: '80%',
    height: 20,
  },
  infoText: {
    width: '60%',
  },
  skeletonBlock: {
    height: 40,
    borderRadius: 8,
    marginTop: 8,
  },
  actionsArea: {
    height: 40, // Match the height of the action buttons
  },
  actionsSkeleton: {
    height: 15,
    width: '90%',
    opacity: 0.5,
  },
});
