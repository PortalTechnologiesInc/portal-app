import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Copy } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Clipboard from '@react-native-clipboard/clipboard';
import uuid from 'react-native-uuid';

import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useNostrService } from '@/context/NostrServiceContext';
import { useDatabaseContext } from '@/context/DatabaseContext';
import defaultRelayList from '@/assets/DefaultRelays.json';
import { keyToHex } from 'portal-app-lib';
import { showToast } from '@/utils/Toast';

const BunkerConnectionDetailsScreen = () => {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { executeOperation } = useDatabaseContext();
  const nostrService = useNostrService();

  const backgroundColor = useThemeColor({}, 'background');
  const textPrimary = useThemeColor({}, 'textPrimary');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const surfaceSecondary = useThemeColor({}, 'surfaceSecondary');
  const inputBorder = useThemeColor({}, 'inputBorder');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');

  const [bunkerSecret, setBunkerSecret] = useState<string>('');
  const [remoteRelays, setRemoteRelays] = useState<string[]>(defaultRelayList);

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
    if (!remoteSignerPubkey || remoteRelays.length === 0 || !bunkerSecret) {
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

  useEffect(() => {
    let isMounted = true;

    const loadRelaysAndGenerateSecret = async () => {
      try {
        // Generate UUID secret
        const secret = uuid.v4() as string;
        if (isMounted) {
          setBunkerSecret(secret);
        }

        // Load relays
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
        console.error('Failed to load relays for bunker connection:', error);
        if (isMounted) {
          setRemoteRelays(defaultRelayList);
          const secret = uuid.v4() as string;
          setBunkerSecret(secret);
        }
      }
    };

    loadRelaysAndGenerateSecret();

    return () => {
      isMounted = false;
    };
  }, [executeOperation]);

  const handleCopyBunkerUri = () => {
    if (!bunkerUri) {
      showToast('No bunker URI available', 'error');
      return;
    }
    Clipboard.setString(bunkerUri);
    showToast('Bunker URI copied', 'success');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={20} color={textPrimary} />
          </TouchableOpacity>
          <ThemedText style={[styles.headerText, { color: textPrimary }]}>
            Connection details
          </ThemedText>
        </View>

        <ThemedView style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText style={[styles.label, { color: textSecondary }]}>Connection ID</ThemedText>
          <ThemedText style={[styles.value, { color: textPrimary }]}>
            {id || 'Unknown connection'}
          </ThemedText>
        </ThemedView>

        <ThemedView style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText style={[styles.label, { color: textSecondary }]}>Bunker URL</ThemedText>
          <ThemedText style={[styles.description, { color: textSecondary, marginBottom: 12 }]}>
            Share this bunker URI with your client to establish a secure remote signing connection.
          </ThemedText>
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
                {bunkerUri || 'Generating bunker URI...'}
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
        </ThemedView>
      </ThemedView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    marginRight: 12,
  },
  headerText: {
    fontSize: 20,
    fontWeight: '600',
  },
  card: {
    borderRadius: 16,
    padding: 20,
  },
  label: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  value: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
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
});

export default BunkerConnectionDetailsScreen;

