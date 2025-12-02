import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, TextInput, TouchableOpacity, View } from 'react-native';
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
import { AllowedBunkerClientWithDates } from '@/services/DatabaseService';

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
  const [client, setClient] = useState<AllowedBunkerClientWithDates>();
  const [editableName, setEditableName] = useState('');
  const [grantedPermissions, setGrantedPermissions] = useState('');

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

  useEffect(() => {
    const loadClient = async () => {
      try {
        if (!id) throw Error("id param is null");
        const allowedClient = await executeOperation(db => db.getBunkerClientOrNull(id));
        if (!allowedClient) throw Error(`No allowed nostr client with this pubkey: ${id}`);
        setClient(allowedClient);
      } catch (error) {
        console.error('Failed to load relays for bunker connection:', error);
      }
    };

    loadClient();
  }, [executeOperation, id]);

  useEffect(() => {
    if (!client) return;
    setEditableName(client.client_name ?? '');
    setGrantedPermissions(client.granted_permissions);
  }, [client]);

  const requestedPermissions = useMemo(
    () => (client ? client.requested_permissions.split(',').filter(Boolean) : []),
    [client]
  );

  const isPermissionGranted = (permission: string) => {
    if (!grantedPermissions) return false;
    return grantedPermissions.split(',').includes(permission);
  };

  const handleTogglePermission = async (permission: string, enabled: boolean) => {
    if (!client) return;

    const current = grantedPermissions ? grantedPermissions.split(',').filter(Boolean) : [];
    let next: string[];

    if (enabled) {
      if (current.includes(permission)) {
        return;
      }
      next = [...current, permission];
    } else {
      next = current.filter(p => p !== permission);
    }

    const nextString = next.join(',');
    setGrantedPermissions(nextString);

    try {
      await executeOperation(db =>
        db.updateBunkerClientGrantedPermissions(client.public_key, nextString)
      );
    } catch (error) {
      console.error('Failed to update granted permissions for bunker client:', error);
      // revert optimistic update on error
      setGrantedPermissions(grantedPermissions);
    }
  };

  const handleSaveName = async () => {
    if (!client) return;
    const trimmed = editableName.trim();

    try {
      await executeOperation(db =>
        db.updateBunkerClientName(client.public_key, trimmed.length ? trimmed : null)
      );
      setClient({
        ...client,
        client_name: trimmed.length ? trimmed : null,
      });
      showToast('Connection name updated', 'success');
    } catch (error) {
      console.error('Failed to update bunker client name:', error);
      showToast('Unable to update connection name. Please try again.', 'error');
    }
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

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedView style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={[styles.label, { color: textSecondary }]}>Connection ID</ThemedText>
            <ThemedText style={[styles.value, { color: textPrimary }]}>
              {id || 'Unknown connection'}
            </ThemedText>
          </ThemedView>

          <ThemedView style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={[styles.label, { color: textSecondary }]}>Connection name</ThemedText>
            <View style={styles.nameRow}>
              <TextInput
                value={editableName}
                onChangeText={setEditableName}
                placeholder={client?.public_key ?? 'Enter a name'}
                placeholderTextColor={textSecondary}
                style={[
                  styles.nameInput,
                  {
                    borderColor: inputBorder,
                    color: textPrimary,
                  },
                ]}
              />
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: buttonPrimary }]}
                onPress={handleSaveName}
                disabled={!client}
              >
                <ThemedText style={styles.saveButtonText}>Save</ThemedText>
              </TouchableOpacity>
            </View>
          </ThemedView>

          {client && (
            <ThemedView style={[styles.card, { backgroundColor: cardBackground }]}>
              <ThemedText style={[styles.label, { color: textSecondary }]}>
                Requested permissions
              </ThemedText>
              {requestedPermissions.map((permission, index) => (
                <View key={`${permission}-${index}`} style={styles.permissionRow}>
                  <ThemedText style={[styles.permissionLabel, { color: textPrimary }]}>
                    {permission}
                  </ThemedText>
                  <Switch
                    value={isPermissionGranted(permission)}
                    onValueChange={enabled => handleTogglePermission(permission, enabled)}
                    trackColor={{ false: surfaceSecondary, true: buttonPrimary }}
                    thumbColor="#ffffff"
                  />
                </View>
              ))}
            </ThemedView>
          )}
        </ScrollView>
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
  scrollContent: {
    paddingBottom: 32,
    gap: 16,
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  saveButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  saveButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000000',
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  permissionLabel: {
    fontSize: 14,
  },
});

export default BunkerConnectionDetailsScreen;

