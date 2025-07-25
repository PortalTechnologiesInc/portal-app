import { Platform, ToastAndroid, Alert } from 'react-native';
import { router } from 'expo-router';

export const showToast = (message: string, type: 'success' | 'error' = 'success') => {
  if (Platform.OS === 'android') {
    ToastAndroid.showWithGravity(message, ToastAndroid.SHORT, ToastAndroid.BOTTOM);
  } else {
    // For iOS, use Alert as a fallback
    const title = type === 'success' ? '✅ Success' : '❌ Error';
    Alert.alert(title, message);
  }
};

export const showErrorToast = (message: string) => {
  if (Platform.OS === 'android') {
    ToastAndroid.showWithGravity(message, ToastAndroid.SHORT, ToastAndroid.BOTTOM);
  } else {
    // For iOS, use Alert as a fallback (or you could use a third-party library)
    Alert.alert('❌ Error', message);
  }
};

// Helper to handle repeated errors and navigation to error page
let errorAttemptCounter = 0;
const ERROR_ATTEMPT_LIMIT = 5;

export const handleErrorWithToastAndReinit = (
  message: string,
  reinitCallback: () => void,
  options?: { errorMessage?: string; icon?: string }
) => {
  errorAttemptCounter++;
  showErrorToast(message);
  if (errorAttemptCounter >= ERROR_ATTEMPT_LIMIT) {
    // Navigate to a generic error page with message and icon as query params
    const errorMsg = options?.errorMessage || 'A critical error occurred. Please contact support.';
    const icon = options?.icon || 'error';
    const encodedMsg = encodeURIComponent(errorMsg);
    router.replace(`/error?message=${encodedMsg}&icon=${icon}`);
    errorAttemptCounter = 0; // reset after navigation
  } else {
    reinitCallback();
  }
};
