/**
 * CalendarGrid highlight alignment — BLD-3654
 *
 * Headless proxy for the visual finding: "orange highlighting over the calendar
 * date is misaligned slightly to the right" at 390×844 mobile.
 *
 * Root cause: the highlight (today ring + selected/workout bg) was painted
 * directly on the Pressable, which has `width: COLUMN_WIDTH_PCT` (≈14.28% of
 * the grid). On a 390px viewport that column is wider than `cellSize`, so
 * `borderRadius: cellSize/2` produced a pill wider than tall — the circle was
 * no longer centred over the date glyph.
 *
 * Fix (BLD-3654): highlight moved to an inner `View` of exactly
 * `width: cellSize` × `height: cellSize` (`borderRadius: cellSize/2`) that is
 * centred within the full-column-width Pressable. The Pressable keeps its
 * full-width touch target (≥ 48 px) but carries no background/border styling.
 *
 * These tests assert the structural contract of that fix:
 *
 *  1. A highlight View with `width === height === cellSize` and
 *     `borderRadius === cellSize / 2` exists for every rendered day.
 *  2. No outer Pressable carries `backgroundColor` or `borderWidth > 0`
 *     (decoration belongs to the inner View only).
 *  3. The selected day's highlight inner View has `backgroundColor === primary`
 *     at the correct cellSize dimensions.
 *  4. The outer Pressable still uses the full percent column width (touch target
 *     unchanged).
 */

import React from "react";
import { StyleSheet, Pressable, View } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { useSharedValue, useAnimatedStyle } from "react-native-reanimated";
import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../../components/ui/bna-toast";
import CalendarGrid from "../../../components/history/CalendarGrid";
import type { ThemeColors } from "@/hooks/useThemeColors";

// ── Constants ────────────────────────────────────────────────────────────────

const CELL_SIZE = 48;
const COLUMN_WIDTH_PCT = `${100 / 7}%`;

const colors = {
  primary: "#FF6038",
  primaryContainer: "#FF6038",
  onPrimary: "#FFFFFF",
  onBackground: "#111111",
  onSurfaceVariant: "#666666",
} as unknown as ThemeColors;

// April 5, 2026 (Sunday in April 2026, off today's date so isToday=false)
const SELECTED_KEY = "2026-04-05";

// ── Harness ───────────────────────────────────────────────────────────────────

function CalendarHarness({
  selected = null,
  dotMap = new Map(),
}: {
  selected?: string | null;
  dotMap?: Map<string, number>;
}) {
  const sv = useSharedValue(0);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ translateX: sv.value }] }));
  const swipe = Gesture.Pan();
  const ref = React.useRef(null);
  return (
    <CalendarGrid
      colors={colors}
      year={2026}
      month={3}
      dotMap={dotMap}
      scheduleMap={new Map()}
      selected={selected}
      animatedCalendarStyle={animStyle}
      swipeGesture={swipe}
      cellSize={CELL_SIZE}
      scale={1}
      onPrevMonth={() => {}}
      onNextMonth={() => {}}
      onTapDay={() => {}}
      selectedCellRef={ref}
      monthSummary={{ count: 0, totalHours: 0 }}
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CalendarGrid highlight alignment (BLD-3654)", () => {
  /**
   * AC: The highlight inner View is width===cellSize, height===cellSize,
   * borderRadius===cellSize/2. This guarantees a perfect circle regardless of
   * how wide the column is.
   */
  it("inner highlight View has width === cellSize, height === cellSize, borderRadius === cellSize/2", () => {
    const { UNSAFE_getAllByType, unmount } = renderInProviders(<CalendarHarness />);
    const allViews = UNSAFE_getAllByType(View);
    const highlightViews = (allViews as Array<{ props: { style?: unknown } }>).filter((v) => {
      const s = StyleSheet.flatten(v.props.style) as Record<string, unknown> | null;
      return (
        s !== null &&
        s.width === CELL_SIZE &&
        s.height === CELL_SIZE &&
        s.borderRadius === CELL_SIZE / 2
      );
    });
    unmount();
    // April 2026 has 30 days — every day cell must have the highlight inner View.
    expect(highlightViews.length).toBeGreaterThanOrEqual(30);
    const first = StyleSheet.flatten(highlightViews[0].props.style) as Record<string, unknown>;
    expect(first.width).toBe(CELL_SIZE);
    expect(first.height).toBe(CELL_SIZE);
    expect(first.borderRadius).toBe(CELL_SIZE / 2);
  });

  /**
   * AC: No outer Pressable (day touch target) carries a non-transparent
   * backgroundColor. All decoration moved to the inner highlight View.
   */
  it("outer Pressable (day cell) carries no backgroundColor — decoration is on inner View only", () => {
    const { UNSAFE_getAllByType, unmount } = renderInProviders(
      <CalendarHarness selected={SELECTED_KEY} />
    );
    const allPressables = UNSAFE_getAllByType(Pressable);
    // Day cell Pressables are identified by their percent column width.
    const dayPressables = (
      allPressables as Array<{ props: { style?: unknown } }>
    ).filter((p) => {
      const s = StyleSheet.flatten(p.props.style) as Record<string, unknown> | null;
      return typeof s?.width === "string" && String(s.width).endsWith("%");
    });
    const pressablesWithBg = dayPressables.filter((p) => {
      const s = StyleSheet.flatten(p.props.style) as Record<string, unknown> | null;
      return s?.backgroundColor && s.backgroundColor !== "transparent";
    });
    unmount();
    expect(dayPressables.length).toBeGreaterThanOrEqual(30);
    expect(pressablesWithBg.length).toBe(0);
  });

  /**
   * AC: No outer Pressable (day touch target) carries borderWidth > 0.
   * The today-ring moved to the inner highlight View.
   */
  it("outer Pressable (day cell) carries no borderWidth — today ring is on inner View only", () => {
    const { UNSAFE_getAllByType, unmount } = renderInProviders(<CalendarHarness />);
    const allPressables = UNSAFE_getAllByType(Pressable);
    const dayPressables = (
      allPressables as Array<{ props: { style?: unknown } }>
    ).filter((p) => {
      const s = StyleSheet.flatten(p.props.style) as Record<string, unknown> | null;
      return typeof s?.width === "string" && String(s.width).endsWith("%");
    });
    const pressablesWithBorder = dayPressables.filter((p) => {
      const s = StyleSheet.flatten(p.props.style) as Record<string, unknown> | null;
      return (s?.borderWidth as number) > 0;
    });
    unmount();
    expect(pressablesWithBorder.length).toBe(0);
  });

  /**
   * AC: Selected day highlight inner View carries the primary backgroundColor
   * at the correct cellSize dimensions (square circle, not a wider pill).
   */
  it("selected day: inner highlight View has primary backgroundColor at cellSize×cellSize", () => {
    const { UNSAFE_getAllByType, unmount } = renderInProviders(
      <CalendarHarness selected={SELECTED_KEY} />
    );
    const allViews = UNSAFE_getAllByType(View);
    const selectedHighlight = (
      allViews as Array<{ props: { style?: unknown } }>
    ).filter((v) => {
      const s = StyleSheet.flatten(v.props.style) as Record<string, unknown> | null;
      return (
        s !== null &&
        s.width === CELL_SIZE &&
        s.height === CELL_SIZE &&
        s.backgroundColor === colors.primary
      );
    });
    unmount();
    expect(selectedHighlight.length).toBeGreaterThan(0);
    const s = StyleSheet.flatten(selectedHighlight[0].props.style) as Record<string, unknown>;
    // Square: width equals height (the circle is not wider than tall)
    expect(s.width).toBe(s.height);
    expect(s.borderRadius).toBe(CELL_SIZE / 2);
  });

  /**
   * AC: Touch target width unchanged — outer Pressable still uses the full
   * percent column width so tapping works across the entire column.
   */
  it("outer Pressable uses full percent column width for touch target", () => {
    const { UNSAFE_getAllByType, unmount } = renderInProviders(<CalendarHarness />);
    const allPressables = UNSAFE_getAllByType(Pressable);
    const dayPressables = (
      allPressables as Array<{ props: { style?: unknown } }>
    ).filter((p) => {
      const s = StyleSheet.flatten(p.props.style) as Record<string, unknown> | null;
      return typeof s?.width === "string" && String(s.width).endsWith("%");
    });
    unmount();
    // Every day Pressable must use the percent column width.
    expect(dayPressables.length).toBeGreaterThanOrEqual(30);
    for (const p of dayPressables) {
      const s = StyleSheet.flatten(p.props.style) as Record<string, unknown>;
      expect(s.width).toBe(COLUMN_WIDTH_PCT);
    }
  });
});
