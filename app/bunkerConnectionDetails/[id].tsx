import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { keyToHex } from 'portal-app-lib';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { useNostrService } from '@/context/NostrServiceContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { AllowedBunkerClientWithDates } from '@/services/DatabaseService';
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
  const buttonDanger = useThemeColor({}, 'buttonDanger');
  const buttonDangerText = useThemeColor({}, 'buttonDangerText');
  const [client, setClient] = useState<AllowedBunkerClientWithDates>();
  const [editableName, setEditableName] = useState('');
  const [grantedPermissions, setGrantedPermissions] = useState('');

  const _remoteSignerPubkey = useMemo(() => {
    if (!nostrService.publicKey) {
      return '';
    }

    try {
      return keyToHex(nostrService.publicKey);
    } catch (_error) {
      try {
        return nostrService.publicKey.toString();
      } catch (_innerError) {
        return typeof nostrService.publicKey === 'string' ? nostrService.publicKey : '';
      }
    }
  }, [nostrService.publicKey]);

  useEffect(() => {
    const loadClient = async () => {
      try {
        if (!id) throw Error('id param is null');
        const allowedClient = await executeOperation(db => db.getBunkerClientOrNull(id));
        if (!allowedClient) throw Error(`No allowed nostr client with this pubkey: ${id}`);
        setClient(allowedClient);
      } catch (_error) {}
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

  const handleTogglePermission = (permission: string, enabled: boolean) => {
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
  };

  const handleSave = async () => {
    if (!client) return;

    const trimmed = editableName.trim();
    const nameToSave = trimmed.length ? trimmed : null;

    try {
      await executeOperation(async db => {
        await db.updateBunkerClientName(client.client_pubkey, nameToSave);
        await db.updateBunkerClientGrantedPermissions(client.client_pubkey, grantedPermissions);
      });

      setClient({
        ...client,
        client_name: nameToSave,
        granted_permissions: grantedPermissions,
      });
      showToast('Connection updated', 'success');
      router.back();
    } catch (_error) {
      showToast('Unable to update connection. Please try again.', 'error');
    }
  };

  const handleRevoke = async () => {
    if (!client) return;

    try {
      await executeOperation(db => db.revokeBunkerClient(client.client_pubkey));
      showToast('Connection revoked', 'success');
      router.back();
    } catch (_error) {
      showToast('Unable to revoke connection. Please try again.', 'error');
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
          <TouchableOpacity
            style={[styles.headerSaveButton, { backgroundColor: buttonPrimary }]}
            onPress={handleSave}
            disabled={!client}
          >
            <ThemedText style={styles.saveButtonText}>Save</ThemedText>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedView style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={[styles.label, { color: textSecondary }]}>Connection ID</ThemedText>
            <ThemedText style={[styles.value, { color: textPrimary }]}>
              {id || 'Unknown connection'}
            </ThemedText>
          </ThemedView>

          <ThemedView style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={[styles.label, { color: textSecondary }]}>
              Connection name
            </ThemedText>
            <TextInput
              value={editableName}
              onChangeText={setEditableName}
              placeholder={client?.client_pubkey ?? 'Enter a name'}
              placeholderTextColor={textSecondary}
              style={[
                styles.nameInput,
                {
                  borderColor: inputBorder,
                  color: textPrimary,
                },
              ]}
            />
          </ThemedView>

          {client && (
            <ThemedView style={[styles.card, { backgroundColor: cardBackground }]}>
              <ThemedText style={[styles.label, { color: textSecondary }]}>
                Requested permissions
              </ThemedText>
              {requestedPermissions.map(permission => (
                <View key={permission} style={styles.permissionRow}>
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

          <TouchableOpacity
            style={[styles.revokeButton, { backgroundColor: buttonDanger }]}
            onPress={handleRevoke}
            disabled={!client}
          >
            <ThemedText style={[styles.revokeButtonText, { color: buttonDangerText }]}>
              Revoke
            </ThemedText>
          </TouchableOpacity>
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
    justifyContent: 'space-between',
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
    flex: 1,
  },
  headerSaveButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
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
  nameInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
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
  revokeButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  revokeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default BunkerConnectionDetailsScreen;
