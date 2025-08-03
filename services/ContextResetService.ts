/**
 * Context Reset Service
 * 
 * This service provides a centralized way to reset all application contexts.
 * It's designed to be imported and used by the AppResetService to ensure
 * all context states are properly cleared during app reset.
 * 
 * This addresses issue #72 by ensuring contexts reinitialize properly after reset.
 */

/**
 * Interface for contexts that support resetting
 */
export interface ResettableContext {
  reset?: () => void;
}

/**
 * Registry of context reset functions
 * Add new contexts here as they implement reset functionality
 */
const contextResetFunctions: Array<() => void> = [];

/**
 * Register a context reset function
 * 
 * @param resetFn Function to call when resetting contexts
 */
export const registerContextReset = (resetFn: () => void): void => {
  contextResetFunctions.push(resetFn);
};

/**
 * Unregister a context reset function
 * 
 * @param resetFn Function to remove from reset registry
 */
export const unregisterContextReset = (resetFn: () => void): void => {
  const index = contextResetFunctions.indexOf(resetFn);
  if (index > -1) {
    contextResetFunctions.splice(index, 1);
  }
};

/**
 * Reset all registered contexts
 * 
 * This is called during app reset to ensure all context states
 * are cleared and will properly reinitialize on next access.
 */
export const resetAllContexts = (): void => {
  console.log('🔄 Resetting all application contexts...');
  
  const errors: Array<{contextIndex: number, error: any}> = [];
  
  contextResetFunctions.forEach((resetFn, index) => {
    try {
      resetFn();
    } catch (error) {
      console.error(`❌ Failed to reset context at index ${index}:`, error);
      errors.push({ contextIndex: index, error });
    }
  });
  
  if (errors.length === 0) {
    console.log(`✅ Successfully reset ${contextResetFunctions.length} contexts`);
  } else {
    console.warn(`⚠️ Reset ${contextResetFunctions.length - errors.length}/${contextResetFunctions.length} contexts (${errors.length} errors)`);
  }
};

/**
 * Get the number of registered contexts
 */
export const getRegisteredContextCount = (): number => {
  return contextResetFunctions.length;
};