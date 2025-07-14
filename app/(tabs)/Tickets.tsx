import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ticket } from '@/utils/types';
import { formatDayAndDate } from '@/utils';
import { Colors } from '@/constants/Colors';

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
}> = ({ ticket, index, isFocused, isFlipped, onPress, focusedCardId, filteredTickets, originalTickets }) => {
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const borderColor = useThemeColor({}, 'borderPrimary');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');

  // Calculate card position - simple stacking
  const getCardPosition = () => {
    if (isFocused) {
      return { translateY: 0, scale: 1.05 };
    }
    return { translateY: index * 130, scale: 1 };
  };

  // If focused, position absolutely outside the list flow
  if (isFocused) {
    return (
      <View style={styles.focusedCardContainer}>
        <TouchableOpacity
          style={[
            styles.ticketCard,
            {
              backgroundColor: cardBackgroundColor,
              borderColor,
              zIndex: 999,
              transform: [{ scale: 1.05 }],
            },
            isFlipped ? {} : styles.ticketCardCover,
          ]}
          activeOpacity={0.8}
          onPress={onPress}
        >
          {isFlipped ? (
            // Show ticket details
            <View style={styles.cardContent}>
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
              </View>

              <View style={styles.rightSection}>
                <View style={styles.detailsColumn}>
                  <View style={styles.detailItem}>
                    <ThemedText style={[styles.detailLabel, { color: secondaryTextColor }]}>
                      Event Date
                    </ThemedText>
                    <ThemedText style={[styles.detailValue, { color: primaryTextColor }]}>
                      {formatDayAndDate(ticket.eventDate)}
                    </ThemedText>
                  </View>

                  {ticket.location && (
                    <View style={styles.detailItem}>
                      <ThemedText style={[styles.detailLabel, { color: secondaryTextColor }]}>
                        Location
                      </ThemedText>
                      <ThemedText style={[styles.detailValue, { color: primaryTextColor }]}>
                        {ticket.location}
                      </ThemedText>
                    </View>
                  )}
                </View>

                <View style={styles.footerColumn}>
                  <View style={styles.priceContainer}>
                    {ticket.price !== undefined && (
                      <ThemedText style={[styles.price, { color: primaryTextColor }]}>
                        {ticket.price === 0 ? 'Free' : `${ticket.price} ${ticket.currency}`}
                      </ThemedText>
                    )}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(ticket.status) }]}>
                    <ThemedText style={styles.statusText}>
                      {getStatusText(ticket.status)}
                    </ThemedText>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            // Show cover image
            <View style={styles.coverContainer}>
              <Image
                source={ticket.imageUrl || require('@/assets/images/ticketCoverMockup.png')}
                style={styles.coverImage}
                resizeMode="cover"
              />
              <View style={styles.cardNumberOverlay}>
                <ThemedText style={styles.cardNumberText}>
                  {originalTickets.findIndex(t => t.id === ticket.id) + 1}
                </ThemedText>
                {isFocused && (
                  <ThemedText style={[styles.cardNumberText, { fontSize: 16, marginTop: 8 }]}>
                    FOCUSED
                  </ThemedText>
                )}
              </View>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  const { translateY, scale } = getCardPosition();

  return (
    <TouchableOpacity
      style={[
        styles.ticketCard,
        {
          backgroundColor: cardBackgroundColor,
          borderColor,
          zIndex: isFocused ? 999 : index,
          transform: [{ translateY }, { scale }],
        },
        isFlipped ? {} : styles.ticketCardCover,
      ]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      {isFlipped ? (
        // Show ticket details
        <View style={styles.cardContent}>
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
          </View>

          <View style={styles.rightSection}>
            <View style={styles.detailsColumn}>
              <View style={styles.detailItem}>
                <ThemedText style={[styles.detailLabel, { color: secondaryTextColor }]}>
                  Event Date
                </ThemedText>
                <ThemedText style={[styles.detailValue, { color: primaryTextColor }]}>
                  {formatDayAndDate(ticket.eventDate)}
                </ThemedText>
              </View>

              {ticket.location && (
                <View style={styles.detailItem}>
                  <ThemedText style={[styles.detailLabel, { color: secondaryTextColor }]}>
                    Location
                  </ThemedText>
                  <ThemedText style={[styles.detailValue, { color: primaryTextColor }]}>
                    {ticket.location}
                  </ThemedText>
                </View>
              )}
            </View>

            <View style={styles.footerColumn}>
              <View style={styles.priceContainer}>
                {ticket.price !== undefined && (
                  <ThemedText style={[styles.price, { color: primaryTextColor }]}>
                    {ticket.price === 0 ? 'Free' : `${ticket.price} ${ticket.currency}`}
                  </ThemedText>
                )}
              </View>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(ticket.status) }]}>
                <ThemedText style={styles.statusText}>
                  {getStatusText(ticket.status)}
                </ThemedText>
              </View>
            </View>
          </View>
        </View>
      ) : (
        // Show cover image
        <View style={styles.coverContainer}>
          <Image
            source={ticket.imageUrl || require('@/assets/images/ticketCoverMockup.png')}
            style={styles.coverImage}
            resizeMode="cover"
          />
          <View style={styles.cardNumberOverlay}>
            <ThemedText style={styles.cardNumberText}>
              {originalTickets.findIndex(t => t.id === ticket.id) + 1}
            </ThemedText>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
};

// Main Component
export default function TicketsScreen() {
  const [filter, setFilter] = useState<'all' | 'active' | 'used' | 'expired'>('all');
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [flippedCardId, setFlippedCardId] = useState<string | null>(null);

  const tickets = getMockedTickets();

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonSecondaryColor = useThemeColor({}, 'buttonSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonSecondaryTextColor = useThemeColor({}, 'buttonSecondaryText');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');

  // Filter handlers
  const handleFilterAll = useCallback(() => setFilter('all'), []);
  const handleFilterActive = useCallback(() => setFilter('active'), []);
  const handleFilterUsed = useCallback(() => setFilter('used'), []);
  const handleFilterExpired = useCallback(() => setFilter('expired'), []);

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
      // If already focused, toggle flip state
      setFlippedCardId(prevId => prevId === ticketId ? null : ticketId);
    } else {
      // Focus this card and clear any flipped state
      setFocusedCardId(ticketId);
      setFlippedCardId(null);
    }
  }, [focusedCardId]);

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
            onPress={handleFilterAll}
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
            onPress={handleFilterActive}
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
            onPress={handleFilterUsed}
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
            onPress={handleFilterExpired}
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
          <View style={[styles.emptyContainer, { backgroundColor: useThemeColor({}, 'cardBackground') }]}>
            <ThemedText style={[styles.emptyText, { color: secondaryTextColor }]}>
              No tickets found
            </ThemedText>
          </View>
        ) : (
          <View style={styles.scrollContainer}>
            {/* Render focused card separately if exists */}
            {focusedCardId && (
              <TicketCard
                ticket={filteredTickets.find(t => t.id === focusedCardId)!}
                index={filteredTickets.findIndex(t => t.id === focusedCardId)}
                isFocused={true}
                isFlipped={flippedCardId === focusedCardId}
                onPress={() => handleCardPress(focusedCardId)}
                focusedCardId={focusedCardId}
                filteredTickets={filteredTickets}
                originalTickets={tickets}
              />
            )}
            
            <ScrollView
              style={styles.scrollView}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              <View style={[
                styles.cardsContainer,
                focusedCardId && { marginTop: 250 }
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
                  />
                ))}
              </View>
            </ScrollView>
          </View>
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
    minHeight: 800, // Ensure enough space for stacked cards and scrolling
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
  cardNumberOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  cardNumberText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  focusedCardContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
  },
  scrollContainer: {
    flex: 1,
  },
}); 