// services/notifications.js

import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { handleHeadlessNotification, sendNotification } from '@/services/NotificationService';
import { DATABASE_NAME } from './app/_layout';

// Import expo-router entry point - must be imported for app to work
import 'expo-router/entry';
import { openDatabaseAsync } from 'expo-sqlite';
import { ActiveWalletProvider, WalletWrapper } from './queue/providers/ActiveWallet';
import { NotificationProvider } from './queue/providers/Notification';
import { PromptUserWithNotification } from './queue/providers/PromptUser';
import { GetRelaysTask } from './queue/tasks/GetRelays';
import { ProviderRepository } from './queue/WorkQueue';
import { DatabaseService } from './services/DatabaseService';
import NostrStoreService from './services/NostrStoreService';
import { getMnemonic, getNsec } from './services/SecureStorageService';
import { getKeypairFromKey } from './utils/keyHelpers';

const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND-NOTIFICATION-TASK';
/**
 * Define the background notification task
 * This runs when a remote notification is received while the app is in the background
 *
 * According to Expo docs, this must be defined at the module level,
 * not inside React components or functions
 */
TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  BACKGROUND_NOTIFICATION_TASK,
  async ({ data: _data, error: _error, executionInfo: _executionInfo }) => {
    // Enhanced logging for background task execution
    const _timestamp = new Date().toISOString();

    // Check if the app is currently in the foreground (active state)
    if (AppState.currentState === 'active') {
      return; // Do not execute background logic if the app is active
    }

    const isNotificationResponse = 'data' in _data;

    if (isNotificationResponse) {
      try {
        const payload = _data as Record<string, any>;
        const rawBody =
          payload?.data?.body ??
          payload?.data?.UIApplicationLaunchOptionsRemoteNotificationKey?.body ??
          payload?.notification?.request?.content?.data?.body;

        if (!rawBody) {
        } else {
          const parsedBody =
            typeof rawBody === 'string'
              ? (JSON.parse(rawBody) as Record<string, unknown>)
              : (rawBody as Record<string, unknown>);

          const eventContentValue = parsedBody?.event_content ?? parsedBody?.eventContent;

          if (typeof eventContentValue !== 'string') {
          } else {
            await handleHeadlessNotification(eventContentValue, DATABASE_NAME);
          }
        }
      } catch (_e) {}
    } else {
    }
  }
);
// Register background notification handler
// This must be called before requesting permissions
Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);

async function initializeDatabase() {
  const sqlite = await openDatabaseAsync(DATABASE_NAME, { useNewConnection: true });
  const db = new DatabaseService(sqlite);
  ProviderRepository.register(db, 'DatabaseService');
}

async function initializeNostrStore() {
  const relays = await new GetRelaysTask().run();
  let mnemonic: string | null;
  try {
    mnemonic = await getMnemonic();
  } catch (_e) {
    // Only set to null if actual error occurred (not just missing key)
    mnemonic = null;
  }

  let nsec: string | null;
  // Load nsec - null is expected if key doesn't exist
  try {
    nsec = await getNsec();
  } catch (_e) {
    // Only set to null if actual error occurred (not just missing key)
    nsec = null;
  }
  const keypair = getKeypairFromKey({ mnemonic, nsec });
  const nostrStore = await NostrStoreService.create(keypair, relays);
  ProviderRepository.register(nostrStore, 'NostrStoreService');
}

initializeDatabase()
  .then(() => {
    initializeNostrStore()
      .then(() => {
        console.log('NostrStore initialized');
      })
      .catch(error => {
        console.error('Error initializing NostrStore', error);
      });

    console.log('Database initialized');
  })
  .catch(error => {
    console.error('Error initializing database', error);
  });

ProviderRepository.register(new PromptUserWithNotification(sendNotification), 'PromptUserProvider');
ProviderRepository.register(new NotificationProvider(sendNotification), 'NotificationProvider');
ProviderRepository.register(
  new ActiveWalletProvider(new WalletWrapper(null)),
  'ActiveWalletProvider'
);
