/**
 * Standardized error logging utility
 * Format: [FEATURE]: Error in {function} - Error msg: {error or error.inner}
 */

const extractErrorMessage = (error: unknown): string => {
  if (!error) return 'Unknown error';
  
  // Handle Error objects
  if (error instanceof Error) {
    // Check for error.inner (common in portal-app-lib)
    if ((error as any).inner) {
      const inner = (error as any).inner;
      if (Array.isArray(inner) && inner.length > 0) {
        return inner.map((e: any) => e?.message || String(e)).join('; ');
      }
      if (typeof inner === 'object' && inner !== null) {
        return inner.message || JSON.stringify(inner);
      }
      return String(inner);
    }
    return error.message || String(error);
  }
  
  // Handle objects with message property
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as any).message);
  }
  
  // Handle strings
  if (typeof error === 'string') {
    return error;
  }
  
  // Fallback to JSON stringify
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

export const logError = (
  feature: string,
  functionName: string,
  error: unknown,
  additionalContext?: Record<string, unknown>
): void => {
  const errorMsg = extractErrorMessage(error);
  const contextStr = additionalContext
    ? ` - Context: ${JSON.stringify(additionalContext)}`
    : '';
  
  const logMessage = `[${feature}]: Error in ${functionName} - Error msg: ${errorMsg}${contextStr}`;
  
  // Log to console
  console.error(logMessage);
  
  // In development, also log the full error object for debugging
  if (__DEV__) {
    console.error('Full error object:', error);
  }
};

