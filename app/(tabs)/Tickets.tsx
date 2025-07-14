import React, { useState, useMemo, useCallback } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ticket } from '@/utils/types';
import { formatDayAndDate } from '@/utils';
import { router } from 'expo-router';
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
  },
];

const TicketCard: React.FC<{ ticket: Ticket }> = ({ ticket }) => {
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const successColor = Colors.success;
  const warningColor = Colors.warning;
  const errorColor = Colors.error;

  const getStatusColor = (status: Ticket['status']) => {
    switch (status) {
      case 'active':
        return successColor;
      case 'used':
        return secondaryTextColor;
      case 'expired':
        return errorColor;
      case 'cancelled':
        return errorColor;
      default:
        return secondaryTextColor;
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

  return (
    <TouchableOpacity
      style={[styles.ticketCard, { backgroundColor: cardBackgroundColor }]}
      activeOpacity={0.7}
      onPress={() => {
        // TODO: Navigate to ticket detail page when implemented
        // router.push({
        //   pathname: '/ticket/[id]',
        //   params: { id: ticket.id },
        // });
      }}
    >
      <View style={styles.cardHeader}>
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
      </View>

      <View style={styles.cardContent}>
        <ThemedText style={[styles.description, { color: secondaryTextColor }]}>
          {ticket.description}
        </ThemedText>

        <View style={styles.detailsRow}>
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

        <View style={styles.footerRow}>
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
    </TouchableOpacity>
  );
};

export default function TicketsScreen() {
  const [filter, setFilter] = useState<'all' | 'active' | 'used' | 'expired'>('all');
  const tickets = getMockedTickets();

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonSecondaryColor = useThemeColor({}, 'buttonSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonSecondaryTextColor = useThemeColor({}, 'buttonSecondaryText');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');

  const handleFilterAll = useCallback(() => setFilter('all'), []);
  const handleFilterActive = useCallback(() => setFilter('active'), []);
  const handleFilterUsed = useCallback(() => setFilter('used'), []);
  const handleFilterExpired = useCallback(() => setFilter('expired'), []);

  const filteredTickets = useMemo(
    () => (filter === 'all' ? tickets : tickets.filter(ticket => ticket.status === filter)),
    [filter, tickets]
  );

  const renderItem = useCallback(
    ({ item }: { item: Ticket }) => <TicketCard ticket={item} />,
    []
  );

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
          <FlatList
            showsVerticalScrollIndicator={false}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            data={filteredTickets}
            renderItem={renderItem}
            keyExtractor={item => item.id}
          />
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
  list: {
    marginTop: 8,
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
  },
  ticketCard: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
  },
  cardHeader: {
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  ticketTypeIcon: {
    fontSize: 20,
  },
  serviceName: {
    fontSize: 14,
    fontWeight: '500',
  },
  cardContent: {
    flex: 1,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceContainer: {
    flex: 1,
  },
  price: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
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
}); 