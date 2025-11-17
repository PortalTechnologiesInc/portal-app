import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Copy } from 'lucide-react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useRouter } from 'expo-router';

import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useNostrService } from '@/context/NostrServiceContext';
import { useDatabaseContext } from '@/context/DatabaseContext';
import defaultRelayList from '@/assets/DefaultRelays.json';
import { keyToHex } from 'portal-app-lib';
import { showToast } from '@/utils/Toast';

type RemoteSigningTab = 'bunker' | 'nostrconnect';

type ParsedNostrConnect = {
  clientPubkey: string;
  relays: string[];
  secret: string;
  permissions: string[];
  name?: string;
};

const RemoteSigningScreen = () => {
  const router = useRouter();
  const { executeOperation } = useDatabaseContext();
  const nostrService = useNostrService();

  const [remoteSigningTab, setRemoteSigningTab] = useState<RemoteSigningTab>('bunker');
  const [remoteSecret, setRemoteSecret] = useState('');
  const [remoteRelays, setRemoteRelays] = useState<string[]>(defaultRelayList);
  const [nostrConnectInput, setNostrConnectInput] = useState('');
  const [nostrConnectDetails, setNostrConnectDetails] = useState<ParsedNostrConnect | null>(null);
  const [nostrConnectError, setNostrConnectError] = useState<string | null>(null);

  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const inputBorderColor = useThemeColor({}, 'inputBorder');
  const surfaceSecondaryColor = useThemeColor({}, 'surfaceSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');
  const statusErrorColor = useThemeColor({}, 'statusError');

  const remoteSignerPubkey = useMemo(() => {
    if (!nostrService.publicKey) {
      return '';
    }

    try {
      return keyToHex(nostrService.publicKey);
    } catch (error) {
      try {
        return nostrService.publicKey.toString();
      } catch (innerError) {
        console.warn('Failed to format remote signer pubkey:', innerError);
        return typeof nostrService.publicKey === 'string' ? nostrService.publicKey : '';
      }
    }
  }, [nostrService.publicKey]);

  const bunkerUri = useMemo(() => {
    if (!remoteSignerPubkey || remoteRelays.length === 0) {
      return '';
    }

    const params = new URLSearchParams();

    remoteRelays.forEach(relay => {
      if (relay?.trim()) {
        params.append('relay', relay.trim());
      }
    });

    if (!params.toString()) {
      return '';
    }

    if (remoteSecret.trim()) {
      params.append('secret', remoteSecret.trim());
    }

    return `bunker://${remoteSignerPubkey}?${params.toString()}`;
  }, [remoteSignerPubkey, remoteRelays, remoteSecret]);

  useEffect(() => {
    let isMounted = true;

    const loadRemoteRelays = async () => {
      try {
        const storedRelays = await executeOperation(db => db.getRelays(), []);
        if (!isMounted) {
          return;
        }
        if (storedRelays.length > 0) {
          setRemoteRelays(storedRelays.map(relay => relay.ws_uri));
        } else {
          setRemoteRelays(defaultRelayList);
        }
      } catch (error) {
        console.error('Failed to load relays for remote signing:', error);
        if (isMounted) {
          setRemoteRelays(defaultRelayList);
        }
      }
    };

    loadRemoteRelays();

    return () => {
      isMounted = false;
    };
  }, [executeOperation]);

  const handleCopyBunkerUri = () => {
    if (!bunkerUri) {
      showToast('No remote signing URI available', 'error');
      return;
    }
    Clipboard.setString(bunkerUri);
    showToast('Remote signing URI copied', 'success');
  };

  const handleParseNostrConnect = () => {
    if (!nostrConnectInput.trim()) {
      setNostrConnectError('Connection string cannot be empty');
      setNostrConnectDetails(null);
      return;
    }

    try {
      const trimmed = nostrConnectInput.trim();
      const url = new URL(trimmed);

      if (url.protocol !== 'nostrconnect:') {
        throw new Error('URL must start with nostrconnect://');
      }

      const clientPubkey = url.host || url.pathname.replace('//', '');
      if (!clientPubkey) {
        throw new Error('Missing client public key');
      }

      const secret = url.searchParams.get('secret');
      if (!secret) {
        throw new Error('Secret parameter is required');
      }

      const relays = url.searchParams
        .getAll('relay')
        .map(entry => decodeURIComponent(entry))
        .filter(Boolean);

      if (relays.length === 0) {
        throw new Error('At least one relay must be provided');
      }

      const permissionsParam = url.searchParams.get('perms') || '';
      const permissions = permissionsParam
        .split(',')
        .map(value => decodeURIComponent(value.trim()))
        .filter(Boolean);

      const parsedDetails: ParsedNostrConnect = {
        clientPubkey,
        relays,
        secret,
        permissions,
        name: url.searchParams.get('name') || undefined,
      };

      setNostrConnectDetails(parsedDetails);
      setNostrConnectError(null);
      showToast('Connection request parsed', 'success');
      // TODO: emit actual connect response event once signer transport is available
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Invalid nostrconnect connection string';
      setNostrConnectError(message);
      setNostrConnectDetails(null);
      showToast(message, 'error');
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={20} color={primaryTextColor} />
          </TouchableOpacity>
          <ThemedText style={[styles.headerText, { color: primaryTextColor }]}>
            Remote signing
          </ThemedText>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          bounces={false}
        >
          <ThemedText style={[styles.sectionLead, { color: secondaryTextColor }]}>
            Share bunker URIs with clients or process nostrconnect pairing requests securely.
          </ThemedText>

          <ThemedView style={[styles.remoteCard, { backgroundColor: cardBackgroundColor }]}>
            <View style={[styles.remoteTabs, { backgroundColor: surfaceSecondaryColor }]}>
              {(['bunker', 'nostrconnect'] as RemoteSigningTab[]).map(tab => {
                const isActive = remoteSigningTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    style={[
                      styles.remoteTab,
                      isActive && { backgroundColor: buttonPrimaryColor },
                    ]}
                    onPress={() => setRemoteSigningTab(tab)}
                    activeOpacity={0.75}
                  >
                    <ThemedText
                      style={[
                        styles.remoteTabText,
                        { color: isActive ? buttonPrimaryTextColor : secondaryTextColor },
                      ]}
                    >
                      {tab === 'bunker' ? 'Bunker URL' : 'NostrConnect'}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>

            {remoteSigningTab === 'bunker' ? (
              <View>
                <ThemedText style={[styles.remoteDescription, { color: secondaryTextColor }]}>
                  Use bunker URIs to expose your signer via relays you trust. Secrets are optional
                  but recommended to prevent connection spoofing.
                </ThemedText>

                <View style={styles.secretLabelRow}>
                  <ThemedText style={[styles.secretLabel, { color: primaryTextColor }]}>
                    Secret (optional)
                  </ThemedText>
                  <ThemedText style={[styles.secretHint, { color: secondaryTextColor }]}>
                    Shared with the client to authenticate requests
                  </ThemedText>
                </View>
                <TextInput
                  value={remoteSecret}
                  onChangeText={setRemoteSecret}
                  placeholder="Set a shared secret for bunker connections"
                  placeholderTextColor={secondaryTextColor}
                  autoCapitalize="none"
                  style={[
                    styles.secretInput,
                    {
                      borderColor: inputBorderColor,
                      backgroundColor: surfaceSecondaryColor,
                      color: primaryTextColor,
                    },
                  ]}
                />

                <ThemedText style={[styles.relayLabel, { color: secondaryTextColor }]}>
                  Active relays
                </ThemedText>
                <View style={styles.relayChipContainer}>
                  {remoteRelays.map(relay => (
                    <View
                      key={relay}
                      style={[styles.relayChip, { backgroundColor: surfaceSecondaryColor }]}
                    >
                      <ThemedText style={[styles.relayChipText, { color: primaryTextColor }]}>
                        {relay}
                      </ThemedText>
                    </View>
                  ))}
                </View>

                <View
                  style={[
                    styles.connectionStringBox,
                    {
                      borderColor: inputBorderColor,
                      backgroundColor: surfaceSecondaryColor,
                    },
                  ]}
                >
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                    <ThemedText
                      style={[styles.connectionStringText, { color: primaryTextColor }]}
                      selectable
                    >
                      {bunkerUri || 'Add at least one relay to generate a bunker URI'}
                    </ThemedText>
                  </ScrollView>
                  <TouchableOpacity
                    onPress={handleCopyBunkerUri}
                    style={styles.copyButton}
                    activeOpacity={0.7}
                  >
                    <Copy size={16} color={buttonPrimaryColor} />
                    <ThemedText style={[styles.copyButtonText, { color: buttonPrimaryColor }]}>
                      Copy
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View>
                <ThemedText style={[styles.remoteDescription, { color: secondaryTextColor }]}>
                  Paste the nostrconnect URI provided by the client. The signer validates relays,
                  permissions, and secrets before responding.
                </ThemedText>
                <TextInput
                  value={nostrConnectInput}
                  onChangeText={text => {
                    setNostrConnectInput(text);
                    setNostrConnectError(null);
                    setNostrConnectDetails(null);
                  }}
                  placeholder="nostrconnect://<client npub>?relay=wss%3A%2F%2Frelay.example&secret=..."
                  placeholderTextColor={secondaryTextColor}
                  autoCapitalize="none"
                  multiline
                  style={[
                    styles.nostrConnectInput,
                    {
                      borderColor: inputBorderColor,
                      backgroundColor: surfaceSecondaryColor,
                      color: primaryTextColor,
                    },
                  ]}
                />
                <TouchableOpacity
                  onPress={handleParseNostrConnect}
                  style={[styles.nostrConnectAction, { backgroundColor: buttonPrimaryColor }]}
                  activeOpacity={0.8}
                >
                  <ThemedText
                    style={[styles.nostrConnectActionText, { color: buttonPrimaryTextColor }]}
                  >
                    Send connect response
                  </ThemedText>
                </TouchableOpacity>
                {nostrConnectError && (
                  <ThemedText style={[styles.nostrConnectError, { color: statusErrorColor }]}>
                    {nostrConnectError}
                  </ThemedText>
                )}
                {nostrConnectDetails && (
                  <View style={styles.nostrConnectMeta}>
                    <View style={styles.nostrConnectMetaRow}>
                      <ThemedText style={[styles.nostrConnectMetaLabel, { color: secondaryTextColor }]}>
                        Client pubkey
                      </ThemedText>
                      <ThemedText style={[styles.nostrConnectMetaValue, { color: primaryTextColor }]}>
                        {nostrConnectDetails.clientPubkey}
                      </ThemedText>
                    </View>
                    <View style={styles.nostrConnectMetaRow}>
                      <ThemedText style={[styles.nostrConnectMetaLabel, { color: secondaryTextColor }]}>
                        Secret
                      </ThemedText>
                      <ThemedText style={[styles.nostrConnectMetaValue, { color: primaryTextColor }]}>
                        {nostrConnectDetails.secret}
                      </ThemedText>
                    </View>
                    <View style={styles.nostrConnectMetaRow}>
                      <ThemedText style={[styles.nostrConnectMetaLabel, { color: secondaryTextColor }]}>
                        Relays
                      </ThemedText>
                    </View>
                    <View style={styles.relayChipContainer}>
                      {nostrConnectDetails.relays.map(relay => (
                        <View
                          key={relay}
                          style={[styles.relayChip, { backgroundColor: surfaceSecondaryColor }]}
                        >
                          <ThemedText style={[styles.relayChipText, { color: primaryTextColor }]}>
                            {relay}
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                    {nostrConnectDetails.permissions.length > 0 && (
                      <View style={styles.nostrConnectMetaRow}>
                        <ThemedText
                          style={[styles.nostrConnectMetaLabel, { color: secondaryTextColor }]}
                        >
                          Requested permissions
                        </ThemedText>
                        <ThemedText style={[styles.nostrConnectMetaValue, { color: primaryTextColor }]}>
                          {nostrConnectDetails.permissions.join(', ')}
                        </ThemedText>
                      </View>
                    )}
                    {nostrConnectDetails.name && (
                      <View style={styles.nostrConnectMetaRow}>
                        <ThemedText
                          style={[styles.nostrConnectMetaLabel, { color: secondaryTextColor }]}
                        >
                          Client name
                        </ThemedText>
                        <ThemedText style={[styles.nostrConnectMetaValue, { color: primaryTextColor }]}>
                          {nostrConnectDetails.name}
                        </ThemedText>
                      </View>
                    )}
                  </View>
                )}
                <ThemedText style={[styles.remoteHint, { color: secondaryTextColor }]}>
                  The connect response is broadcast to the provided relays. Clients must validate the
                  returned secret to reject spoofed connections.
                </ThemedText>
              </View>
            )}
          </ThemedView>
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
};

export default RemoteSigningScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
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
  },
  contentContainer: {
    paddingBottom: 40,
    paddingTop: 10,
  },
  sectionLead: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  remoteCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  remoteTabs: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 999,
    marginBottom: 16,
  },
  remoteTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remoteTabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  remoteDescription: {
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  secretLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  secretLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  secretHint: {
    fontSize: 12,
  },
  secretInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    marginBottom: 12,
  },
  relayLabel: {
    fontSize: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  relayChipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  relayChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8,
  },
  relayChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  connectionStringBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  connectionStringText: {
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  copyButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  nostrConnectInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  nostrConnectAction: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  nostrConnectActionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  nostrConnectError: {
    fontSize: 13,
    marginBottom: 8,
  },
  nostrConnectMeta: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    borderColor: 'rgba(0,0,0,0.1)',
    marginTop: 4,
    marginBottom: 8,
  },
  nostrConnectMetaRow: {
    marginBottom: 10,
  },
  nostrConnectMetaLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  nostrConnectMetaValue: {
    fontSize: 13,
    lineHeight: 18,
  },
  remoteHint: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
});

