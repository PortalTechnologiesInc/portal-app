import { useEffect } from 'react';
import { AppState, type AppStateStatus, Keyboard } from 'react-native';
import { cancelActiveFilePicker, isFilePickerActive } from '@/services/FilePickerService';

export function AppLifecycleHandler() {
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        Keyboard.dismiss();
        // Don't cancel file picker if it's actively being used (user is selecting/cropping image)
        // Only cancel if the app is truly going to background for other reasons
        if (!isFilePickerActive()) {
          cancelActiveFilePicker();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => subscription.remove();
  }, []);

  return null;
}
