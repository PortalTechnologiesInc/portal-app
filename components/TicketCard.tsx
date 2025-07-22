import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { formatDayAndDate, Ticket } from '@/utils';

// const getTicketTypeIcon = (type: Ticket['ticketType']) => {
//   switch (type) {
//     case 'event':
//       return '🎫';
//     case 'service':
//       return '🔧';
//     case 'access':
//       return '🔓';
//     default:
//       return '🎫';
//   }
// };

const TicketCard: React.FC<{
  ticket: Ticket;
  index: number;
  isFocused: boolean;
  onPress: () => void;
}> = ({ ticket, index, isFocused, onPress }) => {
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const borderColor = useThemeColor({}, 'borderPrimary');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');

  if (isFocused) {
    // Detailed card view
    return (
      <View
        style={[styles.focusedCardContainer, { backgroundColor: cardBackgroundColor, borderColor }]}
      >
        <TouchableOpacity style={styles.touchableArea} activeOpacity={0.8} onPress={onPress}>
          <View style={styles.detailBackgroundImage}>
            <Image
              // source={ticket.imageUrl || require('@/assets/images/ticketCoverMockup.png')}
              source={require('@/assets/images/ticketCoverMockup.png')}
              style={styles.coverImage}
              resizeMode="cover"
            />
            <View style={styles.titleOverlay}>
              <ThemedText style={styles.titleOverlayText}>{ticket.title}</ThemedText>
            </View>
          </View>
          <View style={styles.cardContent}>
            <View style={styles.leftSection}>
              <View style={styles.titleRow}>
                <ThemedText type="subtitle" style={{ color: primaryTextColor, flex: 1 }}>
                  {ticket.title}
                </ThemedText>
                <ThemedText style={styles.ticketTypeIcon}>
                  {/* {getTicketTypeIcon(ticket.ticketType)} */}
                </ThemedText>
              </View>
              {/* <ThemedText style={[styles.serviceName, { color: secondaryTextColor }]}>
                {ticket.serviceName}
              </ThemedText> */}
              <ThemedText style={[styles.description, { color: secondaryTextColor }]}>
                {ticket.description}
              </ThemedText>
              <View style={styles.dateLocationRow}>
                <View style={styles.dateLocationItem}>
                  <ThemedText style={[styles.dateLocationLabel, { color: secondaryTextColor }]}>
                    {/* {formatDayAndDate(ticket.eventDate)} */}
                  </ThemedText>
                </View>
                {/* {ticket.location && (
                  <View style={styles.dateLocationItem}>
                    <ThemedText style={[styles.dateLocationLabel, { color: secondaryTextColor }]}>
                      📍 {ticket.location}
                    </ThemedText>
                  </View>
                )} */}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  // Stacked/overlapping cover card view with more spacing
  return (
    <View
      style={[
        styles.ticketCard,
        {
          backgroundColor: cardBackgroundColor,
          borderColor,
          top: index * 130, // More spacing between stacked cards
        },
        styles.ticketCardCover,
      ]}
    >
      <TouchableOpacity style={styles.touchableArea} activeOpacity={0.8} onPress={onPress}>
        <View style={styles.coverContainer}>
          <Image
            // source={ticket.imageUrl || require('@/assets/images/ticketCoverMockup.png')}
            source={require('@/assets/images/ticketCoverMockup.png')}
            style={styles.coverImage}
            resizeMode="cover"
          />
          <View style={styles.titleOverlay}>
            <ThemedText style={styles.titleOverlayText}>{ticket.title}</ThemedText>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  ticketCard: {
    position: 'absolute',
    width: '100%',
    aspectRatio: 1.586,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    top: 0,
  },
  focusedCardContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1.586,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  ticketCardCover: {
    padding: 0,
  },
  cardContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  leftSection: {
    flex: 1,
    marginRight: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  ticketTypeIcon: {
    fontSize: 16,
  },
  serviceName: {
    fontSize: 12,
    fontWeight: '500',
  },
  description: {
    fontSize: 11,
    lineHeight: 14,
    marginBottom: 6,
  },
  coverContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  titleOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
  },
  titleOverlayText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  detailBackgroundImage: {
    borderRadius: 12,
  },
  dateLocationRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 12,
  },
  dateLocationItem: {
    flex: 1,
  },
  dateLocationLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  touchableArea: {
    flex: 1,
  },
});

export default TicketCard;
