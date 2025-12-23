import type { ImagePickerOptions, ImagePickerResult } from 'expo-image-picker';
import { launchImageLibraryAsync } from 'expo-image-picker';

let isPickerActive = false;

export const cancelActiveFilePicker = () => {
  // No-op: expo-image-picker doesn't support cancellation
  // This function exists for compatibility with AppLifecycleHandler
  isPickerActive = false;
};

export const isFilePickerActive = (): boolean => {
  return isPickerActive;
};

export const launchImagePickerWithAutoCancel = async (
  options?: ImagePickerOptions
): Promise<ImagePickerResult> => {
  // Set flag to true when picker starts
  isPickerActive = true;

  try {
    const result = await launchImageLibraryAsync(options);
    // Don't clear flag here - let the caller clear it in their finally block
    // This ensures proper synchronization with app lock suppression
    return result;
  } catch (error) {
    // Clear flag on error
    isPickerActive = false;
    throw error;
  }
};
