const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const mrzScannerPath = path.resolve(__dirname, '../../mrz-scanner');
const config = getDefaultConfig(__dirname);

// Watch the local mrz-scanner package (file: dep, bun uses symlinks)
config.watchFolders = [mrzScannerPath];

// When Metro resolves deps from inside mrz-scanner, fall back to the host app's
// node_modules so peer deps (react-native, expo, etc.) resolve correctly.
config.resolver.extraNodeModules = new Proxy({}, {
  get: (target, name) => {
    if (name in target) return target[name];
    return path.join(__dirname, 'node_modules', name);
  },
});

module.exports = config;
