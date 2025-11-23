import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useRouter } from 'expo-router';
import { ArrowLeft, ClipboardPaste, ScanQrCode, User } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, TouchableOpacity, View, TextInput, ScrollView, Image } from 'react-native';
import { Colors } from 'react-native/Libraries/NewAppScreen';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { useCallback, useEffect, useState } from 'react';
import { type Nip05Contact } from '@/services/DatabaseService';
import { SkeletonPulse } from '@/components/PendingRequestSkeletonCard';
import Clipboard from '@react-native-clipboard/clipboard';
import { showToast } from '@/utils/Toast';

interface NostrNip05Response {
  names: Record<string, string>;
  relays?: Record<string, string[]>;
}

export default function BreezWalletSelectSendMethod() {
  const router = useRouter();

  const backgroundColor = useThemeColor({}, 'background');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');
  const inputBackground = useThemeColor({}, 'inputBackground');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const inputBorderColor = useThemeColor({}, 'inputBorder');
  const skeletonBaseColor = useThemeColor({}, 'skeletonBase');

  const { executeOperation } = useDatabaseContext();

  const [contacts, setContacts] = useState<Nip05Contact[] | null>(null);
  const [filteredContacts, setFilteredContacts] = useState<Nip05Contact[]>([]);
  const [activeFilter, setActiveFilter] = useState('');

  const downloadContacts = useCallback(async() => {
    try {
      const response = await fetch('https://getportal.cc/.well-known/nostr.json');
      const remoteContacts = await response.json() as NostrNip05Response;
  
      console.log(Object.keys(remoteContacts.names))

    } catch(error) {
      console.log(error);
    }
  }, []);

  useEffect(() => {
    downloadContacts();
  }, [downloadContacts])

  const getContacts = useCallback(async () => {
    const savedContacts = await executeOperation(db => db.getNip05Contacts());

    const testContacts: Nip05Contact[] = [
      {
        id: 1,
        name: 'cecio',
        nickname: null,
        domain: 'getportal.cc',
        display_name: null,
        npub: '',
        created_at: new Date().getDate(),
        avatar_uri:
          'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fpreview.redd.it%2Fejhw6n68ng381.png%3Fauto%3Dwebp%26s%3Dedcc372d1d4190ab088b8e4b4fa801d93ad0ebeb&f=1&nofb=1&ipt=e064d47b295beb5cf5af2d55ea99c32570b6993edf7f690abc02feae7baef767',
      },
      {
        id: 2,
        name: 'berna',
        nickname: 'Berna',
        domain: 'getportal.cc',
        display_name: 'bernino',
        npub: '',
        created_at: new Date().getDate(),
        avatar_uri: '',
      },
      {
        id: 3,
        name: 'john',
        nickname: null,
        domain: 'getportal.cc',
        display_name: 'JohnGalt',
        npub: '',
        created_at: new Date().getDate(),
        avatar_uri: '',
      },
    ];

    // setContacts(testContacts);
    setContacts(savedContacts);
    // setFilteredContacts(testContacts);
    setFilteredContacts(savedContacts);
  }, [executeOperation]);

  useEffect(() => {
    if (contacts == null) return;
    const newContacts = contacts.filter(
      contact =>
        contact.name.toLowerCase().includes(activeFilter) ||
        contact.display_name?.toLowerCase().includes(activeFilter) ||
        contact.nickname?.toLowerCase().includes(activeFilter) ||
        contact.domain.toLowerCase().includes(activeFilter)
    );

    console.log(newContacts);

    setFilteredContacts(newContacts);
  }, [activeFilter, contacts]);

  useEffect(() => {
    getContacts();
  }, [getContacts]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={[styles.container, { backgroundColor }]}>
        <ThemedView style={[styles.header, { backgroundColor }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={20} color={primaryTextColor} />
          </TouchableOpacity>
          <ThemedText style={[styles.headerText, { color: primaryTextColor }]}>
            Send funds
          </ThemedText>
        </ThemedView>
        <ThemedView style={{ ...styles.content, gap: 10 }}>
          <ThemedView style={{ flex: 1 }}>
            <TextInput
              style={[
                styles.verificationInput,
                { backgroundColor: inputBackground, color: primaryTextColor, marginBottom: 16 },
              ]}
              onChangeText={text => setActiveFilter(text.toLocaleLowerCase())}
              placeholder="Search contact..."
            />

            {contacts == null ? (
              <>
                {[...Array(5).keys()].map(i => (
                  <View key={i}>
                    <ThemedView style={{ justifyContent: 'space-between', flexDirection: 'row' }}>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View
                          style={[
                            styles.avatarPlaceholder,
                            { backgroundColor: cardBackground, borderColor: inputBorderColor },
                          ]}
                        >
                          <User size={20} color={primaryTextColor} />
                        </View>

                        <View>
                          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
                            <SkeletonPulse
                              style={[
                                styles.skeletonText,
                                { backgroundColor: skeletonBaseColor, width: '40%' },
                              ]}
                            />
                            <SkeletonPulse
                              style={[
                                styles.skeletonText,
                                { backgroundColor: skeletonBaseColor, width: '30%' },
                              ]}
                            />
                          </View>
                          <SkeletonPulse
                            style={[
                              styles.skeletonText,
                              { backgroundColor: skeletonBaseColor, width: '100%' },
                            ]}
                          />
                        </View>
                      </View>
                    </ThemedView>

                    <ThemedView style={styles.sectionDivider} />
                  </View>
                ))}
              </>
            ) : filteredContacts.length === 0 ? (
              <ThemedView style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
                <ThemedText type="subtitle" style={{ color: secondaryTextColor }}>
                  No contact found
                </ThemedText>
              </ThemedView>
            ) : (
              <ThemedView style={{ flex: 1 }}>
                <ScrollView>
                  {filteredContacts.map((contact, i) => {
                    let firstLine, secondLine, fistLineSecondary;

                    if (contact.nickname != null) {
                      firstLine = contact.nickname;
                      fistLineSecondary = `(${contact.display_name})`;
                      secondLine = `${contact.name}@${contact.domain}`;
                    } else if (contact.display_name) {
                      firstLine = contact.display_name;
                      secondLine = `${contact.name}@${contact.domain}`;
                    } else {
                      firstLine = `${contact.name}@${contact.domain}`;
                      secondLine = '';
                    }

                    return (
                      <TouchableOpacity key={i} onPress={() => {}}>
                        <ThemedView
                          key={i}
                          style={{ justifyContent: 'space-between', flexDirection: 'row' }}
                        >
                          <View style={{ flexDirection: 'row', gap: 10 }}>
                            {contact.avatar_uri ? (
                              <Image
                                source={{ uri: contact.avatar_uri }}
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
              </ThemedView>
            )}
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
              <TouchableOpacity
                onPress={async () => {
                  const invoice = await Clipboard.getString();
                  if (!invoice.startsWith('lnbc')) {
                    showToast("The data in the clipboard isn't a valid invoice!", 'error');
                    return;
                  }

                  router.replace({
                    pathname: '/breezwallet/pay',
                    params: {
                      invoice,
                    },
                  });
                }}
              >
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <ClipboardPaste color={buttonPrimaryTextColor} />
                  <ThemedText style={{ fontWeight: 'bold', color: buttonPrimaryTextColor }}>
                    Paste
                  </ThemedText>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  router.push({
                    pathname: '/qr',
                    params: {
                      mode: 'lightning',
                    },
                  });
                }}
              >
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <ScanQrCode color={buttonPrimaryTextColor} />
                  <ThemedText style={{ fontWeight: 'bold', color: buttonPrimaryTextColor }}>
                    Scan QR
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
    marginBottom: 16,
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
  skeletonText: {
    height: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
});
