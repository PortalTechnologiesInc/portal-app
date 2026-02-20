import { canOpenURL, openSettings, openURL } from 'expo-linking';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  AlertTriangle,
  CheckCircle,
  Nfc,
  Send,
  Upload,
  User,
  XCircle,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from 'react-native/Libraries/NewAppScreen';
import NfcManager from 'react-native-nfc-manager';
import { SafeAreaView } from 'react-native-safe-area-context';
import uuid from 'react-native-uuid';
import { useDebouncedCallback } from 'use-debounce';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import TicketCard from '@/components/TicketCard';
import { Colors as AppColors } from '@/constants/Colors';
import { useCurrency } from '@/context/CurrencyContext';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { useECash } from '@/context/ECashContext';
import { useNostrService } from '@/context/NostrServiceContext';
import { useWalletManager } from '@/context/WalletManagerContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { WALLET_TYPE } from '@/models/WalletType';
import type { BreezService } from '@/services/BreezService';
import { CurrencyConversionService } from '@/services/CurrencyConversionService';
import type { Nip05Contact } from '@/services/DatabaseService';
import { globalEvents } from '@/utils/common';
import type { Ticket, WalletInfo } from '@/utils/types';

interface ContactWithProfile extends Nip05Contact {
  displayName?: string | null;
  avatarUri?: string | null;
  username?: string;
}

export default function MyWalletManagementSecret() {
  const router = useRouter();

  const { executeOperation } = useDatabaseContext();
  const { preferredCurrency, getCurrentCurrencySymbol } = useCurrency();

  const { isWalletManagerInitialized, getWallet } = useWalletManager();
  const [breezWallet, setBreezWallet] = useState<BreezService | null>(null);
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [contacts, setContacts] = useState<ContactWithProfile[]>([]);
  const [areContactsLoading, setAreContactsLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('');

  const { fetchProfile, isInitialized } = useNostrService();

  // ── Tickets state ──────────────────────────────────────────────────────────
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [isNFCEnabled, setIsNFCEnabled] = useState<boolean | null>(null);
  const [isCheckingNFC, setIsCheckingNFC] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [mintStatuses, setMintStatuses] = useState<Record<string, 'good' | 'bad'>>({});
  const ticketsScrollRef = useRef<ScrollView>(null);
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: wallets and _walletUpdateTrigger are the only dependencies needed. State setters are stable.
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
            for (let i = 0; i < balance; i++) {
              allTickets.push({
                id: uuid.v4(),
                title: unitInfo?.title || wallet.unit(),
                description: unitInfo?.description,
                isNonFungible: unitInfo?.showIndividually || false,
                mintUrl,
                balance: BigInt(1),
                frontCardBackground: unitInfo?.frontCardBackground,
                backCardBackground: unitInfo?.backCardBackground,
                location:
                  unitInfo?.kind?.tag === 'Event' ? unitInfo.kind.inner.location : undefined,
                date: unitInfo?.kind?.tag === 'Event' ? unitInfo.kind.inner.date : undefined,
                kind: unitInfo?.kind?.tag || 'Other',
              });
            }
          } else if (balance > 0) {
            allTickets.push({
              id: uuid.v4(),
              title: unitInfo?.title || wallet.unit(),
              description: unitInfo?.description,
              isNonFungible: unitInfo?.showIndividually || false,
              mintUrl,
              balance,
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
  }, [wallets, _walletUpdateTrigger]);

  // NFC helpers
  const checkNFCStatus = useCallback(async (): Promise<boolean> => {
    try {
      const isStarted = await NfcManager.isSupported();
      if (!isStarted) return false;
      return await NfcManager.isEnabled();
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

  // When a ticket card is focused, check NFC status
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

  const handleCardPress = useCallback((ticketId: string) => {
    setFocusedCardId(prev => (prev === ticketId ? null : ticketId));
    if (ticketsScrollRef.current) {
      ticketsScrollRef.current.scrollToEnd({ animated: true });
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
  }, [router]);

  const badMints = useMemo(
    () =>
      Object.entries(mintStatuses)
        .filter(([, status]) => status === 'bad')
        .map(([mintUrl]) => mintUrl),
    [mintStatuses]
  );
  // ── End tickets state ──────────────────────────────────────────────────────

  const getContacts = useCallback(async () => {
    const savedContacts = await executeOperation(db => db.getRecentNip05Contacts(5));

    const enrichedContacts: ContactWithProfile[] = [];
    for (const contact of savedContacts) {
      const enriched: ContactWithProfile = {
        displayName: null,
        avatarUri: null,
        username: undefined,
        ...contact,
      };
      try {
        const fullProfile = await fetchProfile(contact.npub);
        enriched.displayName = fullProfile.displayName ?? null;
        enriched.avatarUri = fullProfile.avatarUri ?? null;
        enriched.username = fullProfile.username;
      } catch (_error) {}
      enrichedContacts.push(enriched);
    }
    setContacts(enrichedContacts);
  }, [executeOperation, fetchProfile]);

  useEffect(() => {
    if (isInitialized) {
      getContacts();
    }
  }, [getContacts, isInitialized]);

  type Nip05Contacts = Record<string, string>;
  const fetchNip05Contacts = async () => {
    const url = `https://getportal.cc/.well-known/nostr.json`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();
    if (data.names && typeof data.names === 'object') {
      return data.names as Nip05Contacts;
    }
    if (typeof data === 'object') {
      return data as Nip05Contacts;
    }
    throw new Error('Unexpected NIP05 response format');
  };

  const debouncedSearch = useDebouncedCallback(async (filter: string) => {
    setAreContactsLoading(true);
    try {
      if (!filter.trim()) {
        if (isInitialized) {
          await getContacts();
        }
        return;
      }

      const contacts = await fetchNip05Contacts();
      const filteredUsernames = Object.keys(contacts)
        .filter(username => username.includes(filter))
        .slice(0, 20);

      const contactsToShow: ContactWithProfile[] = [];
      for (const filteredUsername of filteredUsernames) {
        const fullProfile = await fetchProfile(contacts[filteredUsername]);
        contactsToShow.push({
          id: 0,
          npub: fullProfile.npub,
          created_at: Math.floor(Date.now() / 1000),
          avatarUri: fullProfile.avatarUri ?? null,
          displayName: fullProfile.displayName ?? null,
          username: filteredUsername,
        });
      }

      setContacts(contactsToShow);
    } catch (_error) {
    } finally {
      setAreContactsLoading(false);
    }
  }, 400);

  useEffect(() => {
    debouncedSearch(activeFilter);
  }, [activeFilter, debouncedSearch]);

  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  const [convertedAmount, setConvertedAmount] = useState(0);
  const [reverseCurrency, setReverseCurrency] = useState(false);

  const backgroundColor = useThemeColor({}, 'background');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');
  const buttonSecondaryColor = useThemeColor({}, 'buttonSecondary');
  const buttonSecondaryTextColor = useThemeColor({}, 'buttonSecondaryText');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const inputBorderColor = useThemeColor({}, 'inputBorder');
  const inputBackground = useThemeColor({}, 'inputBackground');
  const placeholderColor = useThemeColor({}, 'inputPlaceholder');
  const surfaceSecondaryColor = useThemeColor({}, 'surfaceSecondary');

  useEffect(() => {
    let active = true;

    if (isWalletManagerInitialized) {
      getWallet(WALLET_TYPE.BREEZ)
        .then(wallet => {
          if (active) setBreezWallet(wallet);
        })
        .catch(_error => {});
    }

    return () => {
      active = false;
    };
  }, [getWallet, isWalletManagerInitialized]);

  useFocusEffect(
    useCallback(() => {
      if (breezWallet == null) return;

      const id = setInterval(async () => {
        const info = await breezWallet.getWalletInfo();
        setWalletInfo(info);

        const converted = await CurrencyConversionService.convertAmount(
          Number(info.balanceInSats),
          'sats',
          preferredCurrency
        );

        setConvertedAmount(converted);
      }, 1000);
      return () => clearInterval(id);
    }, [breezWallet, preferredCurrency])
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={[styles.container, { backgroundColor }]}>
        {/* ── Page header ── */}
        <ThemedView style={[styles.header, { backgroundColor }]}>
          <ThemedText type="title" style={{ color: primaryTextColor }}>
            Your Wallet
          </ThemedText>
        </ThemedView>

        {/* ── Single scrollable body ── */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Balance */}
          <TouchableOpacity onPress={() => setReverseCurrency(curr => !curr)}>
            <View>
              <ThemedText type="subtitle" style={{ color: primaryTextColor }}>
                Balance
              </ThemedText>
              <ThemedText type="title" style={{ color: primaryTextColor }}>
                {reverseCurrency ? convertedAmount.toFixed(2) : (walletInfo?.balanceInSats ?? 0)}{' '}
                {reverseCurrency ? getCurrentCurrencySymbol() : 'sats'}
              </ThemedText>
            </View>
          </TouchableOpacity>

          <View style={styles.sectionDivider} />

          {/* Recent contacts */}
          <ThemedView>
            <ThemedText type="subtitle">Recent contacts</ThemedText>
          </ThemedView>

          <ThemedView style={{ marginTop: 15 }}>
            <TextInput
              style={[
                styles.verificationInput,
                { backgroundColor: inputBackground, color: primaryTextColor, marginBottom: 16 },
              ]}
              onChangeText={text => setActiveFilter(text.toLocaleLowerCase())}
              placeholder="Search contact..."
              placeholderTextColor={placeholderColor}
            />
          </ThemedView>

          {areContactsLoading ? (
            <ThemedView style={{ justifyContent: 'center', alignItems: 'center', paddingVertical: 20 }}>
              <ActivityIndicator size="large" color={Colors.almostWhite} />
            </ThemedView>
          ) : contacts.length === 0 ? (
            <ThemedView style={{ alignItems: 'center', marginTop: 10, marginBottom: 10 }}>
              <ThemedText type="subtitle" style={{ color: secondaryTextColor }}>
                No recent contacts found
              </ThemedText>
            </ThemedView>
          ) : (
            <ThemedView>
              {contacts?.map(contact => {
                let firstLine: string;
                let secondLine: string;
                let fistLineSecondary = '';

                if (contact.displayName) {
                  firstLine = contact.displayName;
                  secondLine = contact.username ?? '';
                } else {
                  firstLine = contact.username ?? contact.npub;
                  secondLine = '';
                }

                return (
                  <TouchableOpacity
                    key={contact.npub}
                    onPress={() => {
                      router.push(`/breezwallet/receive?npub=${contact.npub}`);
                    }}
                  >
                    <ThemedView style={{ justifyContent: 'space-between', flexDirection: 'row' }}>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        {contact.avatarUri ? (
                          <Image
                            source={{ uri: contact.avatarUri }}
                            style={[styles.avatar, { borderColor: inputBorderColor }]}
                          />
                        ) : (
                          <View
                            style={[
                              styles.avatarPlaceholder,
                              { backgroundColor: cardBackground, borderColor: inputBorderColor },
                            ]}
                          >
                            <User size={20} color={primaryTextColor} />
                          </View>
                        )}
                        <View>
                          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
                            <ThemedText type="subtitle">{firstLine}</ThemedText>
                            <ThemedText type="subtitle" style={{ color: secondaryTextColor }}>
                              {fistLineSecondary}
                            </ThemedText>
                          </View>
                          <ThemedText style={{ color: secondaryTextColor }}>{secondLine}</ThemedText>
                        </View>
                      </View>
                      <View />
                    </ThemedView>
                    <ThemedView style={styles.sectionDivider} />
                  </TouchableOpacity>
                );
              })}
            </ThemedView>
          )}

          {/* Send / Receive buttons */}
          <ThemedView style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 16 }}>
            <ThemedView
              style={{
                flexDirection: 'row',
                gap: 40,
                backgroundColor: buttonPrimaryColor,
                borderRadius: 25,
                paddingTop: 10,
                paddingBottom: 10,
                paddingLeft: 30,
                paddingRight: 30,
              }}
            >
              <TouchableOpacity onPress={() => router.push('/breezwallet/receive')}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Send
                    color={buttonPrimaryTextColor}
                    style={{ transform: [{ rotateX: '180deg' }] }}
                  />
                  <ThemedText style={{ fontWeight: 'bold', color: buttonPrimaryTextColor }}>
                    Receive
                  </ThemedText>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/qr',
                    params: { mode: 'lightning' },
                  })
                }
              >
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Send color={buttonPrimaryTextColor} />
                  <ThemedText style={{ fontWeight: 'bold', color: buttonPrimaryTextColor }}>
                    Send
                  </ThemedText>
                </View>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>

          {/* ── Your Tickets section ── */}
          <View style={styles.sectionDivider} />

          <View style={styles.ticketsSectionHeader}>
            <ThemedText type="subtitle" style={{ color: primaryTextColor }}>
              Your Tickets
            </ThemedText>
            <TouchableOpacity
              style={[styles.importButton, { backgroundColor: buttonSecondaryColor }]}
              onPress={handleImportTickets}
            >
              <Upload size={18} color={buttonSecondaryTextColor} />
              <ThemedText
                type="subtitle"
                style={[styles.importButtonText, { color: buttonSecondaryTextColor }]}
              >
                Import
              </ThemedText>
            </TouchableOpacity>
          </View>

          {/* Unreachable mints warning */}
          {badMints.length > 0 && (
            <View style={[styles.mintStatusBanner, { backgroundColor: surfaceSecondaryColor }]}>
              <AlertTriangle size={20} color={AppColors.warning} />
              <View style={styles.mintStatusTextContainer}>
                <ThemedText
                  type="subtitle"
                  style={[styles.mintStatusTitle, { color: primaryTextColor }]}
                >
                  {badMints.length === 1 ? 'Mint unreachable' : `${badMints.length} mints unreachable`}
                </ThemedText>
                <ThemedText style={[styles.mintStatusSubtitle, { color: secondaryTextColor }]}>
                  Error while getting tickets from {badMints.join(', ')}. Tickets are hidden for now,
                  try again later.
                </ThemedText>
              </View>
            </View>
          )}

          {/* Tickets list */}
          {eCashLoading ? (
            <View style={styles.ticketsLoadingContainer}>
              <ActivityIndicator size="large" color={buttonPrimaryColor} />
              <ThemedText style={[styles.loadingText, { color: secondaryTextColor }]}>
                Loading tickets...
              </ThemedText>
            </View>
          ) : tickets.length === 0 ? (
            <View style={[styles.emptyContainer, { backgroundColor: cardBackground }]}>
              <ThemedText style={[styles.emptyText, { color: secondaryTextColor }]}>
                {badMints.length > 0 ? 'No tickets available right now.' : 'No tickets found'}
              </ThemedText>
            </View>
          ) : (
            <View>
              {/* Focused card + NFC zone */}
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
                            <CheckCircle size={48} color={AppColors.success} />
                          ) : (
                            <XCircle size={48} color={AppColors.error} />
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

              {/* Stacked list of remaining cards */}
              <View
                style={[
                  styles.cardsContainer,
                  {
                    height: Math.max(
                      400,
                      tickets.filter(t => t.id !== focusedCardId).length * 130 + 100
                    ),
                  },
                ]}
              >
                {tickets
                  .filter(t => t.id !== focusedCardId)
                  .map((ticket, visibleIndex) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      index={visibleIndex}
                      isFocused={false}
                      onPress={() => handleCardPress(ticket.id)}
                    />
                  ))}
              </View>
            </View>
          )}
        </ScrollView>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginTop: 16,
    marginBottom: 12,
  },
  verificationInput: {
    width: '100%',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    marginBottom: 10,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 50,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 50,
    borderWidth: 2,
  },
  // ── Tickets ──────────────────────────────────────────────────────────────
  ticketsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  importButtonText: {
    fontSize: 13,
    fontWeight: '600',
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
  ticketsLoadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  emptyContainer: {
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  cardsContainer: {
    position: 'relative',
    width: '100%',
    marginTop: 16,
  },
  nfcSection: {
    marginTop: 0,
    marginBottom: 16,
    padding: 16,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
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
});
