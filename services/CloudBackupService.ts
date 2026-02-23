import CloudBackupAndroid from '@portal/cloud-backup-android';
import CloudBackupIOS from '@portal/cloud-backup-ios';
import { Platform } from 'react-native';

// ============================================================
// Cloud Backup / Restore (cleartext)
// ============================================================

/**
 * Backup seed to cloud.
 * - Seed è mandato in chiaro al modulo nativo
 * - Modulo nativo salva su Google Drive (Android) o CloudKit (iOS)
 * - Transport è HTTPS (protetto in transit)
 * - Restituisce l'ID del file nel cloud
 */
export async function backupSeedToCloud(seed: string): Promise<string> {
  const BackupModule = Platform.select({
    android: CloudBackupAndroid,
    ios: CloudBackupIOS,
  });

  if (!BackupModule) {
    throw new Error('Cloud backup not supported on this platform');
  }

  try {
    return await BackupModule.backupSeed(seed, 'portal-seed.json');
  } catch (error) {
    throw new Error(`Backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Restore seed from cloud.
 * - Chiama il modulo nativo per scaricare il file
 * - Seed viene ricevuto in chiaro
 * - Restituisce il seed
 */
export async function restoreSeedFromCloud(): Promise<string> {
  const BackupModule = Platform.select({
    android: CloudBackupAndroid,
    ios: CloudBackupIOS,
  });

  if (!BackupModule) {
    throw new Error('Cloud backup not supported on this platform');
  }

  try {
    return await BackupModule.restoreSeed('portal-seed.json');
  } catch (error) {
    throw new Error(`Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Utility: controlla se il device ha un account cloud configurato.
 */
export async function isCloudBackupAvailable(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      return !!(CloudBackupAndroid && (await CloudBackupAndroid.isAvailable?.()));
    }
    if (Platform.OS === 'ios') {
      return !!(CloudBackupIOS && (await CloudBackupIOS.isAvailable?.()));
    }
    return false;
  } catch {
    return false;
  }
}
