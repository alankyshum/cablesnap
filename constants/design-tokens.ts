import { Platform } from "react-native";
import { Easing } from "react-native-reanimated";

// ─── Spacing (4px grid) ────────────────────────────────────────────

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export type SpacingKey = keyof typeof spacing;

export function space(key: SpacingKey): number {
  return spacing[key];
}

// ─── Border Radii ──────────────────────────────────────────────────

export const radii = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  pill: 9999,
} as const;

export type RadiiKey = keyof typeof radii;

export function radius(key: RadiiKey): number {
  return radii[key];
}

// ─── Font Sizes ────────────────────────────────────────────────────

export const fontSizes = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  xxl: 20,
  heading: 22,
  stat: 32,
  display: 56,
  hero: 72,
} as const;

export type FontSizeKey = keyof typeof fontSizes;

// ─── Typography ────────────────────────────────────────────────────

export const typography = {
  display: {
    fontSize: fontSizes.display,
    lineHeight: 64,
    fontWeight: "800" as const,
  },
  heroNumber: {
    fontSize: fontSizes.hero,
    lineHeight: 80,
    fontWeight: "800" as const,
    fontVariant: ["tabular-nums"] as const,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  statValue: {
    fontSize: fontSizes.stat,
    lineHeight: 40,
    fontWeight: "700" as const,
    fontVariant: ["tabular-nums"] as const,
  },
} as const;

// ─── Elevation / Shadows ───────────────────────────────────────────

export const elevation = {
  none: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  low: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.08,
    elevation: 1,
  },
  medium: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    shadowOpacity: 0.12,
    elevation: 3,
  },
  high: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 16,
    shadowOpacity: 0.16,
    elevation: 6,
  },
} as const;

export type ElevationKey = keyof typeof elevation;

// ─── Animation Durations ───────────────────────────────────────────

export const duration = {
  instant: 100,
  fast: 200,
  normal: 300,
  slow: 500,
  emphasis: 700,
} as const;

export type DurationKey = keyof typeof duration;

// ─── Animation Easings ─────────────────────────────────────────────

export const easing = {
  standard: Easing.bezier(0.4, 0.0, 0.2, 1),
  decelerate: Easing.bezier(0.0, 0.0, 0.2, 1),
  accelerate: Easing.bezier(0.4, 0.0, 1, 1),
} as const;

export const springConfig = {
  gentle: { damping: 15, stiffness: 150, mass: 1 },
  snappy: { damping: 20, stiffness: 300, mass: 1 },
  bouncy: { damping: 10, stiffness: 180, mass: 1 },
} as const;

export type SpringConfigKey = keyof typeof springConfig;

// ─── Scrim / Overlay ───────────────────────────────────────────────

export const scrim = {
  light: "rgba(0,0,0,0.5)",
  dark: "rgba(0,0,0,0.5)",
} as const;
