/**
 * Theme colors hook: provides MD3-shaped color object backed by BNA UI Colors.
 * Usage: `const colors = useThemeColors()` replaces the old RNP useTheme().
 */

import { useColorScheme } from "@/hooks/useColorScheme";
import { Colors } from "@/theme/colors";

export function useThemeColors() {
  const scheme = useColorScheme();
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

    // Tertiary (mapped to orange/warning tones)
    //
    // BLD-2715 — Tritanopia audit (2026-07-03, completed-workout)
    //
    // Under tritanopia CVD simulation, the warm-cream background (#FFF0D1) shifts
    // to a pink/salmon tone (#FEDEDF) and the brown text (#5C3D00) shifts to a dark
    // reddish tone (#5A1A1C).  Despite this visual shift, the WCAG 2.1 AA 4.5:1
    // contrast requirement is met in *all* CVD modes:
    //
    //   Normal vision:  8.78:1   (PASS)
    //   Tritanopia:    10.46:1   (PASS — contrast improves under the shift)
    //   Deuteranopia:   7.71:1   (PASS)
    //   Protanopia:     8.02:1   (PASS)
    //
    // The same pair is used inverted for dark mode (identical ratios by symmetry).
    // A regression guard lives in __tests__/theme/tertiary-contrast.test.ts.
    //
    // Do NOT change these values without re-running the CVD contrast verification.
    tertiary: t.orange,
    tertiaryContainer: isDark ? "#5C3D00" : "#FFF0D1",
    onTertiaryContainer: isDark ? "#FFF0D1" : "#5C3D00",

    // Surface / Background
    surface: t.card,
    // BLD-561: subtle alt-surface used for illustration cards. Keeps an inline
    // image visually distinct from surrounding text without competing with the
    // primary card. Light = soft tint of muted; Dark = a hair lighter than card.
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

    // Elevation (simplified — BNA doesn't have MD3 elevation system)
    elevation: {
      level0: t.background,
      level1: t.card,
      level2: t.card,
      level3: t.card,
      level4: t.card,
      level5: t.card,
    },

    // Misc
    shadow: isDark ? "#000000" : "#000000",
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

    // Recovery heatmap palette (see theme/colors.ts)
    heatmapLow: t.heatmapLow,
    heatmapMid: t.heatmapMid,
    heatmapHigh: t.heatmapHigh,
    heatmapBorder: t.heatmapBorder,
  };
}

export type ThemeColors = ReturnType<typeof useThemeColors>;
