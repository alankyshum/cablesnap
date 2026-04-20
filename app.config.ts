import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "CableSnap",
  slug: "cablesnap",
  version: "0.15.2",
  orientation: "default",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff", // eslint-disable-line no-restricted-syntax
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.anomalyco.cablesnap",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#FCF5F2", // eslint-disable-line no-restricted-syntax
    },
    package: "com.anomalyco.cablesnap",
    versionCode: 5,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  scheme: "cablesnap",
  plugins: [
    "expo-router",
    "expo-dev-client",
    "expo-notifications",
    "expo-sqlite",
    "expo-audio",
    "expo-sharing",
    [
      "expo-camera",
      {
        cameraPermission:
          "CableSnap needs camera access to scan food barcodes for quick nutrition logging.",
      },
    ],
    "expo-web-browser",
    "expo-secure-store",
    "expo-image",
    [
      "expo-build-properties",
      {
        android: {
          minSdkVersion: 26,
          compileSdkVersion: 36,
          targetSdkVersion: 35,
        },
      },
    ],
    [
      "expo-health-connect",
      {
        permissions: ["WRITE_EXERCISE"],
      },
    ],
  ],
  extra: {
    eas: {
      projectId: "f15d9aef-342e-4a5d-9007-4f98eff3ba23",
    },
    stravaClientId: "227474",
  },
});
