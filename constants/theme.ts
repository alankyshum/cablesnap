import {
  MD3LightTheme,
  MD3DarkTheme,
  adaptNavigationTheme,
} from "react-native-paper";
import {
  DefaultTheme as NavigationDefaultTheme,
  DarkTheme as NavigationDarkTheme,
} from "@react-navigation/native";

const colors = {
  primary: "#4CAF50",
  primaryContainer: "#C8E6C9",
  secondary: "#388E3C",
  secondaryContainer: "#A5D6A7",
  tertiary: "#81C784",
  tertiaryContainer: "#E8F5E9",
};

// Custom semantic colors for domain-specific indicators
export const semantic = {
  protein: "#4caf50",
  carbs: "#ff9800",
  fat: "#f44336",
  beginner: "#4CAF50",
  intermediate: "#FF9800",
  advanced: "#F44336",
  onSemantic: "#ffffff",
};

export const light = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...colors,
  },
};

export const dark = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...colors,
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
