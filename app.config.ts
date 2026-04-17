import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "FitForge",
  slug: "fitforge",
  version: "0.8.0",
  orientation: "default",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.anomalyco.fitforge",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
    package: "com.anomalyco.fitforge",
    versionCode: 4,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  scheme: "fitforge",
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
          "FitForge needs camera access to scan food barcodes for quick nutrition logging.",
      },
    ],
    "expo-web-browser",
    "expo-secure-store",
    [
      "expo-build-properties",
      {
        android: {
          minSdkVersion: 26,
          compileSdkVersion: 34,
          targetSdkVersion: 34,
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
    stravaClientId: process.env.STRAVA_CLIENT_ID ?? "",
  },
});
