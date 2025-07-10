export default {
  "expo": {
    "name": "Portal",
    "slug": "Portal",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/appLogo.png",
    "scheme": "portal",
    "userInterfaceStyle": "dark",
    "newArchEnabled": true,
    "splash": {
      "image": "./assets/images/appLogo.png",
      "resizeMode": "contain",
      "backgroundColor": "#000000"
    },
    "androidNavigationBar": {
      "backgroundColor": "#000000"
    },
    "ios": {
      "supportsTablet": true,
      "userInterfaceStyle": "dark",
      "bundleIdentifier": "com.portaltechnologiesinc.portal",
      "associatedDomains": [
        "applinks:portal.app"
      ]
    },
    "android": {
      "googleServicesFile": process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/appLogo.png",
        "backgroundColor": "#000000"
      },
      "package": "com.portaltechnologiesinc.portal",
      "userInterfaceStyle": "dark",
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [
            {
              "scheme": "portal"
            }
          ],
          "category": [
            "BROWSABLE",
            "DEFAULT"
          ]
        }
      ]
    },
    "web": {
      "bundler": "metro",
      "output": "static",
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      "expo-router",
      [
        "expo-splash-screen",
        {
          "image": "./assets/images/appLogo.png",
          "imageWidth": 200,
          "resizeMode": "contain",
          "backgroundColor": "#000000"
        }
      ],
      "expo-secure-store",
      "expo-sqlite",
      "expo-web-browser",
      "expo-notifications"
    ],
    "experiments": {
      "typedRoutes": true
    },
    "extra": {
      "router": {},
      "eas": {
        "projectId": "15f4dbf1-f91d-421a-86f4-f29fd3a8e5a1"
      }
    }
  }
};
