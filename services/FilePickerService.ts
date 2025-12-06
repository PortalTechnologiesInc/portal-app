import type { ImagePickerOptions, ImagePickerResult } from 'expo-image-picker';
import { launchImageLibraryAsync } from 'expo-image-picker';

type CancelHandler = (() => void) | null;

let activeCancelHandler: CancelHandler = null;

const resolveCanceledResult = (resolve: (value: ImagePickerResult) => void) => {
  resolve({ canceled: true, assets: null });
};

const attachCancellation = (): {
  promise: Promise<ImagePickerResult>;
  cancel: () => void;
} => {
  let resolveFn: ((value: ImagePickerResult) => void) | null = null;

  const promise = new Promise<ImagePickerResult>(resolve => {
    resolveFn = resolve;
  });

  return {
    promise,
    cancel: () => {
      if (resolveFn) {
        resolveCanceledResult(resolveFn);
        resolveFn = null;
      }
    },
  };
};

export const cancelActiveFilePicker = () => {
  if (activeCancelHandler) {
    activeCancelHandler();
    activeCancelHandler = null;
  }
};

export const launchImagePickerWithAutoCancel = async (
  options?: ImagePickerOptions
): Promise<ImagePickerResult> => {
  cancelActiveFilePicker();

  const { promise: cancelPromise, cancel } = attachCancellation();
  activeCancelHandler = cancel;

  let canceledExternally = false;

  const pickerPromise = launchImageLibraryAsync(options).then(result => {
    activeCancelHandler = null;
    return result;
  });

  const raceResult = await Promise.race([pickerPromise, cancelPromise.then(result => {
    canceledExternally = true;
    return result;
  })]);

  if (canceledExternally) {
    pickerPromise.catch(() => undefined);
  }

  return raceResult;
};

