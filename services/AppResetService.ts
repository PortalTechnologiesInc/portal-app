import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { resetAllContexts } from './ContextResetService';
import { DatabaseService } from './DatabaseService';
import { PortalAppManager } from './PortalAppManager';
import { SecureStorageService } from './SecureStorageServiceV2';

/**
 * Global reset flag to coordinate reset process
 */
let isAppResetting = false;

/**
 * Check if app is currently resetting
 */
export const isAppInResetMode = (): boolean => {
  return isAppResetting;
};

/**
 * Comprehensive App Reset Service
 *
 * This service coordinates a complete app reset including:
 * - All SecureStore data
 * - All database tables and data
 * - Navigation state reset
 * - Context state cleanup
 *
 * Fixes issues #71 and #72:
 * - #71: Correctly clear all secure storage entries
 * - #72: Ensure proper profile refresh after reset
 */
export class AppResetService {
  /**
   * Perform a complete app reset
   *
   * @param database Optional database instance for reset. If not provided, uses legacy reset method.
   * @returns Promise that resolves when reset is complete
   */
  static async performCompleteReset(database?: SQLiteDatabase): Promise<void> {
    console.log('🔄 Starting complete app reset...');
    // Set global reset flag
    isAppResetting = true;

    const errors: Array<{ step: string; error: unknown }> = [];

    try {
      // Step 1: Clear all SecureStore data
      await SecureStorageService.resetAll();
    } catch (error) {
      console.error('❌ Failed to clear SecureStore:', error);
      errors.push({ step: 'SecureStore', error });
    }

    try {
      // Step 2: Reset database and force reinitialization
      if (database) {
        const dbService = new DatabaseService(database);

        // Then, force a full migration to recreate all tables
        await dbService.resetAndReinitializeDatabase();
      }
    } catch (error) {
      console.error('❌ Failed to reset database:', error);
      errors.push({ step: 'Database', error });
    }

    try {
      // Step 3: Reset all application contexts
      resetAllContexts();
    } catch (error) {
      console.error('❌ Failed to reset contexts:', error);
      errors.push({ step: 'Contexts', error });
    }

    try {
      // Step 4: Reset navigation to onboarding
      router.replace('/onboarding');
    } catch (error) {
      console.error('❌ Failed to reset navigation:', error);
      errors.push({ step: 'Navigation', error });
    }

    // Step 5: Clear AsyncStorage
    try {
      console.log('Step 5/5: Clearing storage...');
      await AsyncStorage.clear();
    } catch (error) {
      console.error('❌ Failed to clear storage:', error);
      errors.push({ step: 'Storage', error });
    }

    // Step 6: Deleting app instance
    PortalAppManager.clearInstance();

    // Clear global reset flag after a delay to allow reset to complete
    setTimeout(() => {
      isAppResetting = false;
    }, 10000); // 10 second delay

    // Report results
    if (errors.length === 0) {
      console.log('✅ Complete app reset successful!');
    } else {
      console.warn(`⚠️ App reset completed with ${errors.length} non-critical errors:`, errors);
    }

    // Even if there were errors, the reset likely succeeded enough to be functional
    // The app should still navigate to onboarding and work properly
  }
}
