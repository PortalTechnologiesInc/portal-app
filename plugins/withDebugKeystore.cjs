const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs').promises;
const path = require('path');

/**
 * Patches android/app/build.gradle so debug builds use the project-root debug.keystore.
 * Persists after expo prebuild --clean.
 */
function withDebugKeystore(config) {
  return withDangerousMod(config, [
    'android',
    async cfg => {
      const root = cfg.modRequest.platformProjectRoot;
      const appBuildPath = path.join(root, 'app', 'build.gradle');

      try {
        let contents = await fs.readFile(appBuildPath, 'utf8');

        // Already patched
        if (
          contents.includes('../../debug.keystore') ||
          contents.includes("keyAlias 'portal-debug'")
        ) {
          return cfg;
        }

        // Only patch when default Expo/RN debug signing is present
        if (
          !contents.includes("file('debug.keystore')") &&
          !contents.includes('file("debug.keystore")')
        ) {
          return cfg;
        }

        const original = contents;
        contents = contents
          .replace(
            /storeFile\s+file\s*\(\s*['"]debug\.keystore['"]\s*\)/,
            'storeFile file("../../debug.keystore")'
          )
          .replace(/storePassword\s+['"]android['"]/, "storePassword 'password'")
          .replace(/keyAlias\s+['"]androiddebugkey['"]/, "keyAlias 'portal-debug'")
          .replace(/keyPassword\s+['"]android['"]/, "keyPassword 'password'");

        if (contents !== original) {
          await fs.writeFile(appBuildPath, contents);
          console.log('✅ Patched android/app/build.gradle (debug keystore → project root)');
        }
      } catch (e) {
        console.warn('⚠️ Could not patch debug keystore in app/build.gradle:', e.message);
      }

      return cfg;
    },
  ]);
}

module.exports = withDebugKeystore;
