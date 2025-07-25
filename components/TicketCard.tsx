import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { formatDayAndDate, Ticket } from '@/utils';

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

  // Use card background if available, otherwise fallback to mockup
  const cardImageSource = ticket.frontCardBackground
    ? { uri: ticket.frontCardBackground }
    : require('@/assets/images/ticketCoverMockup.png');

  // Format ticket title with quantity if balance > 1
  const formatTicketTitle = () => {
    const balance = Number(ticket.balance);
    if (balance > 1) {
      return `${ticket.title} x ${balance}`;
    }
    return ticket.title;
  };

  if (isFocused) {
    // Focused card with info overlay
    return (
      <View
        style={[styles.focusedCardContainer, { backgroundColor: cardBackgroundColor, borderColor }]}
      >
        <TouchableOpacity style={styles.touchableArea} activeOpacity={0.8} onPress={onPress}>
          <View style={styles.focusedContainer}>
            <Image source={cardImageSource} style={styles.focusedCoverImage} resizeMode="cover" />
            <View style={styles.focusedContent}>
              {/* Title and description at top */}
              <View style={styles.focusedTopSection}>
                {/* Title at top like front card */}
                <View style={styles.focusedTitleContainer}>
                  <ThemedText style={styles.focusedTitleText}>{formatTicketTitle()}</ThemedText>
                </View>

                {/* Description right under title */}
                {ticket.description && (
                  <View style={styles.focusedDescriptionContainer}>
                    <ThemedText style={styles.focusedDescriptionText}>
                      {ticket.description}
                    </ThemedText>
                  </View>
                )}
              </View>

              {/* Date and Location at bottom */}
              <View style={styles.focusedBottomRow}>
                {ticket.date && (
                  <View style={styles.focusedDateContainer}>
                    <ThemedText style={styles.focusedDateText}>📅 {ticket.date}</ThemedText>
                  </View>
                )}
                {ticket.location && (
                  <View style={styles.focusedLocationContainer}>
                    <ThemedText style={styles.focusedLocationText}>📍 {ticket.location}</ThemedText>
                  </View>
                )}
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
          <Image source={cardImageSource} style={styles.coverImage} resizeMode="cover" />
          <View style={styles.titleOverlay}>
            <ThemedText style={styles.titleOverlayText}>{formatTicketTitle()}</ThemedText>
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
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  balanceText: {
    fontSize: 14,
    fontWeight: '600',
  },
  nftBadge: {
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  mintInfo: {
    marginTop: 8,
  },
  mintLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  overlayBalance: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  overlayBalanceText: {
    fontSize: 12,
    fontWeight: '600',
  },
  overlayNftBadge: {
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  focusedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusedCoverImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  focusedContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'space-between',
  },
  focusedTopSection: {
    flex: 1,
  },
  focusedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  focusedTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  focusedDescription: {
    fontSize: 13,
    lineHeight: 16,
    marginBottom: 8,
  },
  focusedDateLocationRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 12,
  },
  focusedDateLocationItem: {
    flex: 1,
  },
  focusedDateLocationLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  focusedTitleContainer: {
    marginBottom: 2,
  },
  focusedTitleText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  focusedDescriptionContainer: {
    marginBottom: 2,
  },
  focusedDescriptionText: {
    fontSize: 13,
    lineHeight: 16,
    color: '#FFFFFF',
  },
  focusedBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
  },
  focusedDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  focusedDateText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  focusedLocationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  focusedLocationText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});

export default TicketCard;
