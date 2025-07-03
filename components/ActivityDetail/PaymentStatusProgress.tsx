import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  TouchableOpacity,
} from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';

export type PaymentStepStatus = 'completed' | 'pending' | 'success' | 'error';

export interface PaymentStep {
  id: string;
  status: PaymentStepStatus;
  title: string;
  subtitle: string;
  timestamp?: Date;
  errorType?: 'insufficient_funds' | 'network_error' | 'payment_declined' | 'unknown_error';
}

interface PaymentStatusProgressProps {
  steps?: PaymentStep[];
  onRetry?: () => void;
}

export function PaymentStatusProgress({ steps, onRetry }: PaymentStatusProgressProps) {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Theme colors
  const primaryColor = useThemeColor({}, 'tint');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const surfaceSecondaryColor = useThemeColor({}, 'surfaceSecondary');
  const statusConnectedColor = useThemeColor({}, 'statusConnected');
  const statusErrorColor = useThemeColor({}, 'statusError');
  const buttonSecondaryColor = useThemeColor({}, 'buttonSecondary');
  const buttonSecondaryTextColor = useThemeColor({}, 'buttonSecondaryText');

  // Default steps if none provided (for backward compatibility)
  const defaultSteps: PaymentStep[] = [
    {
      id: '1',
      status: 'completed',
      title: 'Payment initiated',
      subtitle: 'Your payment has been created',
    },
    {
      id: '2',
      status: 'pending',
      title: 'Pending...',
      subtitle: 'Processing your payment',
    },
  ];

  const currentSteps = steps || defaultSteps;
  const lastStep = currentSteps[currentSteps.length - 1];
  const lastStepIsError = lastStep?.status === 'error';
  const hasActivePending = currentSteps.some(step => step.status === 'pending');
  const showRetry = lastStepIsError && !hasActivePending;

  useEffect(() => {
    // Create rotating animation for the loading dot
    const rotateAnimation = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    rotateAnimation.start();

    return () => {
      rotateAnimation.stop();
    };
  }, [rotateAnim]);

  // Ensure animation continues for all pending steps
  useEffect(() => {
    const hasPendingSteps = currentSteps.some(step => step.status === 'pending');
    if (hasPendingSteps) {
      // Reset and restart animation to ensure all pending dots spin
      rotateAnim.setValue(0);
      const rotateAnimation = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      rotateAnimation.start();
      
      return () => {
        rotateAnimation.stop();
      };
    }
  }, [currentSteps, rotateAnim]);

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const getErrorMessage = (errorType?: string) => {
    switch (errorType) {
      case 'insufficient_funds':
        return 'Insufficient funds';
      case 'network_error':
        return 'Network error';
      case 'payment_declined':
        return 'Payment declined';
      default:
        return 'Error occurred';
    }
  };

  const getLineColor = (nextStep?: PaymentStep) => {
    if (!nextStep) return secondaryTextColor;
    switch (nextStep.status) {
      case 'success':
        return statusConnectedColor;
      case 'error':
        return statusErrorColor;
      default:
        return secondaryTextColor;
    }
  };

  const renderDot = (step: PaymentStep, isLast: boolean, nextStep?: PaymentStep) => {
    switch (step.status) {
      case 'completed':
        return (
          <View style={styles.dotContainer}>
            <View style={[styles.completedDotOuter, { borderColor: primaryColor }]}>
              <View style={[styles.completedDotInner, { backgroundColor: primaryColor }]} />
            </View>
            {!isLast && <View style={[styles.connectingLine, { backgroundColor: getLineColor(nextStep) }]} />}
          </View>
        );

      case 'success':
        return (
          <View style={styles.dotContainer}>
            <View style={[styles.completedDotOuter, { borderColor: statusConnectedColor }]}>
              <View style={[styles.completedDotInner, { backgroundColor: statusConnectedColor }]} />
            </View>
            {!isLast && <View style={[styles.connectingLine, { backgroundColor: getLineColor(nextStep) }]} />}
          </View>
        );

      case 'error':
        return (
          <View style={styles.dotContainer}>
            <View style={[styles.completedDotOuter, { borderColor: statusErrorColor }]}>
              <View style={[styles.completedDotInner, { backgroundColor: statusErrorColor }]} />
            </View>
            {!isLast && <View style={[styles.connectingLine, { backgroundColor: getLineColor(nextStep) }]} />}
          </View>
        );

      case 'pending':
      default:
        return (
          <View style={styles.dotContainer}>
            <View style={styles.loadingDotContainer}>
              <Animated.View
                key={`loading-${step.id}`}
                style={[
                  styles.loadingDot,
                  { 
                    borderTopColor: primaryColor,
                    borderRightColor: `${primaryColor}40`,
                    borderBottomColor: `${primaryColor}20`,
                    borderLeftColor: `${primaryColor}60`,
                  },
                  { transform: [{ rotate: rotateInterpolate }] }
                ]}
              />
            </View>
            {!isLast && <View style={[styles.connectingLine, { backgroundColor: getLineColor(nextStep) }]} />}
          </View>
        );
    }
  };

  return (
    <View style={styles.container}>
      {/* Retry Button - Top right corner */}
      {showRetry && onRetry && (
        <View style={styles.retryContainer}>
          <TouchableOpacity
            onPress={onRetry}
            style={[styles.retryButton, { backgroundColor: buttonSecondaryColor }]}
          >
            <ThemedText style={[styles.retryText, { color: buttonSecondaryTextColor }]}>
              Retry
            </ThemedText>
          </TouchableOpacity>
        </View>
      )}

      {currentSteps.map((step, index) => {
        const isLast = index === currentSteps.length - 1;
        const nextStep = index < currentSteps.length - 1 ? currentSteps[index + 1] : undefined;
        const displayTitle = step.status === 'error' && step.errorType 
          ? getErrorMessage(step.errorType) 
          : step.title;

        return (
          <View key={step.id} style={styles.statusRow}>
            {renderDot(step, isLast, nextStep)}
            <View style={styles.textContainer}>
              <ThemedText style={[
                styles.statusText, 
                { 
                  color: step.status === 'error' 
                    ? statusErrorColor 
                    : step.status === 'success' 
                      ? statusConnectedColor 
                      : primaryTextColor 
                }
              ]}>
                {displayTitle}
              </ThemedText>
              <ThemedText style={[styles.statusSubtext, { color: secondaryTextColor }]}>
                {step.subtitle}
              </ThemedText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    position: 'relative',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 60,
  },
  dotContainer: {
    alignItems: 'center',
    width: 40,
    marginRight: 16,
  },
  completedDotOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completedDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectingLine: {
    width: 2,
    height: 40,
    marginTop: 4,
  },
  loadingDotContainer: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2.5,
  },
  textContainer: {
    flex: 1,
    paddingTop: 2,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  statusSubtext: {
    fontSize: 14,
    lineHeight: 18,
  },
  retryContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 1,
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
  },
}); 