import {
  MD3LightTheme,
  MD3DarkTheme,
  adaptNavigationTheme,
} from "react-native-paper";
import {
  DefaultTheme as NavigationDefaultTheme,
  DarkTheme as NavigationDarkTheme,
} from "@react-navigation/native";

const base = {
  primary: "#4CAF50",
  secondary: "#388E3C",
  tertiary: "#81C784",
};

const lightColors = {
  ...base,
  primaryContainer: "#C8E6C9",
  secondaryContainer: "#A5D6A7",
  tertiaryContainer: "#E8F5E9",
  onPrimaryContainer: "#1B5E20",
  onSecondaryContainer: "#1B5E20",
  onTertiaryContainer: "#1B5E20",
};

const darkColors = {
  ...base,
  primaryContainer: "#1B5E20",
  secondaryContainer: "#2E7D32",
  tertiaryContainer: "#1B3A1D",
  onPrimaryContainer: "#C8E6C9",
  onSecondaryContainer: "#A5D6A7",
  onTertiaryContainer: "#C8E6C9",
};

// Custom semantic colors for domain-specific indicators
export const semantic = {
  protein: "#4caf50",
  carbs: "#ff9800",
  fat: "#f44336",
  beginner: "#4CAF50",
  intermediate: "#FF9800",
  advanced: "#F44336",
  onBeginner: "#ffffff",
  onIntermediate: "#000000",
  onAdvanced: "#ffffff",
};

export function difficultyText(level: string): string {
  if (level === "intermediate") return semantic.onIntermediate;
  if (level === "advanced") return semantic.onAdvanced;
  return semantic.onBeginner;
}

export const light = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...lightColors,
  },
};

export const dark = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...darkColors,
    surface: "#121212",
    background: "#121212",
  },
};

const { LightTheme: navLight, DarkTheme: navDark } = adaptNavigationTheme({
  reactNavigationLight: NavigationDefaultTheme,
  reactNavigationDark: NavigationDarkTheme,
  materialLight: light,
  materialDark: dark,
});

export const navigationLight = navLight;
export const navigationDark = navDark;
