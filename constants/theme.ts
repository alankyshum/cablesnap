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

// Competition plate colors (light/dark aware, WCAG contrast)
// Keys use unit suffix to avoid kg/lb collisions (e.g. "25kg" vs "25lb")
export const plateColors = {
  light: {
    "25kg":   { bg: "#D32F2F", text: "#FFFFFF" },  // red
    "20kg":   { bg: "#1565C0", text: "#FFFFFF" },  // blue
    "15kg":   { bg: "#F9A825", text: "#000000" },  // yellow
    "10kg":   { bg: "#2E7D32", text: "#FFFFFF" },  // green
    "5kg":    { bg: "#757575", text: "#FFFFFF" },   // white/grey
    "2.5kg":  { bg: "#37474F", text: "#FFFFFF" },  // dark
    "1.25kg": { bg: "#9E9E9E", text: "#000000" },  // silver
    "55lb":   { bg: "#D32F2F", text: "#FFFFFF" },  // red
    "45lb":   { bg: "#1565C0", text: "#FFFFFF" },  // blue
    "35lb":   { bg: "#F9A825", text: "#000000" },  // yellow
    "25lb":   { bg: "#2E7D32", text: "#FFFFFF" },  // green
    "10lb":   { bg: "#757575", text: "#FFFFFF" },   // white
    "5lb":    { bg: "#37474F", text: "#FFFFFF" },   // dark
    "2.5lb":  { bg: "#9E9E9E", text: "#000000" },  // silver
  } as Record<string, { bg: string; text: string }>,
  dark: {
    "25kg":   { bg: "#EF5350", text: "#000000" },
    "20kg":   { bg: "#42A5F5", text: "#000000" },
    "15kg":   { bg: "#FFD54F", text: "#000000" },
    "10kg":   { bg: "#66BB6A", text: "#000000" },
    "5kg":    { bg: "#BDBDBD", text: "#000000" },
    "2.5kg":  { bg: "#78909C", text: "#FFFFFF" },
    "1.25kg": { bg: "#E0E0E0", text: "#000000" },
    "55lb":   { bg: "#EF5350", text: "#000000" },
    "45lb":   { bg: "#42A5F5", text: "#000000" },
    "35lb":   { bg: "#FFD54F", text: "#000000" },
    "25lb":   { bg: "#66BB6A", text: "#000000" },
    "10lb":   { bg: "#BDBDBD", text: "#000000" },
    "5lb":    { bg: "#78909C", text: "#FFFFFF" },
    "2.5lb":  { bg: "#E0E0E0", text: "#000000" },
  } as Record<string, { bg: string; text: string }>,
};

export function plateColor(weight: number, unit: "kg" | "lb", isDark: boolean): { bg: string; text: string } {
  const palette = isDark ? plateColors.dark : plateColors.light;
  return palette[`${weight}${unit}`] || (isDark
    ? { bg: "#616161", text: "#FFFFFF" }
    : { bg: "#424242", text: "#FFFFFF" });
}

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

export const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: semantic.beginner,
  intermediate: semantic.intermediate,
  advanced: semantic.advanced,
};

// Muscle diagram colors — separate light/dark for WCAG contrast
export const muscle = {
  light: {
    primary: "#D32F2F",
    secondary: "#F57C00",
    inactive: "#E0E0E0",
    outline: "#9E9E9E",
  },
  dark: {
    primary: "#EF5350",
    secondary: "#FFB74D",
    inactive: "#424242",
    outline: "#616161",
  },
};

// Category icon map for MaterialCommunityIcons
export const CATEGORY_ICONS: Record<string, string> = {
  abs_core: "stomach",
  arms: "arm-flex",
  back: "human-handsup",
  chest: "weight-lifter",
  legs_glutes: "walk",
  shoulders: "account-arrow-up",
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
