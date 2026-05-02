import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "CableSnap",
  slug: "cablesnap",
  version: "0.26.19",
  orientation: "default",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#FF6038", // eslint-disable-line no-restricted-syntax
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.persoack.cablesnap",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#FF6038", // eslint-disable-line no-restricted-syntax
    },
    package: "com.persoack.cablesnap",
    versionCode: 85,
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
    "./plugins/with-release-signing",
    "./plugins/with-wearos-module",
    [
      // Sentry Expo config plugin — wires the Android Gradle plugin so that
      // release builds upload source maps + debug-ids. The plugin falls back
      // to SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN env vars at build
      // time; values passed here are the canonical (non-secret) slugs. Auth
      // token is NEVER set here — it must come from env only.
      "@sentry/react-native/expo",
      {
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        url: "https://sentry.io/",
      },
    ],
  ],
  owner: "alankyshum",
  extra: {
    eas: {
      projectId: "24dc5f10-9a21-4336-bac0-6334a5f6b82b",
    },
    stravaClientId: "227474",
    stravaProxyUrl: "https://strava-proxy.alan200994.workers.dev",
  },
});
