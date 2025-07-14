import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, ScrollView, ImageBackground, Animated, Easing } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ticket } from '@/utils/types';
import { formatDayAndDate } from '@/utils';
import { Colors } from '@/constants/Colors';
import { useFocusEffect } from '@react-navigation/native';
import { Nfc } from 'lucide-react-native';


// Mock data for tickets
const getMockedTickets = (): Ticket[] => [
  {
    id: '1',
    title: 'Bitcoin Conference 2024',
    description: 'Annual Bitcoin conference featuring top speakers and networking opportunities',
    serviceName: 'Bitcoin Events',
    eventDate: new Date('2024-12-15T10:00:00Z'),
    status: 'active',
    ticketType: 'event',
    price: 299,
    currency: 'USD',
    location: 'Miami, FL',
    qrCode: 'bitcoin-conf-2024-001',
    createdAt: new Date('2024-11-01T08:00:00Z'),
    imageUrl: require('@/assets/images/ticketCoverMockup.png'),
  },
  {
    id: '2',
    title: 'Lightning Network Workshop',
    description: 'Hands-on workshop to learn Lightning Network development',
    serviceName: 'Lightning Labs',
    eventDate: new Date('2024-12-20T14:00:00Z'),
    status: 'active',
    ticketType: 'event',
    price: 150,
    currency: 'USD',
    location: 'San Francisco, CA',
    qrCode: 'lightning-workshop-002',
    createdAt: new Date('2024-11-05T10:30:00Z'),
    imageUrl: require('@/assets/images/ticketCoverMockup.png'),
  },
  {
    id: '3',
    title: 'Premium Support Access',
    description: '24/7 premium customer support for Portal services',
    serviceName: 'Portal Technologies',
    eventDate: new Date('2024-12-31T23:59:59Z'),
    status: 'active',
    ticketType: 'service',
    price: 99,
    currency: 'USD',
    qrCode: 'premium-support-003',
    createdAt: new Date('2024-10-15T09:00:00Z'),
    imageUrl: require('@/assets/images/ticketCoverMockup.png'),
  },
  {
    id: '4',
    title: 'Nostr Developer Meetup',
    description: 'Monthly meetup for Nostr protocol developers',
    serviceName: 'Nostr Community',
    eventDate: new Date('2024-12-10T18:00:00Z'),
    status: 'used',
    ticketType: 'event',
    price: 0,
    location: 'Austin, TX',
    qrCode: 'nostr-meetup-004',
    createdAt: new Date('2024-11-20T16:00:00Z'),
    imageUrl: require('@/assets/images/ticketCoverMockup.png'),
  },
  {
    id: '5',
    title: 'VIP Lounge Access',
    description: 'Exclusive VIP lounge access at major crypto events',
    serviceName: 'Crypto Events Pro',
    eventDate: new Date('2024-12-25T20:00:00Z'),
    status: 'active',
    ticketType: 'access',
    price: 500,
    currency: 'USD',
    location: 'Las Vegas, NV',
    qrCode: 'vip-lounge-005',
    createdAt: new Date('2024-11-10T12:00:00Z'),
    imageUrl: require('@/assets/images/ticketCoverMockup.png'),
  },
];

// Helper functions
const getStatusColor = (status: Ticket['status']) => {
  switch (status) {
    case 'active':
      return Colors.success;
    case 'used':
      return '#666';
    case 'expired':
      return Colors.error;
    case 'cancelled':
      return Colors.error;
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
}> = ({ ticket, index, isFocused, isFlipped, onPress, focusedCardId, filteredTickets, originalTickets, cardSwapAnim, listSlideAnim }) => {
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

  // Show details when flipped (for the literal card flip effect)
  const shouldShowDetails = isFlipped;



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

  // Calculate card position - simple stacking
  const getCardPosition = () => {
    if (isFocused) {
      return { translateY: 0, scale: 1.05 };
    }
    // Use different squash values based on whether a card is focused
    const squashValue = focusedCardId ? 90 : 130;
    return { translateY: index * squashValue, scale: 1 };
  };

  const { translateY, scale } = getCardPosition();
  
  // Add swap animation if provided
  const swapTranslateY = cardSwapAnim ? cardSwapAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [translateY, isFocused ? 0 : translateY],
  }) : translateY;
  
  // Use swap animation for position, list slide is handled by the container
  const finalTranslateY = swapTranslateY;

  return (
    <Animated.View
      style={[
        styles.ticketCard,
        {
          backgroundColor: cardBackgroundColor,
          borderColor,
          zIndex: isFocused ? 999 : index,
          transform: [
            { translateY: swapTranslateY },
            { scale },
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

// Main Component
export default function TicketsScreen() {
  const [filter, setFilter] = useState<'all' | 'active' | 'used' | 'expired'>('all');
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [flippedCardId, setFlippedCardId] = useState<string | null>(null);
  
  // Animation for focus zone
  const focusZoneAnim = useRef(new Animated.Value(0)).current;
  
  // Animation for card position swapping
  const cardSwapAnim = useRef(new Animated.Value(0)).current;
  
  // Animation for list sliding up when focus zone unmounts
  const listSlideAnim = useRef(new Animated.Value(0)).current;



  const tickets = getMockedTickets();

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonSecondaryColor = useThemeColor({}, 'buttonSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonSecondaryTextColor = useThemeColor({}, 'buttonSecondaryText');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const surfaceSecondaryColor = useThemeColor({}, 'surfaceSecondary');

  // Reset states when page is focused (user reenters)
  useFocusEffect(
    useCallback(() => {
      setFocusedCardId(null);
      setFlippedCardId(null);
    }, [])
  );

  // Filter handlers
  const handleFilterPress = useCallback((filterType: 'all' | 'active' | 'used' | 'expired') => {
    setFilter(filterType);
  }, []);

  // Filtered tickets
  const filteredTickets = useMemo(
    () => (filter === 'all' ? tickets : tickets.filter(ticket => ticket.status === filter)),
    [filter, tickets]
  );

  // Reset states when filter changes
  useEffect(() => {
    setFocusedCardId(null);
    setFlippedCardId(null);
  }, [filter]);

  // Card interaction handler
  const handleCardPress = useCallback((ticketId: string) => {
    if (focusedCardId === ticketId) {
      // If already focused, first flip back, then unfocus after animation
      setFlippedCardId(null);
      // Wait for card flip to complete, then slide out focus zone and slide up list
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(focusZoneAnim, {
            toValue: 0,
            duration: 250,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(listSlideAnim, {
            toValue: 0,
            duration: 250,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(() => {
          // After all animations complete, then change the state
          setFocusedCardId(null);
        });
      }, 400); // Wait for flip animation to complete
    } else if (focusedCardId) {
      // If another card is focused, animate the position swap
      setFlippedCardId(null);
      // Animate the card swap
      Animated.timing(cardSwapAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        // After swap animation completes, update the focused card
        setFocusedCardId(ticketId);
        setFlippedCardId(ticketId);
        // Reset the swap animation
        cardSwapAnim.setValue(0);
      });
    } else {
      // Focus this card and flip it to show details
      setFocusedCardId(ticketId);
      setFlippedCardId(ticketId);
    }
  }, [focusedCardId, focusZoneAnim, cardSwapAnim, listSlideAnim]);

  // Animate focus zone when focused card changes (only for focusing)
  useEffect(() => {
    if (focusedCardId) {
      // Slide in focus zone and slide down list
      Animated.parallel([
        Animated.timing(focusZoneAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(listSlideAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [focusedCardId, focusZoneAnim, listSlideAnim]);

  // Reset animations when no card is focused
  useEffect(() => {
    if (!focusedCardId) {
      focusZoneAnim.setValue(0);
      listSlideAnim.setValue(0);
    }
  }, [focusedCardId, focusZoneAnim, listSlideAnim]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={{ color: primaryTextColor }}>
          Your tickets
        </ThemedText>

        <View style={styles.filterContainer}>
          <TouchableOpacity
            style={[
              styles.filterChip,
              { backgroundColor: filter === 'all' ? buttonPrimaryColor : buttonSecondaryColor },
            ]}
            onPress={() => handleFilterPress('all')}
          >
            <ThemedText
              type="subtitle"
              style={[
                styles.filterChipText,
                { color: filter === 'all' ? buttonPrimaryTextColor : buttonSecondaryTextColor },
              ]}
            >
              All
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterChip,
              { backgroundColor: filter === 'active' ? buttonPrimaryColor : buttonSecondaryColor },
            ]}
            onPress={() => handleFilterPress('active')}
          >
            <ThemedText
              type="subtitle"
              style={[
                styles.filterChipText,
                { color: filter === 'active' ? buttonPrimaryTextColor : buttonSecondaryTextColor },
              ]}
            >
              Active
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterChip,
              { backgroundColor: filter === 'used' ? buttonPrimaryColor : buttonSecondaryColor },
            ]}
            onPress={() => handleFilterPress('used')}
          >
            <ThemedText
              type="subtitle"
              style={[
                styles.filterChipText,
                { color: filter === 'used' ? buttonPrimaryTextColor : buttonSecondaryTextColor },
              ]}
            >
              Used
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterChip,
              { backgroundColor: filter === 'expired' ? buttonPrimaryColor : buttonSecondaryColor },
            ]}
            onPress={() => handleFilterPress('expired')}
          >
            <ThemedText
              type="subtitle"
              style={[
                styles.filterChipText,
                { color: filter === 'expired' ? buttonPrimaryTextColor : buttonSecondaryTextColor },
              ]}
            >
              Expired
            </ThemedText>
          </TouchableOpacity>
        </View>

        {filteredTickets.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: cardBackgroundColor }]}>
            <ThemedText style={[styles.emptyText, { color: secondaryTextColor }]}>
              No tickets found
            </ThemedText>
          </View>
                ) : (
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Render focused card and NFC section as separate units */}
            <Animated.View
              style={{
                opacity: focusZoneAnim,
                transform: [
                  {
                    translateY: focusZoneAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [50, 0],
                    }),
                  },
                ],
              }}
            >
              {focusedCardId && (
                <>
                                  <TicketCard
                  ticket={filteredTickets.find(t => t.id === focusedCardId)!}
                  index={filteredTickets.findIndex(t => t.id === focusedCardId)}
                  isFocused={true}
                  isFlipped={flippedCardId === focusedCardId}
                  onPress={() => handleCardPress(focusedCardId)}
                  focusedCardId={focusedCardId}
                  filteredTickets={filteredTickets}
                  originalTickets={tickets}
                  cardSwapAnim={cardSwapAnim}
                  listSlideAnim={listSlideAnim}
                />
                  
                  <View style={[styles.nfcSection, { backgroundColor: surfaceSecondaryColor }]}>
                    <View style={styles.nfcIconContainer}>
                      <Nfc size={48} color={buttonPrimaryColor} />
                    </View>
                    <ThemedText type="subtitle" style={[styles.nfcTitle, { color: primaryTextColor }]}>
                      Validate Ticket
                    </ThemedText>
                    <ThemedText style={[styles.nfcDescription, { color: secondaryTextColor }]}>
                      Hold your device near the NFC reader to validate your ticket
                    </ThemedText>
                  </View>
                </>
              )}
            </Animated.View>

            <Animated.View style={[
              styles.cardsContainer,
              focusedCardId && { minHeight: 500 },
              {
                transform: [
                  {
                    translateY: listSlideAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 2], // Slide down less when focused for better spacing
                    }),
                  },
                ],
              },
            ]}>
              {filteredTickets
                .filter(ticket => ticket.id !== focusedCardId)
                .map((ticket, listIndex) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  index={listIndex}
                  isFocused={false} // Never focused in the list
                  isFlipped={flippedCardId === ticket.id}
                  onPress={() => handleCardPress(ticket.id)}
                  focusedCardId={focusedCardId}
                  filteredTickets={filteredTickets}
                  originalTickets={tickets}
                  cardSwapAnim={cardSwapAnim}
                  listSlideAnim={listSlideAnim}
                />
              ))}
            </Animated.View>
          </ScrollView>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  filterContainer: {
    flexDirection: 'row',
    marginTop: 24,
    marginBottom: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  cardsContainer: {
    position: 'relative',
    width: '100%',
    minHeight: 800, // Default height when no card is focused
  },
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
  emptyContainer: {
    flex: 1,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
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
  scrollContainer: {
    flex: 1,
  },
  detailBackgroundImage: {
    borderRadius: 12,
  },
  nfcSection: {
    marginTop: 0,
    marginBottom: 16,
    padding: 16,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  nfcContainer: {
    padding: 20,
    alignItems: 'center',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
  },
  nfcIconContainer: {
    marginBottom: 16,
    alignItems: 'center',
  },
  nfcHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  nfcIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(10, 126, 164, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nfcTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  nfcDescription: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  nfcStatusContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  nfcStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nfcStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  nfcStatusText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
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