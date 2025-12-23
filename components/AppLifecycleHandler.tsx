import { useEffect } from 'react';
import { AppState, type AppStateStatus, Keyboard } from 'react-native';
import { cancelActiveFilePicker, isFilePickerActive } from '@/services/FilePickerService';

export function AppLifecycleHandler() {
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background') {
        Keyboard.dismiss();
        // Cancel any active file picker when the app goes to the background
        // to avoid leaving a dangling picker UI while the app is not in the foreground.
        // Note: We don't cancel on 'inactive' state because on iOS, the image picker
        // causes the app to go to 'inactive' while still visible, and we don't want
        // to cancel the user's selection in progress.
        if (isFilePickerActive()) {
          cancelActiveFilePicker();
        }
      } else if (nextState === 'inactive') {
        Keyboard.dismiss();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => subscription.remove();
  }, []);

  return null;
}
