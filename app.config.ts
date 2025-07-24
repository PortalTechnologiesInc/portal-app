export default {
  expo: {
    name: 'Portal',
    slug: 'portal',
    version: '1.0.0',
    orientation: 'portrait',
    owner: 'portaltechnologiesinc',
    icon: './assets/images/appLogo.png',
    scheme: 'portal',
    userInterfaceStyle: 'dark',
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
      userInterfaceStyle: 'dark',
      bundleIdentifier: 'cc.getportal.portal',
      associatedDomains: ['applinks:portal.app'],
      infoPlist: {
        NSCameraUsageDescription: 'Portal uses your camera to scan for QR codes',
      },
      icon: {
        dark: './assets/images/iosDark.png',
        light: './assets/images/iosLight.png',
        tinted: './assets/images/iosTinted.png',
      },
    },
    android: {
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
      adaptiveIcon: {
        foregroundImage: './assets/images/appLogo.png',
        backgroundColor: '#141416',
      },
      package: 'cc.getportal.portal',
      userInterfaceStyle: 'dark',
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'portal',
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
