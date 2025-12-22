import { useRouter } from 'expo-router';
import { ArrowLeft, Send, User } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from 'react-native/Libraries/NewAppScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDebouncedCallback } from 'use-debounce';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useCurrency } from '@/context/CurrencyContext';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { useNostrService } from '@/context/NostrServiceContext';
import { useWalletManager } from '@/context/WalletManagerContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { WALLET_TYPE } from '@/models/WalletType';
import type { BreezService } from '@/services/BreezService';
import { CurrencyConversionService } from '@/services/CurrencyConversionService';
import type { Nip05Contact } from '@/services/DatabaseService';
import type { WalletInfo } from '@/utils/types';

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

  const getContacts = useCallback(async () => {
    const savedContacts = await executeOperation(db => db.getRecentNip05Contacts(5));

    // Enrich contacts with profile data
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
      headers: {
        Accept: 'application/json',
      },
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
  const cardBackground = useThemeColor({}, 'cardBackground');
  const inputBorderColor = useThemeColor({}, 'inputBorder');
  const inputBackground = useThemeColor({}, 'inputBackground');
  const placeholderColor = useThemeColor({}, 'inputPlaceholder');

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

  useEffect(() => {
    if (breezWallet == null) return;
    setInterval(async () => {
      const info = await breezWallet.getWalletInfo();
      setWalletInfo(info);

      const converted = await CurrencyConversionService.convertAmount(
        Number(info.balanceInSats),
        'sats',
        preferredCurrency
      );
      setConvertedAmount(converted);
    }, 1000);
  }, [breezWallet, preferredCurrency]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={[styles.container, { backgroundColor }]}>
        <ThemedView style={[styles.header, { backgroundColor }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={20} color={primaryTextColor} />
          </TouchableOpacity>
          <ThemedText style={[styles.headerText, { color: primaryTextColor }]}>
            Wallet Management
          </ThemedText>
        </ThemedView>
        <ThemedView style={{ ...styles.content, gap: 10 }}>
          <ThemedView style={{ flexDirection: 'row' }}>
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
          </ThemedView>
          <View style={styles.sectionDivider} />
          <ThemedView style={{ flex: 1 }}>
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

            <ThemedView style={{ flex: 1 }}>
              {areContactsLoading ? (
                <ThemedView style={{ flex: 1, justifyContent: 'center', alignContent: 'center' }}>
                  <ActivityIndicator size="large" color={Colors.almostWhite} />
                </ThemedView>
              ) : contacts.length === 0 ? (
                <ThemedView style={{ alignItems: 'center', flex: 1, marginTop: 10 }}>
                  <ThemedText type="subtitle" style={{ color: secondaryTextColor }}>
                    No recent contacts found
                  </ThemedText>
                </ThemedView>
              ) : (
                <ScrollView style={{ flex: 1 }}>
                  {contacts?.map((contact, _i) => {
                    let firstLine: string,
                      secondLine: string,
                      fistLineSecondary: string = '';

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
                        <ThemedView
                          style={{ justifyContent: 'space-between', flexDirection: 'row' }}
                        >
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
                                  {
                                    backgroundColor: cardBackground,
                                    borderColor: inputBorderColor,
                                  },
                                ]}
                              >
                                <User size={20} color={primaryTextColor} />
                              </View>
                            )}

                            <View>
                              <View
                                style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}
                              >
                                <ThemedText type="subtitle">{firstLine}</ThemedText>
                                <ThemedText type="subtitle" style={{ color: secondaryTextColor }}>
                                  {fistLineSecondary}
                                </ThemedText>
                              </View>
                              <ThemedText style={{ color: secondaryTextColor }}>
                                {secondLine}
                              </ThemedText>
                            </View>
                          </View>
                          <View></View>
                        </ThemedView>

                        <ThemedView style={styles.sectionDivider} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </ThemedView>
          </ThemedView>
          <ThemedView style={{ flexDirection: 'row', justifyContent: 'center' }}>
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
                    params: {
                      mode: 'lightning',
                    },
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
        </ThemedView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    // backgroundColor handled by theme
  },
  container: {
    flex: 1,
    // backgroundColor handled by theme
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    // backgroundColor handled by theme
  },
  backButton: {
    marginRight: 15,
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  description: {
    // color handled by theme
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  walletUrlCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    // backgroundColor handled by theme
  },
  walletUrlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  walletUrlLabel: {
    fontSize: 16,
    fontWeight: '600',
    // color handled by theme
  },
  walletUrlInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  walletUrlInput: {
    flex: 1,
    // color and backgroundColor handled by theme
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
    textAlignVertical: 'top',
    minHeight: 44,
    maxHeight: 200,
  },
  walletUrlAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    // backgroundColor handled by theme
  },
  walletUrlActions: {
    flexDirection: 'column',
    gap: 8,
  },
  deleteButton: {
    marginTop: 4,
  },
  qrCodeButton: {
    // backgroundColor handled by theme
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusContainer: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 16,
    color: Colors.almostWhite,
  },
  walletStatusContainer: {
    // backgroundColor handled by theme
    borderRadius: 20,
    padding: 16,
    marginTop: 16,
    minHeight: 80,
  },
  walletStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  walletStatusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  connectionStatusSection: {
    marginBottom: 0,
  },
  connectionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  connectionStatusIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    // backgroundColor handled by theme
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  loadingSpinner: {
    // Could add rotation animation here if needed
  },
  connectionStatusContent: {
    flex: 1,
  },
  connectionStatusHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  connectionStatusLabel: {
    fontSize: 14,
    color: Colors.dirtyWhite,
  },
  connectionStatusValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  connectionStatusError: {
    fontSize: 13,
    color: '#FF4444',
    fontStyle: 'italic',
  },
  connectionStatusDescription: {
    fontSize: 13,
    color: Colors.gray,
    fontStyle: 'italic',
  },
  walletInfoSection: {
    marginTop: 8,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginTop: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  refreshButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  refreshButtonText: {
    fontSize: 18,
    marginTop: -2,
    fontWeight: 'bold',
  },

  walletInfoLoading: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  walletInfoError: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  walletInfoPlaceholder: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  walletInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  walletInfoItem: {
    flex: 1,
  },
  walletInfoItemWithLabels: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  walletInfoField: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  walletInfoFieldLabel: {
    fontSize: 14,
    color: Colors.dirtyWhite,
    marginRight: 6,
  },
  walletInfoFieldValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  walletInfoLabel: {
    fontSize: 14,
    color: Colors.dirtyWhite,
    marginBottom: 4,
  },
  walletInfoValue: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  walletInfoSubtext: {
    fontSize: 13,
    color: Colors.gray,
    fontStyle: 'italic',
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
  skeletonText: {
    height: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  verificationInput: {
    width: '100%',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    marginBottom: 10,
  },
});
