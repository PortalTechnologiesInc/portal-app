import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { PermissionsAndroid, Platform } from 'react-native';
import { SEED_ORIGIN_KEY } from '@/context/OnboardingFlowContext';

export const CLOUD_BACKUP_ENABLED_KEY = 'portal_cloud_backup_enabled';

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

// Load native module only on the current platform to avoid "Cannot find native module" on the other
function getBackupModule(): {
  backupSeed: (s: string, f: string) => Promise<string>;
  restoreSeed: (f: string) => Promise<string>;
  isAvailable?: () => Promise<boolean>;
} | null {
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
 * - Seed è mandato in chiaro al modulo nativo
 * - Modulo nativo salva su Google Drive (Android) o CloudKit (iOS)
 * - Transport è HTTPS (protetto in transit)
 * - Restituisce l'ID del file nel cloud
 */
export async function backupSeedToCloud(seed: string): Promise<string> {
  const BackupModule = getBackupModule();

  if (!BackupModule) {
    throw new Error('Cloud backup not supported on this platform');
  }

  try {
    return await BackupModule.backupSeed(seed, 'portal-seed.json');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('NO_GOOGLE_ACCOUNT')) {
      if (__DEV__) console.warn('[CloudBackup] No Google account visible, backup skipped');
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
 * Restore seed from cloud.
 * - Chiama il modulo nativo per scaricare il file
 * - Seed viene ricevuto in chiaro
 * - Restituisce il seed
 */
export async function restoreSeedFromCloud(): Promise<string> {
  const BackupModule = getBackupModule();

  if (!BackupModule) {
    throw new Error('Cloud backup not supported on this platform');
  }

  try {
    return await BackupModule.restoreSeed('portal-seed.json');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('NO_GOOGLE_ACCOUNT')) {
      throw new Error('No Google account found. Add one in Settings → Accounts.');
    }
    throw new Error(`Restore failed: ${msg}`);
  }
}

export type IsCloudBackupAvailableOptions = {
  /** If false, do not request GET_ACCOUNTS on Android (only check). Use after onboarding permissions page to avoid showing the permission dialog again. Default true. */
  requestPermission?: boolean;
};

/**
 * Utility: controlla se il device ha un account cloud configurato.
 * - Android: richiede GET_ACCOUNTS (runtime su Android 6+) e un account Google, unless requestPermission is false.
 * - iOS: richiede iCloud attivo.
 */
export async function isCloudBackupAvailable(
  options?: IsCloudBackupAvailableOptions
): Promise<boolean> {
  const requestPermission = options?.requestPermission !== false;
  try {
    const module = getBackupModule();
    if (!module) return false;
    if (typeof module.isAvailable !== 'function') return false;

    if (Platform.OS === 'android') {
      const hasPermission = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.GET_ACCOUNTS
      );
      if (!hasPermission) {
        if (!requestPermission) {
          if (__DEV__) console.log('[CloudBackup] GET_ACCOUNTS not granted (skip request)');
          return false;
        }
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.GET_ACCOUNTS,
          {
            title: 'Cloud backup',
            message: 'Portal needs access to your accounts to check for Google Drive backup.',
            buttonNeutral: 'Later',
            buttonNegative: 'Deny',
            buttonPositive: 'OK',
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          if (__DEV__) console.log('[CloudBackup] GET_ACCOUNTS not granted');
          return false;
        }
      }
    }

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
