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
  primaryForeground: "#1A2138",

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

  // Subtle severity tokens (inline chips/badges — NOT full-width banners)
  successSubtle: "#D1FAE5",
  successSubtleForeground: "#065F46",
  warningSubtle: "#FEF3C7",
  warningSubtleForeground: "#92400E",
  dangerSubtle: "#FEE2E2",
  dangerSubtleForeground: "#991B1B",

  // Recovery heatmap palette (low=recovered, mid=partial, high=fatigued)
  heatmapLow: "#1E88E5",
  heatmapMid: "#FF8F00",
  heatmapHigh: "#D32F2F",
  heatmapBorder: "#9E9E9E",

  // Pacing "Rest" segment — CVD-hardened for tritanopia (BLD-3872).
  //
  // Previously the pacing Rest segment reused `heatmapLow` (#1E88E5 blue), which
  // under Machado-2009 tritanopia simulation collapsed to nearly the same
  // luminance as the Working coral (#FF6038) — W/R contrast dropped to ~1.08:1,
  // making the two segments indistinguishable for blue-yellow CVD users.
  //
  // #08415C is a deep petrol blue that keeps the "Rest = blue" hue identity for
  // full-colour sighted users while lifting Machado tritan W/R contrast to
  // ~3.26:1, and also improves deuteranopia / protanopia / grayscale contrast
  // vs the prior value. Verified in __tests__/theme/pacing-cvd-contrast.test.ts.
  //
  // Kept as a pacing-scoped token (not merged into `heatmapLow`) because
  // RecoveryHeatmap depends on the lighter blue for its 3-step ramp.
  pacingRest: "#08415C",

  // Workout-frequency heatmap solid luminance ramp (BLD-3877, Tritanopia-safe)
  heatmapFreq1: "#90CAF9",
  heatmapFreq2: "#1E88E5",
  heatmapFreq3: "#0A2540",
  // RecordCTA button — CVD-hardened primary for the "Record" action button
  // (BLD-4036, protanopia audit 2026-07-26).
  //
  // The standard `primary` token (#FF6038) uses navy (#1A2138) as foreground.
  // Under protanopia simulation, the coral shifts to ~#80803b (olive) and the
  // navy shifts to ~#202038, reducing text-on-button contrast from 5.30:1 to
  // 3.83:1 — failing WCAG AA.
  //
  // Fix: use a deeper coral (#C03010) with white (#FFFFFF) foreground.
  // Verified contrast ratios (all ≥ 4.5:1):
  //   Normal:      white on #C03010 = 5.72:1  ✅
  //   Protanopia:  white on sim     = 8.03:1  ✅
  //   Deuteranopia:white on sim     = 4.95:1  ✅
  //   Tritanopia:  white on sim     = 5.70:1  ✅
  //
  // Do NOT change these values without re-running the CVD contrast verification
  // in __tests__/theme/record-cta-cvd-contrast.test.ts.
  recordCTAPrimary: "#C03010",
  recordCTAPrimaryForeground: "#FFFFFF",

  // Shadows & overlays
  shadow: "#000000",
  onToast: "#FFFFFF",

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
  primaryForeground: "#1A2138",

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

  // Subtle severity tokens (inline chips/badges — NOT full-width banners)
  successSubtle: "#064E3B",
  successSubtleForeground: "#A7F3D0",
  warningSubtle: "#5C3D00",
  warningSubtleForeground: "#FDE68A",
  dangerSubtle: "#7F1D1D",
  dangerSubtleForeground: "#FECACA",

  // Recovery heatmap palette (low=recovered, mid=partial, high=fatigued)
  heatmapLow: "#42A5F5",
  heatmapMid: "#FFC107",
  heatmapHigh: "#F44336",
  heatmapBorder: "#616161",

  // Pacing "Rest" segment — CVD-hardened for tritanopia (BLD-3872).
  // Dark-theme companion to lightColors.pacingRest. On a dark card background
  // the Rest chip must sit at a *higher* luminance than the coral Working
  // segment (opposite direction from the light theme). #A5F3FC (pale cyan)
  // gives Machado tritan W/R contrast ~2.16:1, up from ~1.09:1 with the prior
  // `heatmapLow` (#42A5F5). Improves deut/prot/grey vs the prior value too.
  pacingRest: "#A5F3FC",

  // Workout-frequency heatmap solid luminance ramp (BLD-3877, Tritanopia-safe)
  heatmapFreq1: "#2196F3",
  heatmapFreq2: "#90CAF9",
  heatmapFreq3: "#E3F2FD",
  // RecordCTA button — CVD-hardened primary for dark mode (BLD-4036).
  //
  // Dark-mode companion to lightColors.recordCTAPrimary.
  // #C02A10 with white (#FFFFFF) foreground passes WCAG AA in all CVD modes:
  //   Normal:      5.87:1  ✅
  //   Protanopia:  8.40:1  ✅
  //   Deuteranopia:5.02:1  ✅
  //   Tritanopia:  5.89:1  ✅
  //
  // Do NOT change without re-running __tests__/theme/record-cta-cvd-contrast.test.ts.
  recordCTAPrimary: "#C02A10",
  recordCTAPrimaryForeground: "#FFFFFF",

  // Shadows & overlays
  shadow: "#000000",
  onToast: "#FFFFFF",

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
