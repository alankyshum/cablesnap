import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "FitForge",
  slug: "fitforge",
  version: "0.4.0",
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
    versionCode: 3,
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
  ],
  extra: {
    eas: {
      projectId: "f15d9aef-342e-4a5d-9007-4f98eff3ba23",
    },
  },
});
