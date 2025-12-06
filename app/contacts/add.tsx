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
import { useDebounce } from 'use-debounce';
import { fetch } from 'expo/fetch';
import { useUserProfile } from '@/context/UserProfileContext';
import { useNostrService } from '@/context/NostrServiceContext';

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
  const { fetchProfile } = useNostrService();

  const [nostrProfile, setNostrProfile] = useState<Awaited<ReturnType<typeof fetchProfile>> | null>(
    null
  );

  const [nip05Name, setNip05Name] = useState<string | undefined>();
  const [nip05nameDebounced] = useDebounce(nip05Name, 300);

  useEffect(() => {
    const fetchNip05 = async () =>
      fetch(`https://getportal.cc/.well-known/nostr.json?name=${nip05nameDebounced}`)
        .then(response => {
          if (response.status === 404) {
            throw new Error('No profile found');
          }

          if (!response.ok) {
            throw new Error('Generic error');
          }

          return response.json();
        })
        .then(data => {
          const { names } = data;
          const npub = Object.values(names).at(0);
          if (typeof npub !== 'string') {
            throw new Error('npub is not a string');
          }
          return fetchProfile(npub);
        })
        .then(setNostrProfile);

    fetchNip05().catch(err => console.error('Failed fetching profile', err));
  }, [fetchProfile, nip05nameDebounced]);

  const saveContactToDb = useCallback(async () => {
    if (!nostrProfile) {
      throw new Error('nostrProfile must be defined');
    }

    await executeOperation(db =>
      db.saveNip05Contact({
        npub: nostrProfile.npub,
        name: nostrProfile.username ?? '',
        display_name: nostrProfile.displayName ?? null,
        avatar_uri: nostrProfile.avatarUri ?? null,
        domain: 'getportal.cc',
        nickname: null,
      })
    );
  }, [executeOperation, nostrProfile]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={[styles.container, { backgroundColor }]}>
        <ThemedView style={[styles.header, { backgroundColor }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={20} color={primaryTextColor} />
          </TouchableOpacity>
          <ThemedText style={[styles.headerText, { color: primaryTextColor }]}>
            Add contact
          </ThemedText>
        </ThemedView>
        <ThemedView style={{ ...styles.content, gap: 10 }}>
          <ThemedView style={{ flex: 1 }}>
            <TextInput
              style={[
                styles.verificationInput,
                { backgroundColor: inputBackground, color: primaryTextColor, marginBottom: 16 },
              ]}
              onChangeText={text => setNip05Name(text)}
              placeholder="Search contact..."
            />

            {nostrProfile && (
              <TouchableOpacity onPress={() => saveContactToDb()}>
                <ThemedView style={{ justifyContent: 'space-between', flexDirection: 'row' }}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {nostrProfile.avatarUri ? (
                      <Image
                        source={{ uri: nostrProfile.avatarUri }}
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
                      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
                        <ThemedText type="subtitle">
                          {nostrProfile.displayName ?? nostrProfile.username}
                        </ThemedText>
                        <ThemedText type="subtitle" style={{ color: secondaryTextColor }}>
                          {nostrProfile.username}
                        </ThemedText>
                      </View>
                      <ThemedText style={{ color: secondaryTextColor }}>
                        {nostrProfile.username}@getportal.cc
                      </ThemedText>
                    </View>
                  </View>
                  <View></View>
                </ThemedView>

                <ThemedView style={styles.sectionDivider} />
              </TouchableOpacity>
            )}
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
