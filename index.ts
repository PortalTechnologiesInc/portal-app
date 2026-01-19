// services/notifications.js

import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { handleHeadlessNotification } from '@/services/NotificationService';
import { DATABASE_NAME } from './app/_layout';

// Import expo-router entry point - must be imported for app to work
import 'expo-router/entry';
import { openDatabaseAsync } from 'expo-sqlite';
import { ActiveWalletProvider, WalletWrapper } from './queue/providers/ActiveWallet';
import { NotificationProvider } from './queue/providers/Notification';
import { PromptUserWithNotification } from './queue/providers/PromptUser';
import { ProviderRepository } from './queue/WorkQueue';
import { DatabaseService } from './services/DatabaseService';

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

initializeDatabase()
  .then(() => {
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
