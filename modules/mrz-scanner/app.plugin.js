/**
 * Expo config plugin for @getportal/mrz-scanner.
 * Manually modifies iOS Info.plist and Android manifest — no external deps needed.
 *
 * @param {import("@expo/config").ExpoConfig} config
 * @param {{ cameraPermissionText?: string }} props
 */
function withMRZScanner(config, props = {}) {
  const cameraPermissionText =
    props.cameraPermissionText ||
    'This app needs camera access to scan MRZ codes on identity documents.';

  // iOS: ensure infoPlist exists, then add NSCameraUsageDescription
  if (!config.ios) config.ios = {};
  if (!config.ios.infoPlist) config.ios.infoPlist = {};
  if (!config.ios.infoPlist.NSCameraUsageDescription) {
    config.ios.infoPlist.NSCameraUsageDescription = cameraPermissionText;
  }

  // Android: add CAMERA permission to android.permissions list
  if (!config.android) config.android = {};
  if (!config.android.permissions) config.android.permissions = [];
  if (!config.android.permissions.includes('android.permission.CAMERA')) {
    config.android.permissions.push('android.permission.CAMERA');
  }

  return config;
}

module.exports = withMRZScanner;
