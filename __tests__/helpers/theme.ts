/**
 * Shared mock-theme factory for component tests (BLD-1906).
 *
 * Problem: ~22 test files hardcoded onPrimary:"#FFFFFF" in their
 * jest.mock("useThemeColors") blocks. After BLD-1904 flipped
 * primaryForeground → navy (#1A2138), those fixtures became stale —
 * they no longer reflect what users see, and future palette changes
 * will silently diverge from these mocks.
 *
 * Solution: derive mock theme values from the real exported tokens in
 * theme/colors.ts so that any future palette change automatically
 * propagates to all component tests that use this factory.
 *
 * Usage in a test file:
 *
 *   import { makeMockThemeColors } from "../../helpers/theme";
 *
 *   jest.mock("@/hooks/useThemeColors", () => ({
 *     useThemeColors: () => makeMockThemeColors(),
 *   }));
 *
 * Or for dark mode:
 *
 *   jest.mock("@/hooks/useThemeColors", () => ({
 *     useThemeColors: () => makeMockThemeColors("dark"),
 *   }));
 *
 * The factory mirrors the property mapping in hooks/useThemeColors.ts
 * exactly — any properties added there should be mirrored here.
 *
 * Note: this helper is in __tests__/helpers/ which is in
 * jest.config.js testPathIgnorePatterns — it is never run as a test suite.
 */

import { Colors } from "../../theme/colors";

export type ColorScheme = "light" | "dark";

/**
 * Returns a ThemeColors-shaped object derived from the real token palette.
 * Mirrors the mapping in hooks/useThemeColors.ts.
 */
export function makeMockThemeColors(scheme: ColorScheme = "light") {
  const isDark = scheme === "dark";
  const t = isDark ? Colors.dark : Colors.light;

  return {
    // Primary
    primary: t.primary,
    onPrimary: t.primaryForeground,
    primaryContainer: t.accent,
    onPrimaryContainer: t.accentForeground,

    // Secondary
    secondary: t.secondary,
    onSecondary: t.secondaryForeground,
    secondaryContainer: t.muted,
    onSecondaryContainer: t.foreground,

    // Tertiary
    tertiary: t.orange,
    tertiaryContainer: isDark ? "#5C3D00" : "#FFF0D1",
    onTertiaryContainer: isDark ? "#FFF0D1" : "#5C3D00",

    // Surface / Background
    surface: t.card,
    surfaceAlt: isDark ? "#1A1F26" : "#F2F4F7",
    surfaceVariant: t.muted,
    onSurface: t.foreground,
    onSurfaceVariant: t.mutedForeground,
    background: t.background,
    onBackground: t.foreground,

    // Disabled
    surfaceDisabled: t.muted,
    onSurfaceDisabled: t.mutedForeground,

    // Error / Destructive
    error: t.destructive,
    onError: t.destructiveForeground,
    errorContainer: isDark ? "#7F1D1D" : "#FEE2E2",
    onErrorContainer: isDark ? "#FEE2E2" : "#7F1D1D",

    // Borders
    outline: t.border,
    outlineVariant: isDark ? "#21262D" : "#E5E7EB",

    // Elevation
    elevation: {
      level0: t.background,
      level1: t.card,
      level2: t.card,
      level3: t.card,
      level4: t.card,
      level5: t.card,
    },

    // Misc
    shadow: "#000000",
    scrim: "rgba(0,0,0,0.5)",
    inverseSurface: isDark ? t.background : "#1A2138",
    inverseOnSurface: isDark ? t.foreground : "#FFFFFF",
    inversePrimary: isDark ? "#FF6038" : "#FF7A55",
    text: t.text,
    disabled: t.mutedForeground,
    placeholder: t.mutedForeground,
    backdrop: "rgba(0,0,0,0.5)",
    notification: t.red,
    card: t.card,

    // Recovery heatmap
    heatmapLow: t.heatmapLow,
    heatmapMid: t.heatmapMid,
    heatmapHigh: t.heatmapHigh,
    heatmapBorder: t.heatmapBorder,
  };
}

/**
 * Pre-built light theme colors object — convenience export for tests
 * that don't need to configure the scheme dynamically.
 */
export const mockLightTheme = makeMockThemeColors("light");

/**
 * Pre-built dark theme colors object.
 */
export const mockDarkTheme = makeMockThemeColors("dark");

/**
 * Aliases for backward compat with tests already migrated to helpers/theme
 * before this factory was introduced (BLD-1906).
 */
export const lightMockColors = mockLightTheme;
export const darkMockColors = mockDarkTheme;
