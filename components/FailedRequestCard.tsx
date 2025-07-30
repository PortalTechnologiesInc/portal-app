import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { ThemedText } from './ThemedText';
import { Colors } from '@/constants/Colors';
import { AlertTriangle, RefreshCw } from 'lucide-react-native';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Layout } from '@/constants/Layout';

interface FailedRequestCardProps {
  onRetry: () => void;
  onCancel: () => void;
}

export const FailedRequestCard: React.FC<FailedRequestCardProps> = React.memo(
  ({ onRetry, onCancel }) => {
    // Theme colors
    const cardBackgroundColor = useThemeColor({}, 'cardBackground');
    const primaryTextColor = useThemeColor({}, 'textPrimary');
    const secondaryTextColor = useThemeColor({}, 'textSecondary');
    const warningColor = useThemeColor({}, 'statusWarning');
    const shadowColor = useThemeColor({}, 'shadowColor');
    const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
    const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');
    const buttonSecondaryColor = useThemeColor({}, 'buttonSecondary');
    const buttonSecondaryTextColor = useThemeColor({}, 'buttonSecondaryText');

    return (
      <View style={[styles.card, { backgroundColor: cardBackgroundColor, shadowColor }]}>
        {/* Request type row */}
        <ThemedText style={[styles.requestType, { color: secondaryTextColor }]}>
          Request Status
        </ThemedText>

        {/* Title row with icon */}
        <View style={styles.titleRow}>
          <AlertTriangle size={22} color={warningColor} style={styles.titleIcon} />
          <ThemedText style={[styles.serviceName, { color: primaryTextColor }]}>
            Request Failed
          </ThemedText>
        </View>

        <ThemedText style={[styles.serviceInfo, { color: secondaryTextColor }]}>
          The request timed out. Would you like to try again?
        </ThemedText>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton, { backgroundColor: buttonSecondaryColor }]}
            onPress={onCancel}
          >
            <ThemedText style={[styles.buttonText, { color: buttonSecondaryTextColor }]}>
              Cancel
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.retryButton, { backgroundColor: buttonPrimaryColor }]}
            onPress={onRetry}
          >
            <RefreshCw size={16} color={buttonPrimaryTextColor} style={styles.buttonIcon} />
            <ThemedText style={[styles.buttonText, { color: buttonPrimaryTextColor }]}>
              Retry
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 14,
    width: Layout.cardWidth,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  requestType: {
    fontSize: 14,
    fontWeight: '400',
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  titleIcon: {
    marginRight: 8,
  },
  serviceName: {
    fontSize: 26,
    fontWeight: '600',
  },
  serviceInfo: {
    fontSize: 14,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginHorizontal: 4,
  },
  buttonText: {
    fontWeight: '600',
    marginLeft: 6,
  },
  buttonIcon: {
    marginRight: 2,
  },
  cancelButton: {
    // backgroundColor handled by theme
  },
  retryButton: {
    // backgroundColor handled by theme
  },
});
