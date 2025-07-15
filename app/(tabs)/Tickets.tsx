import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, ScrollView, ImageBackground, Animated, Easing, Alert, Platform } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ticket } from '@/utils/types';
import { formatDayAndDate } from '@/utils';
import { Colors } from '@/constants/Colors';
import { useFocusEffect } from '@react-navigation/native';
import { Nfc, CheckCircle, XCircle } from 'lucide-react-native';
import NfcManager, { NfcEvents } from 'react-native-nfc-manager';
import * as Linking from 'expo-linking';
import TicketCard from '@/components/TicketCard';


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







// Main Component
export default function TicketsScreen() {
  const [filter, setFilter] = useState<'all' | 'active' | 'used' | 'expired'>('all');
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [flippedCardId, setFlippedCardId] = useState<string | null>(null);
  const [closingCardId, setClosingCardId] = useState<string | null>(null);
  const [closingCardOriginalIndex, setClosingCardOriginalIndex] = useState<number>(0);
  
  // NFC state management
  const [isNFCEnabled, setIsNFCEnabled] = useState<boolean | null>(null);
  const [isCheckingNFC, setIsCheckingNFC] = useState(false);
  
  // Animation for focus zone
  const focusZoneAnim = useRef(new Animated.Value(0)).current;
  
  // Animation for card position swapping
  const cardSwapAnim = useRef(new Animated.Value(0)).current;
  
  // Animation for list sliding up when focus zone unmounts
  const listSlideAnim = useRef(new Animated.Value(0)).current;

  // New animation for smooth transitions
  const transitionAnim = useRef(new Animated.Value(0)).current;
  
  // New animation for progressive squash value changes
  const squashAnim = useRef(new Animated.Value(0)).current;
  
  // Animation for closing card transition
  const closeAnim = useRef(new Animated.Value(0)).current;
  
  // Animation for list sliding up during closing
  const listSlideUpAnim = useRef(new Animated.Value(0)).current;
  
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // ScrollView ref for scrolling to top
  const scrollViewRef = useRef<ScrollView>(null);

  const tickets = getMockedTickets();

  // NFC Status Checking
  const checkNFCStatus = async (): Promise<boolean> => {
    try {
      // Initialize NFC Manager if not already done
      const isStarted = await NfcManager.isSupported();
      if (!isStarted) {
        console.log('NFC not supported on this device');
        return false;
      }

      // Check if NFC is enabled
      const isEnabled = await NfcManager.isEnabled();
      return isEnabled;
    } catch (error) {
      console.log('NFC check error:', error);
      return false;
    }
  };

  const openNFCSettings = async () => {
    try {
      if (Platform.OS === 'android') {
        // Try to open NFC settings directly
        const nfcSettingsUrl = 'android.settings.NFC_SETTINGS';
        const canOpen = await Linking.canOpenURL(nfcSettingsUrl);

        if (canOpen) {
          await Linking.openURL(nfcSettingsUrl);
        } else {
          // Fallback to general wireless settings
          await Linking.openSettings();
        }
      } else {
        // For iOS, open general settings (NFC can't be controlled by user)
        await Linking.openSettings();
      }
    } catch (error) {
      console.error('Error opening settings:', error);
    }
  };

  const showNFCEnableDialog = () => {
    Alert.alert(
      'Enable NFC',
      Platform.OS === 'android'
        ? 'NFC is required for contactless ticket validation. Would you like to open settings to enable it?'
        : 'NFC may be required for this feature. Would you like to open settings?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: openNFCSettings,
          style: 'default'
        },
      ]
    );
  };

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
      setClosingCardId(null);
      setIsTransitioning(false);
      setIsNFCEnabled(null);
      setIsCheckingNFC(false);
      transitionAnim.setValue(0);
      focusZoneAnim.setValue(0);
      listSlideAnim.setValue(0);
      squashAnim.setValue(0);
      closeAnim.setValue(0);
      listSlideUpAnim.setValue(0);
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
    setClosingCardId(null);
    setIsTransitioning(false);
    transitionAnim.setValue(0);
    focusZoneAnim.setValue(0);
    listSlideAnim.setValue(0);
    squashAnim.setValue(0);
    closeAnim.setValue(0);
    listSlideUpAnim.setValue(0);
  }, [filter]);

  // Card interaction handler with improved animation timing
  const handleCardPress = useCallback((ticketId: string) => {
    if (focusedCardId === ticketId) {
      // If already focused, start closing animation
      setIsTransitioning(true);
      setFlippedCardId(null);
      
      // Set closing card state for smooth transition
      setClosingCardId(ticketId);
      setClosingCardOriginalIndex(filteredTickets.findIndex(t => t.id === ticketId));
      
      console.log('Starting closing animation with list slide up');
      
      // Animate closing transition with list slide up effect
      Animated.parallel([
        Animated.timing(closeAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(listSlideUpAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.back(1.2)), // More dramatic easing
          useNativeDriver: true,
        }),
        Animated.timing(transitionAnim, {
          toValue: 0,
          duration: 600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(focusZoneAnim, {
          toValue: 0,
          duration: 600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(listSlideAnim, {
          toValue: 0,
          duration: 600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(squashAnim, {
          toValue: 0,
          duration: 600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        // After closing animation completes, update state
        setFocusedCardId(null);
        setClosingCardId(null);
        setIsTransitioning(false);
        closeAnim.setValue(0);
        listSlideUpAnim.setValue(0);
      });
    } else if (focusedCardId) {
      // If another card is focused, animate the position swap
      setIsTransitioning(true);
      setFlippedCardId(null);
      
      // Scroll to top when clicking a card in the list
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      
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
        setIsTransitioning(false);
        // Reset the swap animation
        cardSwapAnim.setValue(0);
      });
    } else {
      // Focus this card and flip it to show details
      setIsTransitioning(true);
      
      // Set the focused card immediately for proper positioning
      setFocusedCardId(ticketId);
      setFlippedCardId(ticketId);
      
      // Check NFC status when card is focused
      const checkNFCOnFocus = async () => {
        setIsCheckingNFC(true);
        try {
          const enabled = await checkNFCStatus();
          setIsNFCEnabled(enabled);
        } catch (error) {
          console.log('Error checking NFC status:', error);
          setIsNFCEnabled(false);
        } finally {
          setIsCheckingNFC(false);
        }
      };
      
      checkNFCOnFocus();
      
      // Animate transition in
      Animated.parallel([
        Animated.timing(transitionAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(focusZoneAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(listSlideAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(squashAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsTransitioning(false);
      });
    }
  }, [focusedCardId, transitionAnim, cardSwapAnim, focusZoneAnim, listSlideAnim, squashAnim, closeAnim, listSlideUpAnim, filteredTickets]);

  // Reset animations when no card is focused
  useEffect(() => {
    if (!focusedCardId && !isTransitioning && !closingCardId) {
      focusZoneAnim.setValue(0);
      listSlideAnim.setValue(0);
      transitionAnim.setValue(0);
      squashAnim.setValue(0);
      closeAnim.setValue(0);
      listSlideUpAnim.setValue(0);
    }
  }, [focusedCardId, focusZoneAnim, listSlideAnim, isTransitioning, transitionAnim, squashAnim, closeAnim, listSlideUpAnim, closingCardId]);

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
            ref={scrollViewRef}
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Focus Zone - Always rendered but animated */}
            <Animated.View
              style={{
                opacity: transitionAnim,
                transform: [
                  {
                    translateY: transitionAnim.interpolate({
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
                    squashAnim={squashAnim}
                  />
                  
                  <View style={[styles.nfcSection, { backgroundColor: surfaceSecondaryColor }]}>
                    <View style={styles.nfcIconContainer}>
                      {isCheckingNFC ? (
                        <View style={styles.nfcStatusContainer}>
                          <ThemedText style={[styles.nfcStatusText, { color: secondaryTextColor }]}>
                            Checking NFC...
                          </ThemedText>
                        </View>
                      ) : isNFCEnabled === null ? (
                        <Nfc size={48} color={buttonPrimaryColor} />
                      ) : isNFCEnabled ? (
                        <CheckCircle size={48} color={Colors.success} />
                      ) : (
                        <XCircle size={48} color={Colors.error} />
                      )}
                    </View>
                    <ThemedText type="subtitle" style={[styles.nfcTitle, { color: primaryTextColor }]}>
                      {isCheckingNFC 
                        ? 'Checking NFC...'
                        : isNFCEnabled === null
                        ? 'Validate Ticket'
                        : isNFCEnabled
                        ? 'NFC Ready'
                        : 'NFC Required'
                      }
                    </ThemedText>
                    <ThemedText style={[styles.nfcDescription, { color: secondaryTextColor }]}>
                      {isCheckingNFC
                        ? 'Checking if NFC is available on your device'
                        : isNFCEnabled === null
                        ? 'Hold your device near the NFC reader to validate your ticket'
                        : isNFCEnabled
                        ? 'NFC is enabled. Hold your device near the NFC reader to validate your ticket'
                        : 'NFC is disabled. Enable NFC in your device settings to validate tickets'
                      }
                    </ThemedText>

                  </View>
                </>
              )}
            </Animated.View>

            {/* Closing Card - Animates from focused position back to list position */}
            {closingCardId && (
              <Animated.View
                style={[
                  styles.closingCardContainer,
                  {
                    transform: [
                      {
                        translateY: closeAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, closingCardOriginalIndex * 90], // Animate to list position
                        }),
                      },
                      {
                        scale: closeAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1], // Maintain size
                        }),
                      },
                      // The closing card should go to its original list position, not slide up
                      // Remove the list slide up coordination for the closing card
                    ],
                    opacity: closeAnim.interpolate({
                      inputRange: [0, 0.8, 1],
                      outputRange: [1, 1, 0], // Fade out at the end
                    }),
                  },
                ]}
              >
                <TicketCard
                  ticket={filteredTickets.find(t => t.id === closingCardId)!}
                  index={closingCardOriginalIndex}
                  isFocused={false}
                  isFlipped={false}
                  onPress={() => {}} // No interaction during closing
                  focusedCardId={null}
                  filteredTickets={filteredTickets}
                  originalTickets={tickets}
                  cardSwapAnim={cardSwapAnim}
                  listSlideAnim={listSlideAnim}
                  squashAnim={squashAnim}
                />
              </Animated.View>
            )}

            {/* List Cards - Always render all cards, use animated transitions */}
            <Animated.View style={[
              styles.cardsContainer,
              focusedCardId && { minHeight: 500 },
              {
                transform: [
                  {
                    translateY: listSlideAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 2],
                    }),
                  },
                ],
                // Add visual indicator during animation
                backgroundColor: listSlideUpAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['transparent', 'rgba(255, 0, 0, 0.1)'], // Red tint during animation
                }),
              },
            ]}>
              {filteredTickets.map((ticket, listIndex) => {
                const isFocusedInList = ticket.id === focusedCardId;
                const isClosingInList = ticket.id === closingCardId;
                const shouldShowInList = !isFocusedInList && !isClosingInList; // Remove when focused or closing
                
                // Calculate adjusted index for proper positioning when focused card is removed
                const focusedIndex = filteredTickets.findIndex(t => t.id === focusedCardId);
                const adjustedIndex = focusedCardId && focusedIndex !== -1
                  ? (listIndex > focusedIndex ? listIndex - 1 : listIndex)
                  : listIndex;
                
                // Use smooth transitions for list card visibility
                const listCardOpacity = shouldShowInList ? 1 : 0;
                const listCardTranslateY = shouldShowInList ? 0 : -20;
                
                // Add smooth transition for list cards during closing
                const finalOpacity = closingCardId && isClosingInList 
                  ? closeAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 0], // Fade out during closing
                    })
                  : listCardOpacity;
                
                // Make list cards slide up to fill NFC section space during closing
                const finalTranslateY = closingCardId 
                  ? listSlideUpAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -150], // Slide up to fill NFC section space
                    })
                  : (isClosingInList 
                    ? closeAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -20], // Slide out during closing
                      })
                    : listCardTranslateY);
                
                                  return (
                    <Animated.View
                      key={ticket.id}
                      style={{
                        opacity: finalOpacity,
                        transform: [
                          {
                            translateY: finalTranslateY,
                          },
                        ],
                      }}
                    >
                    <TicketCard
                      ticket={ticket}
                      index={adjustedIndex}
                      isFocused={false}
                      isFlipped={false} // List cards should never flip
                      onPress={() => handleCardPress(ticket.id)}
                      focusedCardId={focusedCardId}
                      filteredTickets={filteredTickets}
                      originalTickets={tickets}
                      cardSwapAnim={cardSwapAnim}
                      listSlideAnim={listSlideAnim}
                      squashAnim={squashAnim}
                    />
                  </Animated.View>
                );
              })}
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
    paddingTop: 16
  },
  cardsContainer: {
    position: 'relative',
    width: '100%',
    minHeight: 800, // Default height when no card is focused
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
  // New styles for improved animation system
  transitionContainer: {
    position: 'relative',
  },
  listCardWrapper: {
    position: 'relative',
  },
  closingCardContainer: {
    position: 'absolute',
    width: '100%',
    zIndex: 998, // Below focused card but above list
    top: 0,
  },
}); 