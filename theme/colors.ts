// CableSnap "Electric Coral Energy" palette mapped to BNA UI semantic tokens.
// Domain-specific colors (plates, muscles, semantic macros) remain in constants/theme.ts.

const lightColors = {
  // Base colors
  background: "#FAFAFA",
  foreground: "#1A2138",

  // Card colors
  card: "#F3F4F6",
  cardForeground: "#1A2138",

  // Popover colors
  popover: "#F3F4F6",
  popoverForeground: "#1A2138",

  // Primary — Electric Coral
  primary: "#FF6038",
  primaryForeground: "#FFFFFF",

  // Secondary — Navy
  secondary: "#1A2138",
  secondaryForeground: "#FFFFFF",

  // Muted
  muted: "#E5E7EB",
  mutedForeground: "#6B7280",

  // Accent
  accent: "#FFE0D6",
  accentForeground: "#6B1F0A",

  // Destructive
  destructive: "#EF4444",
  destructiveForeground: "#FFFFFF",

  // Border and input
  border: "#D1D5DB",
  input: "#E5E7EB",
  ring: "#FF6038",

  // Text colors
  text: "#1A2138",
  textMuted: "#6B7280",

  // Banner backgrounds
  warningBanner: "#FFF8E1",
  errorBanner: "#FEE2E2",

  // Shadows & overlays
  shadow: "#000000",
  onToast: "#FFFFFF",
  toastBackground: "#1C1C1E",

  // iOS system colors
  blue: "#007AFF",
  green: "#10B981",
  red: "#EF4444",
  orange: "#F59E0B",
  yellow: "#FFCC00",
  pink: "#FF2D92",
  purple: "#AF52DE",
  teal: "#5AC8FA",
  indigo: "#5856D6",
};

const darkColors = {
  // Base colors
  background: "#0D1117",
  foreground: "#F0F2F5",

  // Card colors
  card: "#161B22",
  cardForeground: "#F0F2F5",

  // Popover colors
  popover: "#161B22",
  popoverForeground: "#F0F2F5",

  // Primary — Lighter coral for dark mode
  primary: "#FF7A55",
  primaryForeground: "#FFFFFF",

  // Secondary — Navy
  secondary: "#2D3350",
  secondaryForeground: "#FFFFFF",

  // Muted
  muted: "#21262D",
  mutedForeground: "#8B949E",

  // Accent
  accent: "#6B1F0A",
  accentForeground: "#FFE0D6",

  // Destructive
  destructive: "#F87171",
  destructiveForeground: "#FFFFFF",

  // Border and input
  border: "#30363D",
  input: "rgba(255, 255, 255, 0.15)",
  ring: "#FF7A55",

  // Text colors
  text: "#F0F2F5",
  textMuted: "#8B949E",

  // Banner backgrounds
  warningBanner: "#332200",
  errorBanner: "#3B1111",

  // Shadows & overlays
  shadow: "#000000",
  onToast: "#FFFFFF",
  toastBackground: "#1C1C1E",

  // iOS system colors (dark-adapted)
  blue: "#0A84FF",
  green: "#30D158",
  red: "#FF453A",
  orange: "#FF9F0A",
  yellow: "#FFD60A",
  pink: "#FF375F",
  purple: "#BF5AF2",
  teal: "#64D2FF",
  indigo: "#5E5CE6",
};

export const Colors = {
  light: lightColors,
  dark: darkColors,
};

export { darkColors, lightColors };

export type ColorKeys = keyof typeof lightColors;
