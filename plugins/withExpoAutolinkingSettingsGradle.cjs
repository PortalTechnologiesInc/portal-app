const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs').promises;
const path = require('path');

// exec returns path to package.json; we need new File(thatPath).getParentFile() so base dir is expo-modules-autolinking/
const PATCH_A = 'expoPluginsPath = new File(\n    providers.exec {';
const PATCH_A_REPLACEMENT = 'expoPluginsPath = new File(\n    new File(\n      providers.exec {';
const PATCH_B = '}.standardOutput.asText.get().trim(),\n    "android/expo-gradle-plugin"';
const PATCH_B_REPLACEMENT =
  '}.standardOutput.asText.get().trim()\n    ).getParentFile(),\n    "android/expo-gradle-plugin"';

const META_INF_BLOCK = `        resources {
            excludes += ['META-INF/DEPENDENCIES', 'META-INF/LICENSE', 'META-INF/NOTICE']
        }`;

/**
 * Patches android/settings.gradle and app/build.gradle. Persists after expo prebuild --clean.
 */
function withExpoAutolinkingSettingsGradle(config) {
  return withDangerousMod(config, [
    'android',
    async cfg => {
      const root = cfg.modRequest.platformProjectRoot;

      // 1) settings.gradle: expo-gradle-plugin path
      const settingsPath = path.join(root, 'settings.gradle');
      try {
        let contents = await fs.readFile(settingsPath, 'utf8');
        if (!contents.includes('getParentFile()') && contents.includes('expoPluginsPath')) {
          contents = contents
            .replace(PATCH_A, PATCH_A_REPLACEMENT)
            .replace(PATCH_B, PATCH_B_REPLACEMENT);
          await fs.writeFile(settingsPath, contents);
          console.log('✅ Patched android/settings.gradle (expo-gradle-plugin path)');
        }
      } catch (e) {
        console.warn('⚠️ Could not patch settings.gradle:', e.message);
      }

      // 2) app/build.gradle: META-INF excludes (cloud-backup Google API deps)
      const appBuildPath = path.join(root, 'app', 'build.gradle');
      try {
        let appContents = await fs.readFile(appBuildPath, 'utf8');
        if (
          appContents.includes('packagingOptions') &&
          !appContents.includes("excludes += ['META-INF/DEPENDENCIES'")
        ) {
          appContents = appContents.replace(
            /(packagingOptions \{\s*jniLibs \{[^}]+\}\s*)\}/,
            `$1\n${META_INF_BLOCK}\n    }`
          );
          await fs.writeFile(appBuildPath, appContents);
          console.log('✅ Patched android/app/build.gradle (META-INF excludes)');
        }
      } catch (e) {
        console.warn('⚠️ Could not patch app/build.gradle:', e.message);
      }

      return cfg;
    },
  ]);
}

module.exports = withExpoAutolinkingSettingsGradle;
