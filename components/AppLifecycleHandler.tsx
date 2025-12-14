import { useEffect } from 'react';
import { AppState, Keyboard, type AppStateStatus } from 'react-native';
import { cancelActiveFilePicker } from '@/services/FilePickerService';

export function AppLifecycleHandler() {
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        Keyboard.dismiss();
        cancelActiveFilePicker();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => subscription.remove();
  }, []);

  return null;
}
