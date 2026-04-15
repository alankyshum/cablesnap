import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "FitForge",
  slug: "fitforge",
  version: "0.1.1",
  orientation: "default",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
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
    edgeToEdgeEnabled: true,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  scheme: "fitforge",
  plugins: ["expo-router", "expo-notifications", "expo-sqlite"],
  extra: {
    eas: {
      projectId: "f15d9aef-342e-4a5d-9007-4f98eff3ba23",
    },
  },
});
