import { canOpenURL, openSettings, openURL } from 'expo-linking';
import { router } from 'expo-router';
import { AlertTriangle, CheckCircle, Nfc, Upload, XCircle } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import NfcManager from 'react-native-nfc-manager';
import { SafeAreaView } from 'react-native-safe-area-context';
import uuid from 'react-native-uuid';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import TicketCard from '@/components/TicketCard';
import { Colors } from '@/constants/Colors';
import { useECash } from '@/context/ECashContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { globalEvents } from '@/utils/common';
import type { Ticket } from '@/utils/types';

export default function TicketsScreen() {
  const [_filter, setFilter] = useState<'all' | 'active' | 'used' | 'expired'>('all');
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [isNFCEnabled, setIsNFCEnabled] = useState<boolean | null>(null);
  const [isCheckingNFC, setIsCheckingNFC] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [mintStatuses, setMintStatuses] = useState<Record<string, 'good' | 'bad'>>({});
  const scrollViewRef = useRef<ScrollView>(null);
  const { wallets, isLoading: eCashLoading } = useECash();
  const [_walletUpdateTrigger, setWalletUpdateTrigger] = useState(0);

  // Listen for wallet balance changes
  useEffect(() => {
    const handleWalletBalancesChanged = () => {
      setWalletUpdateTrigger(prev => prev + 1);
    };

    globalEvents.on('walletBalancesChanged', handleWalletBalancesChanged);

    return () => {
      globalEvents.off('walletBalancesChanged', handleWalletBalancesChanged);
    };
  }, []);

  useEffect(() => {
    async function mapWallets() {
      const allTickets: Ticket[] = [];
      const statusMap: Record<string, 'good' | 'bad'> = {};

      for (const [_, wallet] of Object.entries(wallets)) {
        const mintUrl = wallet.getMintUrl();
        try {
          const unitInfo = await wallet.getUnitInfo();
          const balance = await wallet.getBalance();
          statusMap[mintUrl] = 'good';

          if (unitInfo?.showIndividually) {
            // Create separate tickets for each unit when showIndividually is true
            for (let i = 0; i < balance; i++) {
              allTickets.push({
                id: uuid.v4(),
                title: unitInfo?.title || wallet.unit(),
                description: unitInfo?.description,
                isNonFungible: unitInfo?.showIndividually || false,
                mintUrl,
                balance: BigInt(1), // Each ticket represents 1 unit
                // Rich metadata
                frontCardBackground: unitInfo?.frontCardBackground,
                backCardBackground: unitInfo?.backCardBackground,
                location:
                  unitInfo?.kind?.tag === 'Event' ? unitInfo.kind.inner.location : undefined,
                date: unitInfo?.kind?.tag === 'Event' ? unitInfo.kind.inner.date : undefined,
                kind: unitInfo?.kind?.tag || 'Other',
              });
            }
          } else if (balance > 0) {
            // Create a single aggregated ticket when showIndividually is false
            allTickets.push({
              id: uuid.v4(),
              title: unitInfo?.title || wallet.unit(),
              description: unitInfo?.description,
              isNonFungible: unitInfo?.showIndividually || false,
              mintUrl,
              balance, // balance is already bigint from wallet.getBalance()
              // Rich metadata
              frontCardBackground: unitInfo?.frontCardBackground,
              backCardBackground: unitInfo?.backCardBackground,
              location: unitInfo?.kind?.tag === 'Event' ? unitInfo.kind.inner.location : undefined,
              date: unitInfo?.kind?.tag === 'Event' ? unitInfo.kind.inner.date : undefined,
              kind: unitInfo?.kind?.tag || 'Other',
            });
          }
        } catch (_error) {
          statusMap[mintUrl] = 'bad';
        }
      }

      setTickets(allTickets);
      setMintStatuses(statusMap);
    }
    mapWallets();
  }, [wallets]); // Add walletUpdateTrigger to trigger re-render when wallet balances change

  // NFC Status Checking
  const checkNFCStatus = useCallback(async (): Promise<boolean> => {
    try {
      const isStarted = await NfcManager.isSupported();
      if (!isStarted) {
        return false;
      }
      const isEnabled = await NfcManager.isEnabled();
      return isEnabled;
    } catch {
      return false;
    }
  }, []);

  const openNFCSettings = async () => {
    try {
      if (Platform.OS === 'android') {
        const nfcSettingsUrl = 'android.settings.NFC_SETTINGS';
        const canOpen = await canOpenURL(nfcSettingsUrl);
        if (canOpen) {
          await openURL(nfcSettingsUrl);
        } else {
          await openSettings();
        }
      } else {
        await openSettings();
      }
    } catch {}
  };

  const _showNFCEnableDialog = () => {
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
          style: 'default',
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
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const surfaceSecondaryColor = useThemeColor({}, 'surfaceSecondary');
  const badMints = useMemo(
    () =>
      Object.entries(mintStatuses)
        .filter(([, status]) => status === 'bad')
        .map(([mintUrl]) => mintUrl),
    [mintStatuses]
  );

  const _handleFilterPress = useCallback((filterType: 'all' | 'active' | 'used' | 'expired') => {
    setFilter(filterType);
    setFocusedCardId(null);
  }, []);

  // const filteredTickets = useMemo(
  //   () => (filter === 'all' ? tickets : tickets.filter(ticket => ticket.status === filter)),
  //   [filter, tickets]
  // );

  // When a card is focused, check NFC status
  useEffect(() => {
    if (focusedCardId) {
      setIsCheckingNFC(true);
      checkNFCStatus()
        .then(setIsNFCEnabled)
        .finally(() => setIsCheckingNFC(false));
    } else {
      setIsNFCEnabled(null);
      setIsCheckingNFC(false);
    }
  }, [focusedCardId, checkNFCStatus]);

  // Card click handler
  const handleCardPress = useCallback((ticketId: string) => {
    setFocusedCardId(prev => (prev === ticketId ? null : ticketId));
    // Scroll to top when focusing
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0, animated: true });
    }
  }, []);

  const handleImportTickets = useCallback(() => {
    router.push({
      pathname: '/qr',
      params: {
        mode: 'ticket',
        source: 'tickets',
        scanType: 'qr',
        timestamp: Date.now(),
      },
    });
  }, []);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <View style={styles.headerContainer}>
          <ThemedText type="title" style={{ color: primaryTextColor }}>
            Your tickets
          </ThemedText>
          <TouchableOpacity
            style={[styles.importButton, { backgroundColor: buttonSecondaryColor }]}
            onPress={handleImportTickets}
          >
            <Upload size={20} color={buttonSecondaryTextColor} />
            <ThemedText
              type="subtitle"
              style={[styles.importButtonText, { color: buttonSecondaryTextColor }]}
            >
              Import
            </ThemedText>
          </TouchableOpacity>
        </View>
        {badMints.length > 0 && (
          <View style={[styles.mintStatusBanner, { backgroundColor: surfaceSecondaryColor }]}>
            <AlertTriangle size={20} color={Colors.warning} />
            <View style={styles.mintStatusTextContainer}>
              <ThemedText
                type="subtitle"
                style={[styles.mintStatusTitle, { color: primaryTextColor }]}
              >
                {badMints.length === 1
                  ? 'Mint unreachable'
                  : `${badMints.length} mints unreachable`}
              </ThemedText>
              <ThemedText style={[styles.mintStatusSubtitle, { color: secondaryTextColor }]}>
                Error while getting tickets from {badMints.join(', ')}. Tickets are hidden for now,
                try again later.
              </ThemedText>
            </View>
          </View>
        )}
        {/* We don't need filters for now */}
        {/* <View style={styles.filterContainer}>
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
        </View> */}
        {eCashLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={buttonPrimaryColor} />
            <ThemedText style={[styles.loadingText, { color: secondaryTextColor }]}>
              Loading tickets...
            </ThemedText>
          </View>
        ) : tickets.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: cardBackgroundColor }]}>
            <ThemedText style={[styles.emptyText, { color: secondaryTextColor }]}>
              {badMints.length > 0 ? 'No tickets available right now.' : 'No tickets found'}
            </ThemedText>
          </View>
        ) : (
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Focused card zone */}
            {focusedCardId &&
              (() => {
                const focusedTicket = tickets.find(t => t.id === focusedCardId);
                return focusedTicket ? (
                  <View>
                    <TicketCard
                      ticket={focusedTicket}
                      index={tickets.findIndex(t => t.id === focusedCardId)}
                      isFocused={true}
                      onPress={() => handleCardPress(focusedCardId)}
                    />
                    <View style={[styles.nfcSection, { backgroundColor: surfaceSecondaryColor }]}>
                      <View style={styles.nfcIconContainer}>
                        {isCheckingNFC ? (
                          <View style={styles.nfcStatusContainer}>
                            <ThemedText
                              style={[styles.nfcStatusText, { color: secondaryTextColor }]}
                            >
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
                      <ThemedText
                        type="subtitle"
                        style={[styles.nfcTitle, { color: primaryTextColor }]}
                      >
                        {isCheckingNFC
                          ? 'Checking NFC...'
                          : isNFCEnabled === null
                            ? 'Validate Ticket'
                            : isNFCEnabled
                              ? 'NFC Ready'
                              : 'NFC Required'}
                      </ThemedText>
                      <ThemedText style={[styles.nfcDescription, { color: secondaryTextColor }]}>
                        {isCheckingNFC
                          ? 'Checking if NFC is available on your device'
                          : isNFCEnabled === null
                            ? 'Hold your device near the NFC reader to validate your ticket'
                            : isNFCEnabled
                              ? 'NFC is enabled. Hold your device near the NFC reader to validate your ticket'
                              : 'NFC is disabled. Enable NFC in your device settings to validate tickets'}
                      </ThemedText>
                    </View>
                  </View>
                ) : null;
              })()}
            {/* Stacked list of all other cards */}
            <View
              style={[
                styles.cardsContainer,
                {
                  height: Math.max(
                    800,
                    tickets.filter(ticket => ticket.id !== focusedCardId).length * 130 + 100
                  ),
                },
              ]}
            >
              {tickets
                .filter(ticket => ticket.id !== focusedCardId)
                .map((ticket, visibleIndex) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    index={visibleIndex} // Use the index in the visible stack
                    isFocused={false}
                    onPress={() => handleCardPress(ticket.id)}
                  />
                ))}
            </View>
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
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  importButtonText: {
    fontSize: 14,
    fontWeight: '600',
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
    paddingTop: 16,
  },
  cardsContainer: {
    position: 'relative',
    width: '100%',
    marginTop: 16,
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
  nfcIconContainer: {
    marginBottom: 16,
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
  nfcStatusText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  mintStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 12,
    gap: 12,
    marginBottom: 16,
  },
  mintStatusTextContainer: {
    flex: 1,
  },
  mintStatusTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  mintStatusSubtitle: {
    fontSize: 12,
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
});
