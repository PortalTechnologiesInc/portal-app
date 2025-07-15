import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Animated } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ticket } from '@/utils/types';
import { formatDayAndDate } from '@/utils';

// Helper functions
const getStatusColor = (status: Ticket['status']) => {
  switch (status) {
    case 'active':
      return '#4CAF50';
    case 'used':
      return '#666';
    case 'expired':
      return '#F44336';
    case 'cancelled':
      return '#F44336';
    default:
      return '#666';
  }
};

const getStatusText = (status: Ticket['status']) => {
  switch (status) {
    case 'active':
      return 'Active';
    case 'used':
      return 'Used';
    case 'expired':
      return 'Expired';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
};

const getTicketTypeIcon = (type: Ticket['ticketType']) => {
  switch (type) {
    case 'event':
      return '🎫';
    case 'service':
      return '🔧';
    case 'access':
      return '🔓';
    default:
      return '🎫';
  }
};

// Ticket Card Component
const TicketCard: React.FC<{
  ticket: Ticket;
  index: number;
  isFocused: boolean;
  isFlipped: boolean;
  onPress: () => void;
  focusedCardId: string | null;
  filteredTickets: Ticket[];
  originalTickets: Ticket[];
  cardSwapAnim?: Animated.Value;
  listSlideAnim?: Animated.Value;
  squashAnim?: Animated.Value;
}> = ({ ticket, index, isFocused, isFlipped, onPress, focusedCardId, filteredTickets, originalTickets, cardSwapAnim, listSlideAnim, squashAnim }) => {
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const borderColor = useThemeColor({}, 'borderPrimary');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');

  // Animation refs - only flip animation
  const flipAnim = useRef(new Animated.Value(0)).current;

  // Animate flip based on flipped state
  useEffect(() => {
    if (isFlipped) {
      // Flip to reveal details
      Animated.timing(flipAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    } else {
      // Flip back to show cover
      Animated.timing(flipAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }
  }, [isFlipped]);

  // Calculate flip rotation - start with cover, flip to show details
  const flipRotation = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  // Create separate animated values for front and back faces
  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });

  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [0, 0, 1, 1],
  });

  // Use animated opacity values for smooth transitions
  const frontFaceOpacity = frontOpacity;
  const backFaceOpacity = backOpacity;

  // If focused, position absolutely outside the list flow
  if (isFocused) {
    return (
      <View style={styles.focusedCardContainer}>
        <Animated.View
          style={[
            styles.focusedTicketCard,
            {
              backgroundColor: cardBackgroundColor,
              borderColor,
              zIndex: 999,
              transform: [
                { rotateY: flipRotation },
              ],
            },
            styles.ticketCardCover,
          ]}
        >
          <TouchableOpacity
            style={styles.touchableArea}
            activeOpacity={0.8}
            onPress={onPress}
          >
            {/* Front face - Cover image */}
            <Animated.View style={[styles.cardFace, { opacity: frontFaceOpacity }]}>
              <View style={styles.coverContainer}>
                <Image
                  source={ticket.imageUrl || require('@/assets/images/ticketCoverMockup.png')}
                  style={styles.coverImage}
                  resizeMode="cover"
                />
                <View style={styles.titleOverlay}>
                  <ThemedText style={styles.titleOverlayText}>
                    {ticket.title}
                  </ThemedText>
                </View>
              </View>
            </Animated.View>

            {/* Back face - Details */}
            <Animated.View style={[styles.cardFace, styles.cardFaceBack, { opacity: backFaceOpacity }]}>
              <View style={[styles.cardContent, { backgroundColor: '#0c0c0f', flex: 1, padding: 16 }]}>
                <View style={styles.leftSection}>
                  <View style={styles.titleRow}>
                    <ThemedText type="subtitle" style={{ color: primaryTextColor, flex: 1 }}>
                      {ticket.title}
                    </ThemedText>
                    <ThemedText style={styles.ticketTypeIcon}>
                      {getTicketTypeIcon(ticket.ticketType)}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.serviceName, { color: secondaryTextColor }]}>
                    {ticket.serviceName}
                  </ThemedText>
                  <ThemedText style={[styles.description, { color: secondaryTextColor }]}>
                    {ticket.description}
                  </ThemedText>
                  
                  <View style={styles.dateLocationRow}>
                    <View style={styles.dateLocationItem}>
                      <ThemedText style={[styles.dateLocationLabel, { color: secondaryTextColor }]}>
                        {formatDayAndDate(ticket.eventDate)}
                      </ThemedText>
                    </View>
                    {ticket.location && (
                      <View style={styles.dateLocationItem}>
                        <ThemedText style={[styles.dateLocationLabel, { color: secondaryTextColor }]}>
                        📍 {ticket.location}
                      </ThemedText>
                    </View>
                    )}
                  </View>
                </View>
              </View>
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  // Calculate card position for list cards
  const getCardPosition = () => {
    // Use progressive squash values based on squash animation
    const baseSquashValue = 130; // Default when no card is focused
    const focusedSquashValue = 90; // When a card is focused
    
    // Fallback to static values
    const squashValue = focusedCardId ? focusedSquashValue : baseSquashValue;
    return { translateY: index * squashValue, scale: 1 };
  };

  const { translateY, scale } = getCardPosition();
  
  // Add swap animation if provided
  const swapTranslateY = cardSwapAnim ? cardSwapAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [translateY, translateY], // Keep original position for list cards
  }) : translateY;

  // Calculate the final translateY with progressive squash animation
  // This only affects spacing, not card size
  const finalTranslateY = squashAnim 
    ? squashAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [index * 130, index * 90], // Progressive squash values for spacing only
      })
    : swapTranslateY;

  return (
    <Animated.View
      style={[
        styles.ticketCard,
        {
          backgroundColor: cardBackgroundColor,
          borderColor,
          zIndex: index,
          transform: [
            { translateY: finalTranslateY },
            { scale: 1 }, // Always keep scale at 1 to maintain card size
            { rotateY: flipRotation },
          ],
        },
        styles.ticketCardCover,
      ]}
    >
      <TouchableOpacity
        style={styles.touchableArea}
        activeOpacity={0.8}
        onPress={onPress}
      >
        {/* Front face - Cover image */}
        <Animated.View style={[styles.cardFace, { opacity: frontFaceOpacity }]}>
          <View style={styles.coverContainer}>
            <Image
              source={ticket.imageUrl || require('@/assets/images/ticketCoverMockup.png')}
              style={styles.coverImage}
              resizeMode="cover"
            />
            <View style={styles.titleOverlay}>
              <ThemedText style={styles.titleOverlayText}>
                {ticket.title}
              </ThemedText>
            </View>
          </View>
        </Animated.View>

        {/* Back face - Details */}
        <Animated.View style={[styles.cardFace, styles.cardFaceBack, { opacity: backFaceOpacity }]}>
          <View style={[styles.cardContent, { backgroundColor: '#0c0c0f', flex: 1, padding: 16 }]}>
            <View style={styles.leftSection}>
              <View style={styles.titleRow}>
                <ThemedText type="subtitle" style={{ color: primaryTextColor, flex: 1 }}>
                  {ticket.title}
                </ThemedText>
                <ThemedText style={styles.ticketTypeIcon}>
                  {getTicketTypeIcon(ticket.ticketType)}
                </ThemedText>
              </View>
              <ThemedText style={[styles.serviceName, { color: secondaryTextColor }]}>
                {ticket.serviceName}
              </ThemedText>
              <ThemedText style={[styles.description, { color: secondaryTextColor }]}>
                {ticket.description}
              </ThemedText>
              
              <View style={styles.dateLocationRow}>
                <View style={styles.dateLocationItem}>
                  <ThemedText style={[styles.dateLocationLabel, { color: secondaryTextColor }]}>
                    {formatDayAndDate(ticket.eventDate)}
                  </ThemedText>
                </View>
                {ticket.location && (
                  <View style={styles.dateLocationItem}>
                    <ThemedText style={[styles.dateLocationLabel, { color: secondaryTextColor }]}>
                    📍 {ticket.location}
                  </ThemedText>
                </View>
                )}
              </View>
            </View>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
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
  focusedTicketCard: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1.586,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
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
  rightSection: {
    width: '35%',
    justifyContent: 'space-between',
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
  detailsColumn: {
    marginBottom: 8,
  },
  detailItem: {
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginBottom: 1,
  },
  detailValue: {
    fontSize: 11,
    fontWeight: '600',
  },
  footerColumn: {
    alignItems: 'flex-end',
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
  priceContainer: {
    flex: 1,
  },
  price: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
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
  focusedCardContainer: {
    position: 'relative',
    zIndex: 999,
    marginBottom: 16,
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
  cardFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cardFaceBack: {
    transform: [{ rotateY: '180deg' }],
    backgroundColor: '#0c0c0f',
  },
});

export default TicketCard; 