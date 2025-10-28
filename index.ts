// services/notifications.js
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';
import 'expo-router/entry';

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
  async ({ data, error, executionInfo }) => {
    // Enhanced logging for background task execution
    const timestamp = new Date().toISOString();
    console.log('================================================');
    console.log('🔔 BACKGROUND NOTIFICATION TASK TRIGGERED');
    console.log('Time:', timestamp);
    console.log('App State:', AppState.currentState);
    console.log('Execution Info:', executionInfo);
    console.log('================================================');
    try {
      await fetch('https://culodidio.free.beeceptor.com/', { method: 'GET' });
      console.log('GET request to beeceptor endpoint sent');
    } catch (err) {
      console.error('Failed to GET beeceptor endpoint:', err);
    }

    // // Check if the app is currently in the foreground (active state)
    // if (AppState.currentState === 'active') {
    //   console.log('⚠️ App is in foreground, skipping background logic');
    //   return; // Do not execute background logic if the app is active
    // }

    // if (error) {
    //   console.error('❌ Background notification error:', error);
    //   return;
    // }

    // console.log('📦 Received notification data:', JSON.stringify(data, null, 2));
    
    // const isNotificationResponse = 'data' in data;
    
    // if (isNotificationResponse) {
    //   try {
    //     console.log('🔍 Parsing notification payload...');
    //     const nostr_event_content = JSON.parse(data.data['body'] as any).event_content;
    //     console.log('✅ Successfully parsed Nostr event content');
        
    //     console.log('🚀 Starting headless notification processing...');
    //     await handleHeadlessNotification(nostr_event_content.toString(), DATABASE_NAME);
    //     console.log('✅ Headless notification processing completed successfully');
    //   } catch (e) {
    //     console.error('❌ Error processing headless notification:', e);
    //     console.error('Error details:', JSON.stringify(e, null, 2));
    //   }
    // } else {
    //   console.warn('⚠️ Notification response structure unexpected:', data);
    // }
    
    console.log('================================================');
    console.log('🔔 BACKGROUND NOTIFICATION TASK COMPLETED');
    console.log('================================================');
  }
);
// Register background notification handler
// This must be called before requesting permissions
Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);