import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCircle, ArrowLeft, Copy, Lock } from 'lucide-react-native';

import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { router, useFocusEffect } from 'expo-router';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { useNostrService } from '@/context/NostrServiceContext';
import { keyToHex } from 'portal-app-lib';
import uuid from 'react-native-uuid';
import { showToast } from '@/utils/Toast';
import Clipboard from '@react-native-clipboard/clipboard';
import { AllowedBunkerClientWithDates } from '@/services/DatabaseService';
import { formatRelativeTime } from '@/utils/common';

const RemoteSigningScreen = () => {
  const { executeOperation } = useDatabaseContext();
  const nostrService = useNostrService();

  const backgroundColor = useThemeColor({}, 'background');
  const surfaceColor = useThemeColor({}, 'surfaceSecondary');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textPrimary = useThemeColor({}, 'textPrimary');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const surfaceSecondary = useThemeColor({}, 'surfaceSecondary');
  const inputBorder = useThemeColor({}, 'inputBorder');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryText = useThemeColor({}, 'buttonPrimaryText');
  const statusError = useThemeColor({}, 'statusError');
  const [bunkerSecret, setBunkerSecret] = useState<string>('');
  const [remoteRelays, setRemoteRelays] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connections, setConnections] = useState<AllowedBunkerClientWithDates[]>([]);

  const remoteSignerPubkey = useMemo(() => {
    if (!nostrService.publicKey) {
      return '';
    }

    try {
      return keyToHex(nostrService.publicKey);
    } catch (e) {
      console.warn('Failed to format remote signer pubkey:', e);
      return '';
    }
  }, [nostrService.publicKey]);

  const bunkerUri = useMemo(() => {
    if (!remoteSignerPubkey || !remoteRelays || remoteRelays.length === 0 || !bunkerSecret) {
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

    params.append('secret', bunkerSecret);

    return `bunker://${remoteSignerPubkey}?${params.toString()}`;
  }, [remoteSignerPubkey, remoteRelays, bunkerSecret]);

  const loadConnections = useCallback(async () => {
    try {
      const allowedClients = await executeOperation(db => db.getAllowedBunkerClients(), []);
      setConnections(allowedClients);
    } catch (err) {
      console.error('Failed to load bunker connections:', err);
    }
  }, [executeOperation]);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const unusedSecret = await executeOperation(db => db.getUnusedSecretOrNull());

        if (unusedSecret) {
          setBunkerSecret(unusedSecret);
        } else {
          // Generate UUID secret
          const newSecret = uuid.v4() as string;
          const _ = await executeOperation(db => db.addBunkerSecret(newSecret));
          setBunkerSecret(newSecret);
        }

        // Load relays
        const storedRelays = await executeOperation(db => db.getRelays(), []);
        if (storedRelays.length === 0) {
          throw new Error('No relays configured. Please add relays in settings first.');
        }
        setRemoteRelays(storedRelays.map(relay => relay.ws_uri));

        // Load connections
        await loadConnections();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load bunker configuration';
        console.error('Failed to fetch data for bunker URL:', err);
        setError(`Unable to initialize remote signing: ${message}. Please try again.`);
        setRemoteRelays([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [executeOperation, loadConnections]);

  // Reload connections when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadConnections();
    }, [loadConnections])
  );

  const handleCopyBunkerUri = () => {
    if (!bunkerUri) {
      showToast('Bunker URI not ready yet', 'error');
      return;
    }
    Clipboard.setString(bunkerUri);
    showToast('Bunker URI copied', 'success');
  };

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    // Trigger reload by calling the effect again
    const loadRelaysAndGenerateSecret = async () => {
      try {
        const secret = uuid.v4() as string;
        setBunkerSecret(secret);
        const storedRelays = await executeOperation(db => db.getRelays(), []);
        if (storedRelays.length === 0) {
          throw new Error('No relays configured. Please add relays in settings first.');
        }
        setRemoteRelays(storedRelays.map(relay => relay.ws_uri));
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load configuration';
        setError(`Unable to initialize: ${message}. Please try again.`);
        setRemoteRelays([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadRelaysAndGenerateSecret();
  };

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
        <ThemedView style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={20} color={textPrimary} />
          </TouchableOpacity>
          <ThemedText style={[styles.headerText, { color: textPrimary }]}>
            Remote Signing
          </ThemedText>
        </ThemedView>
        <View style={styles.errorContainer}>
          <View style={[styles.errorCard, { backgroundColor: cardBackground }]}>
            <AlertCircle size={48} color={statusError} style={styles.errorIcon} />
            <ThemedText style={[styles.errorTitle, { color: textPrimary }]}>
              Something went wrong
            </ThemedText>
            <ThemedText style={[styles.errorMessage, { color: textSecondary }]}>
              {error}
            </ThemedText>
            <View style={styles.errorButtons}>
              <TouchableOpacity
                style={[styles.errorButton, styles.errorButtonSecondary, { borderColor: inputBorder }]}
                onPress={() => router.back()}
                activeOpacity={0.8}
              >
                <ThemedText style={[styles.errorButtonText, { color: textPrimary }]}>
                  Go Back
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.errorButton, { backgroundColor: buttonPrimary }]}
                onPress={handleRetry}
                activeOpacity={0.8}
              >
                <ThemedText style={[styles.errorButtonText, { color: buttonPrimaryText }]}>
                  Retry
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={20} color={textPrimary} />
        </TouchableOpacity>
        <ThemedText style={[styles.headerText, { color: textPrimary }]}>
          Remote Signing
        </ThemedText>
      </ThemedView>
      <FlatList
        data={connections}
        keyExtractor={item => item.client_pubkey}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={[styles.infoCard, { backgroundColor: surfaceColor }]}>
              <View style={styles.infoContent}>
                <View style={styles.infoIcon}>
                  <Lock size={20} color={textPrimary} />
                </View>
                <View style={styles.infoText}>
                  <ThemedText style={[styles.infoTitle, { color: textPrimary }]}>
                    Remote signing with style
                  </ThemedText>
                  <ThemedText style={[styles.infoSubtitle, { color: textSecondary }]}>
                    Connect your Nostr clients via NostrConnect Bunker. This standard keeps keys
                    sealed while clients request Portal signature over secure relays.
                  </ThemedText>
                  <ThemedText style={[styles.infoSubtitle, { color: textSecondary, marginTop: 8 }]}>
                    Share this bunker URI with your client to establish a secure remote signing connection.
                  </ThemedText>
                </View>
              </View>
              <View
                style={[
                  styles.bunkerUriBox,
                  {
                    borderColor: inputBorder,
                    backgroundColor: surfaceSecondary,
                  },
                ]}
              >
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                  <ThemedText
                    style={[styles.bunkerUriText, { color: textPrimary }]}
                    selectable
                  >
                    {isLoading ? 'Loading...' : bunkerUri || 'Unable to generate bunker URI'}
                  </ThemedText>
                </ScrollView>
                <TouchableOpacity
                  onPress={handleCopyBunkerUri}
                  style={styles.copyButton}
                  activeOpacity={0.7}
                >
                  <Copy size={16} color={buttonPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            <ThemedText style={[styles.sectionLabel, { color: textSecondary }]}>
              Active connections
            </ThemedText>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={[styles.connectionCard, { backgroundColor: cardBackground }]}
            activeOpacity={0.9}
            onPress={() => {
              if (!item.client_pubkey) {
                console.error('Cannot navigate: public_key is missing');
                return;
              }
              router.push(`/bunkerConnectionDetails/${item.client_pubkey}`);
            }}
          >
            <View style={styles.connectionHeader}>
              <ThemedText style={[styles.connectionIndex, { color: textSecondary }]}>
                {String(index + 1).padStart(2, '0')}
              </ThemedText>
              <ThemedText style={[styles.connectionTitle, { color: textPrimary }]}>
                {item.client_name ? item.client_name : item.client_pubkey}
              </ThemedText>
            </View>
            <ThemedText style={[styles.connectionDescription, { color: textSecondary }]}>
              Last used {formatRelativeTime(item.last_seen)}
            </ThemedText>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  backButton: {
    marginRight: 15,
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  infoCard: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 28,
  },
  infoContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },
  infoIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  infoText: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  infoSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  connectionCard: {
    borderRadius: 14,
    padding: 18,
    position: 'relative',
    overflow: 'visible',
  },
  connectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionIndex: {
    fontSize: 13,
    fontWeight: '600',
    marginRight: 12,
  },
  connectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  connectionDescription: {
    fontSize: 13,
    marginTop: 6,
  },
  separator: {
    height: 14,
  },
  bunkerUriBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  bunkerUriText: {
    fontSize: 13,
    flex: 1,
  },
  copyButton: {
    padding: 4,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorCard: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    maxWidth: 400,
    width: '100%',
  },
  errorIcon: {
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  errorButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  errorButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  errorButtonSecondary: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  errorButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default RemoteSigningScreen;