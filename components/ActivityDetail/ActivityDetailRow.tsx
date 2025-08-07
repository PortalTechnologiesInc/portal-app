import React from 'react';
import { View, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Copy } from 'lucide-react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';

interface ActivityDetailRowProps {
  icon: React.ReactElement | string;
  label: string;
  value: string;
  copyable?: boolean;
  onCopy?: () => void;
  isLast?: boolean;
}

export const ActivityDetailRow: React.FC<ActivityDetailRowProps> = ({
  icon,
  label,
  value,
  copyable = false,
  onCopy,
  isLast = false,
}) => {
  const surfaceSecondaryColor = useThemeColor({}, 'surfaceSecondary');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');

  const renderIcon = () => {
    if (typeof icon === 'string') {
      return <FontAwesome6 name={icon} size={16} color={secondaryTextColor} />;
    }
    return icon;
  };

  return (
    <>
      <View style={styles.detailRow}>
        <View style={[styles.detailIcon, { backgroundColor: surfaceSecondaryColor }]}>
          {renderIcon()}
        </View>
        <View style={styles.detailContent}>
          <ThemedText style={[styles.detailLabel, { color: secondaryTextColor }]}>
            {label}
          </ThemedText>
          {copyable ? (
            <View style={styles.copyableContent}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.scrollableText}
                contentContainerStyle={styles.scrollableTextContent}
              >
                <ThemedText style={[styles.detailValue, { color: primaryTextColor }]}>
                  {value}
                </ThemedText>
              </ScrollView>
              <TouchableOpacity onPress={onCopy} style={styles.copyButton}>
                <Copy size={16} color={secondaryTextColor} />
              </TouchableOpacity>
            </View>
          ) : (
            <ThemedText style={[styles.detailValue, { color: primaryTextColor }]}>
              {value}
            </ThemedText>
          )}
        </View>
      </View>
      {!isLast && (
        <View style={[styles.separator, { backgroundColor: 'rgba(128, 128, 128, 0.2)' }]} />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  copyableContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  copyButton: {
    padding: 8,
    marginLeft: 12,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    height: 1,
    marginVertical: 8,
  },
  scrollableText: {
    flex: 1,
    maxHeight: 24,
  },
  scrollableTextContent: {
    alignItems: 'center',
    paddingRight: 4,
  },
});
