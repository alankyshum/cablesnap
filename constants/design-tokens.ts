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
  heading: 21,
  h1: 21,
  h2: 18,
  h3: 18,
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

// Interior-style motion tokens. Keep these separate from the legacy tokens
// above: existing screens intentionally depend on their current timings.
export const interiorEase = Easing.bezier(0.23, 1, 0.32, 1);
export const interiorLeave = Easing.bezier(0.4, 0, 1, 1);

export const interiorSpring = {
  cell: { stiffness: 520, damping: 34, mass: 0.45 },
  crossfade: { stiffness: 260, damping: 34, mass: 0.8 },
  small: { stiffness: 700, damping: 46, mass: 0.5 },
  disclose: { stiffness: 150, damping: 27, mass: 1 },
  surface: { stiffness: 420, damping: 36, mass: 0.9 },
  toastSurface: { stiffness: 400, damping: 44, mass: 0.85 },
  progressFill: { stiffness: 210, damping: 34, mass: 0.9 },
  tabIndicator: { stiffness: 620, damping: 42, mass: 0.35 },
} as const;

export const interiorDuration = {
  press: 120,
  tint: 150,
  enter: 220,
  pageEnter: 340,
  exit: 150,
  list: 340,
  disclosure: 280,
  disclosureOpacity: 180,
  select: 200,
  modalBackdrop: 200,
  modalOpacity: 160,
  toastOpacity: 110,
  ripple: 500,
  spinner: 850,
} as const;

export const pressDepth = 2;

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
  heavy: "rgba(0,0,0,0.7)",
} as const;
