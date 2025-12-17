import { FontAwesome6 } from '@expo/vector-icons';
import { Share } from 'lucide-react-native';
import type React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';

interface ActivityHeaderProps {
  isAuth: boolean;
  isTicket?: boolean;
  onBackPress: () => void;
  onShare?: () => void;
}

export const ActivityHeader: React.FC<ActivityHeaderProps> = ({
  isAuth,
  isTicket,
  onBackPress,
  onShare,
}) => {
  const primaryTextColor = useThemeColor({}, 'textPrimary');

  const getTitle = () => {
    if (isAuth) return 'Login Details';
    if (isTicket) return 'Ticket Details';
    return 'Payment Details';
  };

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBackPress} style={styles.backButton}>
        <FontAwesome6 name="arrow-left" size={20} color={primaryTextColor} />
      </TouchableOpacity>
      <ThemedText type="title" style={[styles.title, { color: primaryTextColor }]}>
        {getTitle()}
      </ThemedText>
      <View style={styles.headerActions}>
        {onShare && (
          <TouchableOpacity onPress={onShare} style={styles.headerButton}>
            <Share size={20} color={primaryTextColor} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    position: 'relative',
  },
  backButton: {
    padding: 8,
    zIndex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    zIndex: 0,
  },
  headerActions: {
    flexDirection: 'row',
    zIndex: 1,
  },
  headerButton: {
    padding: 8,
  },
});
