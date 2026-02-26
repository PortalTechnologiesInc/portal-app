export default {
  expo: {
    name: 'Portal',
    slug: 'portal',
    version: '1.0.10',
    orientation: 'portrait',
    owner: 'portaltechnologiesinc',
    icon: './assets/images/appLogo.png',
    scheme: 'portal',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/images/appSplash.png',
      resizeMode: 'contain',
      backgroundColor: '#141416',
    },
    androidNavigationBar: {
      backgroundColor: '#141416',
    },
    ios: {
      supportsTablet: true,
      userInterfaceStyle: 'automatic',
      bundleIdentifier: 'cc.getportal.portal',
      associatedDomains: ['applinks:portal.app'],
      infoPlist: {
        NSCameraUsageDescription: 'Portal uses your camera to scan for QR codes',
        // UIBackgroundModes: ['remote-notification'],
      },
      config: {
        usesNonExemptEncryption: false,
      },
      entitlements: {
        'com.apple.developer.icloud-container-identifiers': ['iCloud.cc.getportal.portal'],
        'com.apple.developer.icloud-services': ['CloudKit'],
      },
      icon: {
        dark: './assets/images/iosDark.png',
        light: './assets/images/iosLight.png',
        tinted: './assets/images/iosTinted.png',
      },
    },
    android: {
      versionCode: 12,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
      adaptiveIcon: {
        foregroundImage: './assets/images/appLogo.png',
        backgroundColor: '#141416',
      },
      package: 'cc.getportal.portal',
      userInterfaceStyle: 'automatic',
      // permissions: [
      //   "RECEIVE_BOOT_COMPLETED",
      //   "VIBRATE",
      //   "WAKE_LOCK",
      //   "POST_NOTIFICATIONS"
      // ],
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'portal',
            },
            {
              scheme: 'portal-cashu',
            },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      [
        'expo-image-picker',
        {
          photosPermission: 'The app accesses your photos to let you upload your profile picture.',
        },
      ],
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/images/appSplash.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#141416',
        },
      ],
      'expo-secure-store',
      'expo-sqlite',
      'expo-web-browser',
      [
        'expo-notifications',
        {
          icon: './assets/images/appNotificationLogo.png',
          color: '#ffffff',
          defaultChannel: 'default',
          // "sounds": [
          //   "./local/assets/notification_sound.wav",
          //   "./local/assets/notification_sound_other.wav"
          // ],
          enableBackgroundRemoteNotifications: true,
        },
      ],
      [
        'react-native-nfc-manager',
        {
          nfcPermission: 'Portal uses NFC for contactless interactions',
          includeNdefEntitlement: false,
        },
      ],
      './plugins/withRemoveUniffiDependency',
      './plugins/withExpoAutolinkingSettingsGradle.cjs',
      './plugins/withDebugKeystore.cjs',
      './modules/cloud-backup-android/app.plugin.js',
      './modules/cloud-backup-ios/app.plugin.js',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: '8aa33e4a-b2db-43ab-832b-709fb7f2ec0d',
      },
    },
  },
};
