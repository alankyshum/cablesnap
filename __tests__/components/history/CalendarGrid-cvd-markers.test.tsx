/**
 * CVD-safe calendar workout markers — headless verification (BLD-2742)
 *
 * Acceptance criteria proxied here (per issue spec):
 *
 * 1. Unselected workout dots include a non-zero borderWidth and a borderColor
 *    derived from colors.onBackground (NOT colors.primary). This proves a
 *    luminance channel exists independent of coral hue — satisfying WCAG 1.4.1.
 *
 * 2. The 3+ count badge, when unselected, has the same border treatment.
 *
 * 3. Selected state dots/badges are NOT given the border (already CVD-safe as
 *    navy-on-coral — do not alter selected appearance).
 *
 * 4. The border token (colors.onBackground) contrasts ≥ 3:1 with the light
 *    cell background (#FAFAFA) — the WCAG large-graphic threshold — in both
 *    light and dark modes.
 *
 * 5. No hex literals are used for borderColor — the value matches the live
 *    theme token (proving token-driven, not hardcoded).
 *
 * These five assertions cover the three "headless proxies" listed in the
 * issue AC table.
 */

import React from "react";
import { Gesture } from "react-native-gesture-handler";
import { useSharedValue, useAnimatedStyle } from "react-native-reanimated";
import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../../components/ui/bna-toast";
import CalendarGrid from "../../../components/history/CalendarGrid";
import { lightColors, darkColors } from "../../../theme/colors";
import type { ThemeColors } from "@/hooks/useThemeColors";

// ---------------------------------------------------------------------------
// WCAG 2.1 contrast ratio helpers (identical to primary-contrast.test.ts)
// ---------------------------------------------------------------------------

function toLinear(channel8bit: number): number {
  const sRGB = channel8bit / 255;
  return sRGB <= 0.04045 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const h = hex.replace(/^#/, "");
  if (h.length !== 6) {
    throw new Error(`relativeLuminance: expected 6-digit hex, got "${hex}"`);
  }
  const r = toLinear(parseInt(h.slice(0, 2), 16));
  const g = toLinear(parseInt(h.slice(2, 4), 16));
  const b = toLinear(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Theme color maps (light and dark) — built from real exported tokens
// ---------------------------------------------------------------------------

/** Produces a ThemeColors object matching useThemeColors() for the given mode. */
function makeColors(mode: "light" | "dark"): ThemeColors {
  const t = mode === "dark" ? darkColors : lightColors;
  // We only need the tokens referenced by CalendarGrid. Mirror useThemeColors.ts.
  return {
    primary: t.primary,
    onPrimary: t.primaryForeground,
    primaryContainer: t.accent,
    onPrimaryContainer: t.accentForeground,
    secondary: t.secondary,
    onSecondary: t.secondaryForeground,
    secondaryContainer: t.muted,
    onSecondaryContainer: t.foreground,
    tertiary: t.orange ?? "#F59E0B",
    tertiaryContainer: mode === "dark" ? "#5C3D00" : "#FFF0D1",
    onTertiaryContainer: mode === "dark" ? "#FFF0D1" : "#5C3D00",
    surface: t.card,
    surfaceAlt: mode === "dark" ? "#1A1F26" : "#F2F4F7",
    surfaceVariant: t.muted,
    onSurface: t.foreground,
    onSurfaceVariant: t.mutedForeground,
    background: t.background,
    onBackground: t.foreground,
    surfaceDisabled: t.muted,
    onSurfaceDisabled: t.mutedForeground,
    error: t.destructive,
    onError: t.destructiveForeground,
    errorContainer: mode === "dark" ? "#7F1D1D" : "#FEE2E2",
    onErrorContainer: mode === "dark" ? "#FEE2E2" : "#7F1D1D",
    outline: t.border,
    outlineVariant: mode === "dark" ? "#21262D" : "#E5E7EB",
    elevation: { level0: t.background, level1: t.card, level2: t.card, level3: t.card, level4: t.card, level5: t.card },
    shadow: "#000000",
    scrim: "rgba(0,0,0,0.5)",
    inverseSurface: mode === "dark" ? t.background : "#1A2138",
    inverseOnSurface: mode === "dark" ? t.foreground : "#FFFFFF",
    inversePrimary: mode === "dark" ? "#FF6038" : "#FF7A55",
    text: t.text,
    disabled: t.mutedForeground,
    placeholder: t.mutedForeground,
    backdrop: "rgba(0,0,0,0.5)",
    notification: t.red ?? "#EF4444",
    card: t.card,
    heatmapLow: t.heatmapLow,
    heatmapMid: t.heatmapMid,
    heatmapHigh: t.heatmapHigh,
    heatmapBorder: t.heatmapBorder,
  } as ThemeColors;
}

// ---------------------------------------------------------------------------
// Render harness
// ---------------------------------------------------------------------------

interface HarnessProps {
  colors: ThemeColors;
  /** dotMap entry count for the tested day (April 5, 2026) */
  count: number;
  /** Whether April 5 is the selected day */
  selected: string | null;
}

function CalendarHarness({ colors, count, selected }: HarnessProps) {
  const sv = useSharedValue(0);
  const animatedCalendarStyle = useAnimatedStyle(() => ({ transform: [{ translateX: sv.value }] }));
  const swipeGesture = Gesture.Pan();
  const ref = React.useRef(null);

  // April 5, 2026 is a Sunday — easy to locate via accessibilityLabel
  const dotMap = new Map<string, number>([["2026-04-05", count]]);

  return (
    <CalendarGrid
      colors={colors}
      year={2026}
      month={3} // April (0-indexed)
      dotMap={dotMap}
      scheduleMap={new Map()}
      selected={selected}
      animatedCalendarStyle={animatedCalendarStyle}
      swipeGesture={swipeGesture}
      cellSize={48}
      scale={1}
      onPrevMonth={() => {}}
      onNextMonth={() => {}}
      onTapDay={() => {}}
      selectedCellRef={ref}
      monthSummary={{ count, totalHours: 0 }}
    />
  );
}

function renderInProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Helper: recursively collect all style arrays from a subtree
// ---------------------------------------------------------------------------
type AnyNode = {
  props?: { style?: unknown; testID?: string };
  children?: AnyNode | AnyNode[];
};

function collectStyles(node: AnyNode): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];
  if (!node) return results;
  if (node.props?.style) {
    const styleArr = Array.isArray(node.props.style)
      ? node.props.style.flat(Infinity)
      : [node.props.style];
    for (const s of styleArr) {
      if (s && typeof s === "object") {
        results.push(s as Record<string, unknown>);
      }
    }
  }
  const kids = node.children;
  if (kids) {
    const arr = Array.isArray(kids) ? kids : [kids];
    for (const child of arr) {
      results.push(...collectStyles(child as AnyNode));
    }
  }
  return results;
}

/** Merge all style objects for a tree node (later wins — same as RN StyleSheet.flatten). */
function mergeStyles(node: AnyNode): Record<string, unknown> {
  const all = collectStyles(node);
  return Object.assign({}, ...all);
}

// ---------------------------------------------------------------------------
// AC1 + AC3: Unselected dots / badge — non-zero borderWidth + correct token
// ---------------------------------------------------------------------------

describe("CalendarGrid history — CVD-safe dot markers (BLD-2742)", () => {
  describe("AC1: unselected single-dot (count=1) has luminance-contrasting border", () => {
    let merged: Record<string, unknown>;
    let lightOnBackground: string;

    beforeAll(() => {
      const colors = makeColors("light");
      lightOnBackground = colors.onBackground as string;
      const { getByLabelText, unmount } = renderInProviders(
        <CalendarHarness colors={colors} count={1} selected={null} />
      );
      try {
        const cell = getByLabelText(/5 April.*1 workout/i) as unknown as AnyNode;
        merged = mergeStyles(cell);
      } finally {
        unmount();
      }
    });

    it("dot has a non-zero borderWidth", () => {
      // The merged style object will contain `borderWidth` from the dotBorder style.
      expect(merged.borderWidth).toBeDefined();
      expect(Number(merged.borderWidth)).toBeGreaterThan(0);
    });

    it("dot borderColor equals colors.onBackground (not colors.primary)", () => {
      // borderColor must NOT be the coral primary — it must be the dark foreground token
      // so the marker has luminance contrast, not just hue contrast.
      expect(merged.borderColor).toBe(lightOnBackground);
      expect(merged.borderColor).not.toBe(lightColors.primary);
    });

    it("borderColor contrasts ≥ 3:1 with the light cell background (#FAFAFA) — WCAG large-graphic threshold", () => {
      const ratio = contrastRatio(lightOnBackground, lightColors.background);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });
  });

  describe("AC1: unselected two-dot (count=2) — both dots have luminance-contrasting border", () => {
    let firstDotMerged: Record<string, unknown>;
    let secondDotMerged: Record<string, unknown>;
    let lightOnBackground: string;

    beforeAll(() => {
      const colors = makeColors("light");
      lightOnBackground = colors.onBackground as string;
      const { getByLabelText, unmount } = renderInProviders(
        <CalendarHarness colors={colors} count={2} selected={null} />
      );
      try {
        const cell = getByLabelText(/5 April.*2 workouts/i) as unknown as AnyNode;
        const styleObjects = collectStyles(cell);
        // Find style objects that have a non-transparent borderColor — these belong to dots.
        // (The cell itself carries borderColor: "transparent" when it's not today.)
        const borderedDots = styleObjects.filter(
          (s) => "borderColor" in s && s.borderColor !== "transparent" && s.borderColor !== undefined
        );
        firstDotMerged = borderedDots[0] ?? {};
        secondDotMerged = borderedDots[1] ?? {};
      } finally {
        unmount();
      }
    });

    it("first dot has borderColor matching colors.onBackground", () => {
      expect(firstDotMerged.borderColor).toBe(lightOnBackground);
    });

    it("second dot has borderColor matching colors.onBackground", () => {
      expect(secondDotMerged.borderColor).toBe(lightOnBackground);
    });
  });

  describe("AC2: unselected count badge (count=3) has luminance-contrasting border", () => {
    let merged: Record<string, unknown>;
    let lightOnBackground: string;

    beforeAll(() => {
      const colors = makeColors("light");
      lightOnBackground = colors.onBackground as string;
      const { getByLabelText, unmount } = renderInProviders(
        <CalendarHarness colors={colors} count={3} selected={null} />
      );
      try {
        const cell = getByLabelText(/5 April.*3 workouts/i) as unknown as AnyNode;
        merged = mergeStyles(cell);
      } finally {
        unmount();
      }
    });

    it("count badge has a non-zero borderWidth", () => {
      expect(merged.borderWidth).toBeDefined();
      expect(Number(merged.borderWidth)).toBeGreaterThan(0);
    });

    it("count badge borderColor equals colors.onBackground (not colors.primary)", () => {
      expect(merged.borderColor).toBe(lightOnBackground);
      expect(merged.borderColor).not.toBe(lightColors.primary);
    });
  });

  describe("AC3: selected-day dots/badge have NO extra border (already CVD-safe)", () => {
    const SELECTED_KEY = "2026-04-05";

    it("selected single dot does not have a borderColor from onBackground", () => {
      const colors = makeColors("light");
      const { getByLabelText, unmount } = renderInProviders(
        <CalendarHarness colors={colors} count={1} selected={SELECTED_KEY} />
      );
      try {
        const cell = getByLabelText(/5 April.*1 workout/i) as unknown as AnyNode;
        const styleObjects = collectStyles(cell);
        // No style object in the selected dot should carry borderColor = onBackground
        const hasCVDBorder = styleObjects.some(
          (s) => s.borderColor === colors.onBackground
        );
        expect(hasCVDBorder).toBe(false);
      } finally {
        unmount();
      }
    });

    it("selected count badge (count=3) does not have a borderColor from onBackground", () => {
      const colors = makeColors("light");
      const { getByLabelText, unmount } = renderInProviders(
        <CalendarHarness colors={colors} count={3} selected={SELECTED_KEY} />
      );
      try {
        const cell = getByLabelText(/5 April.*3 workouts/i) as unknown as AnyNode;
        const styleObjects = collectStyles(cell);
        const hasCVDBorder = styleObjects.some(
          (s) => s.borderColor === colors.onBackground
        );
        expect(hasCVDBorder).toBe(false);
      } finally {
        unmount();
      }
    });
  });

  describe("AC4 (dark mode): dot border token is colors.onBackground for dark theme", () => {
    let merged: Record<string, unknown>;
    let darkOnBackground: string;

    beforeAll(() => {
      const colors = makeColors("dark");
      darkOnBackground = colors.onBackground as string;
      const { getByLabelText, unmount } = renderInProviders(
        <CalendarHarness colors={colors} count={1} selected={null} />
      );
      try {
        const cell = getByLabelText(/5 April.*1 workout/i) as unknown as AnyNode;
        merged = mergeStyles(cell);
      } finally {
        unmount();
      }
    });

    it("dark mode dot borderColor equals dark colors.onBackground", () => {
      expect(merged.borderColor).toBe(darkOnBackground);
    });

    it("dark onBackground contrasts ≥ 3:1 with the dark cell background (#0D1117)", () => {
      const ratio = contrastRatio(darkOnBackground, darkColors.background);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });

    it("dark mode uses the theme token, not a hardcoded hex", () => {
      // The borderColor must equal the live darkColors.foreground value (what
      // onBackground resolves to). If someone hardcodes a hex and the token
      // later changes, this assertion will catch the drift.
      expect(merged.borderColor).toBe(darkColors.foreground);
    });
  });

  describe("AC5: zero-workout days have no dot/border artifacts", () => {
    it("a day with count=0 renders no element containing borderWidth from dotBorder", () => {
      const colors = makeColors("light");
      const { getAllByLabelText, unmount } = renderInProviders(
        <CalendarHarness colors={colors} count={0} selected={null} />
      );
      try {
        // April 5 with count=0 is a rest day — but many days match /rest day/,
        // so use getAllByLabelText and pick the one for April 5.
        const restDays = getAllByLabelText(/rest day/i) as unknown as AnyNode[];
        // The accessibility label for April 5 is "5 April 2026, rest day"
        const cell = restDays.find((n: AnyNode) => {
          const label = (n as unknown as { props: { accessibilityLabel?: string } }).props?.accessibilityLabel ?? "";
          return /\b5\b/.test(label);
        }) ?? restDays[0];
        const styleObjects = collectStyles(cell);
        // No style with BOTH borderWidth > 0 AND borderColor = onBackground should exist.
        const hasDotBorder = styleObjects.some(
          (s) =>
            "borderColor" in s &&
            s.borderColor === colors.onBackground &&
            "borderWidth" in s &&
            Number(s.borderWidth) > 0
        );
        expect(hasDotBorder).toBe(false);
      } finally {
        unmount();
      }
    });
  });
});
