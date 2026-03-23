import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { SEED_ORIGIN_KEY } from '@/context/OnboardingFlowContext';

export const CLOUD_BACKUP_ENABLED_KEY = 'portal_cloud_backup_enabled';
const CLOUD_BACKUP_LAST_VERIFIED_KEY = 'portal_cloud_backup_last_verified_at';
const BACKUP_FILE_NAME = 'portal-seed.json';

/**
 * True if cloud backup is enabled (user preference). Default: true only for simple-setup path, false for advanced.
 */
export async function getCloudBackupEnabled(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(CLOUD_BACKUP_ENABLED_KEY);
  if (raw !== null) return raw === 'true';
  const origin = await SecureStore.getItemAsync(SEED_ORIGIN_KEY);
  return origin === 'simple';
}

export async function setCloudBackupEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(CLOUD_BACKUP_ENABLED_KEY, enabled ? 'true' : 'false');
}

type BackupModuleShape = {
  backupSeed: (s: string, f: string) => Promise<string>;
  restoreSeed: (f: string) => Promise<string>;
  deleteBackup: (f: string) => Promise<void>;
  hasBackup: (f: string) => Promise<boolean>;
  isAvailable: () => Promise<boolean>;
};

// Load native module only on the current platform to avoid "Cannot find native module" on the other
function getBackupModule(): BackupModuleShape | null {
  if (Platform.OS === 'android') {
    return require('@portal/cloud-backup-android').default;
  }
  if (Platform.OS === 'ios') {
    return require('@portal/cloud-backup-ios').default;
  }
  return null;
}

// ============================================================
// Cloud Backup / Restore (cleartext)
// ============================================================

/**
 * Backup seed to cloud.
 * - Seed is sent in cleartext to the native module
 * - Native module stores it in Google Drive (Android) or CloudKit (iOS)
 * - Transport is HTTPS (protected in transit)
 * - Returns the cloud file ID
 */
export async function backupSeedToCloud(seed: string): Promise<string> {
  const BackupModule = getBackupModule();

  if (!BackupModule) {
    throw new Error('Cloud backup not supported on this platform');
  }

  try {
    return await BackupModule.backupSeed(seed, BACKUP_FILE_NAME);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('NO_GOOGLE_ACCOUNT') || msg.includes('NO_ICLOUD_ACCOUNT')) {
      if (__DEV__) console.warn('[CloudBackup] No cloud account visible, backup skipped');
      return '';
    }
    if (msg.includes('UnregisteredOnApiConsole') || msg.includes('add Android OAuth client')) {
      if (__DEV__)
        console.warn(
          '[CloudBackup] App not registered in Google Cloud (UnregisteredOnApiConsole), backup skipped'
        );
      return '';
    }
    if (__DEV__) console.error('[CloudBackup] Backup error:', error);
    throw new Error(`Backup failed: ${msg}`);
  }
}

/**
 * Deletes the cloud backup file if present.
 * - Best-effort: if there's no Google account or file, this resolves without error.
 */
export async function deleteCloudBackup(): Promise<void> {
  const BackupModule = getBackupModule();

  if (!BackupModule) {
    return;
  }

  try {
    await BackupModule.deleteBackup(BACKUP_FILE_NAME);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('NO_GOOGLE_ACCOUNT') || msg.includes('NO_ICLOUD_ACCOUNT')) {
      // Nothing to delete; treat as success.
      return;
    }
    if (__DEV__) console.error('[CloudBackup] Delete backup error:', error);
    throw new Error(`Delete backup failed: ${msg}`);
  }
}

/**
 * Restore seed from cloud.
 * - Calls the native module to download the file
 * - Seed is received in cleartext
 * - Returns the seed
 */
export async function restoreSeedFromCloud(): Promise<string> {
  const BackupModule = getBackupModule();

  if (!BackupModule) {
    throw new Error('Cloud backup not supported on this platform');
  }

  try {
    return await BackupModule.restoreSeed(BACKUP_FILE_NAME);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('NO_GOOGLE_ACCOUNT') || msg.includes('NO_ICLOUD_ACCOUNT')) {
      throw new Error('No cloud account found. Add one in device Settings.');
    }
    throw new Error(`Restore failed: ${msg}`);
  }
}

/**
 * Returns true if a cloud backup file exists for the current account.
 * - Best-effort: on errors, logs in dev and returns false.
 */
export async function hasCloudBackup(): Promise<boolean> {
  const module = getBackupModule();
  if (!module) {
    return false;
  }

  try {
    return await module.hasBackup(BACKUP_FILE_NAME);
  } catch (error) {
    if (__DEV__) {
      console.warn(
        '[CloudBackup] hasCloudBackup failed:',
        error instanceof Error ? error.message : error
      );
    }
    return false;
  }
}

export type IsCloudBackupAvailableOptions = {
  /** Reserved for backward compatibility. Permission prompts are not used. */
  requestPermission?: boolean;
};

/**
 * Utility: checks whether the device has a cloud account configured.
 * - Android: requires a visible Google account.
 * - iOS: requires an active iCloud account.
 */
export async function isCloudBackupAvailable(
  options?: IsCloudBackupAvailableOptions
): Promise<boolean> {
  void options;
  try {
    const module = getBackupModule();
    if (!module) return false;

    const available = await module.isAvailable();
    if (__DEV__) {
      console.log('[CloudBackup] isAvailable:', available, `(platform: ${Platform.OS})`);
    }
    return !!available;
  } catch (e) {
    if (__DEV__) {
      console.warn('[CloudBackup] isAvailable check failed:', e instanceof Error ? e.message : e);
    }
    return false;
  }
}

type CloudBackupHealth = {
  exists: boolean;
  checked: boolean;
  message?: string;
};

/**
 * Verifies (at most once per day) that the cloud backup file still exists.
 * - If the backup is missing, disables the preference and reports `exists: false`.
 */
export async function verifyCloudBackupIfStale(): Promise<CloudBackupHealth> {
  const enabled = await getCloudBackupEnabled();
  if (!enabled) {
    return { exists: true, checked: false };
  }

  const last = await AsyncStorage.getItem(CLOUD_BACKUP_LAST_VERIFIED_KEY);
  if (last) {
    const lastDate = new Date(last);
    const now = new Date();
    const diffMs = now.getTime() - lastDate.getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (!Number.isNaN(diffMs) && diffMs < oneDayMs) {
      return { exists: true, checked: false };
    }
  }

  const module = getBackupModule();
  if (!module) {
    await AsyncStorage.setItem(CLOUD_BACKUP_LAST_VERIFIED_KEY, new Date().toISOString());
    return { exists: true, checked: true };
  }

  try {
    const has = await module.hasBackup(BACKUP_FILE_NAME);
    if (has) {
      await AsyncStorage.setItem(CLOUD_BACKUP_LAST_VERIFIED_KEY, new Date().toISOString());
      return { exists: true, checked: true };
    }

    // Backup missing: disable preference and clear "last verified".
    await setCloudBackupEnabled(false);
    await AsyncStorage.removeItem(CLOUD_BACKUP_LAST_VERIFIED_KEY);

    return {
      exists: false,
      checked: true,
      message:
        Platform.OS === 'android'
          ? 'Cloud backup not found in Google Drive. It may have been deleted.'
          : 'Cloud backup not found in iCloud. It may have been deleted.',
    };
  } catch (error) {
    if (__DEV__) {
      // Do not disable on transient errors; just log in dev.
      console.warn(
        '[CloudBackup] verifyCloudBackupIfStale failed:',
        error instanceof Error ? error.message : error
      );
    }
    return { exists: true, checked: true };
  }
}
