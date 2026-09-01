/**
 * CalendarGrid highlight alignment — BLD-3654
 *
 * Headless proxy for the visual finding: "orange highlighting over the calendar
 * date is misaligned slightly to the right" at 390×844 mobile.
 *
 * Root cause: the highlight (today ring + selected/workout bg) was painted
 * directly on the Pressable, which has width: COLUMN_WIDTH_PCT (~14.28% of
 * the grid). On a 390px viewport that column is wider than cellSize, so
 * borderRadius: cellSize/2 produced a pill wider than tall — the circle was
 * no longer centred over the date glyph.
 *
 * Fix (BLD-3654): highlight moved to an inner View of exactly
 * width: cellSize × height: cellSize (borderRadius: cellSize/2) that is
 * centred within the full-column-width Pressable.
 *
 * Test approach: walks up the React tree from day number Text nodes (same
 * technique as CalendarGrid-7col-layout.test.tsx) to inspect ancestor styles.
 */

import React from "react";
import { Gesture } from "react-native-gesture-handler";
import { useSharedValue, useAnimatedStyle } from "react-native-reanimated";
import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../../components/ui/bna-toast";
import CalendarGrid from "../../../components/history/CalendarGrid";
import type { ThemeColors } from "@/hooks/useThemeColors";

const CELL_SIZE = 48;
const COLUMN_WIDTH_PCT = `${100 / 7}%`;

const colors = {
  primary: "#FF6038",
  primaryContainer: "#FF6038",
  onPrimary: "#FFFFFF",
  onBackground: "#111111",
  onSurfaceVariant: "#666666",
} as unknown as ThemeColors;

// April 5, 2026 (not today, so isToday=false; used as selected to get primary bg)
const SELECTED_KEY = "2026-04-05";

function CalendarHarness({
  selected = null,
}: {
  selected?: string | null;
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
      dotMap={new Map()}
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

// ── Tree traversal helpers ────────────────────────────────────────────────────

type RNNode = { props?: { style?: unknown }; parent: RNNode | null };

function flattenWidth(style: unknown): unknown {
  const arr = Array.isArray(style) ? (style as unknown[]).flat(Infinity) : [style];
  let result: unknown = undefined;
  for (const s of arr) {
    if (s && typeof s === "object" && "width" in (s as object)) {
      result = (s as { width: unknown }).width;
    }
  }
  return result;
}

/** Walk up and return the style of the FIRST ancestor whose flattened style has
 *  a STRING width (percent). Skips ancestors with numeric pixel widths. */
function findPercentWidthAncestorStyle(node: RNNode | null): Record<string, unknown> | null {
  let cur: RNNode | null = node?.parent ?? null;
  while (cur) {
    const w = flattenWidth(cur.props?.style);
    if (typeof w === "string") {
      // Collect all style properties from this node's style
      const arr = Array.isArray(cur.props?.style)
        ? (cur.props!.style as unknown[]).flat(Infinity)
        : [cur.props?.style];
      const merged: Record<string, unknown> = {};
      for (const s of arr) {
        if (s && typeof s === "object") Object.assign(merged, s);
      }
      return merged;
    }
    cur = cur.parent;
  }
  return null;
}

/** Return style props of the FIRST ancestor (numeric or string width). */
function firstAncestorWithWidthStyle(node: RNNode | null): Record<string, unknown> | null {
  let cur: RNNode | null = node?.parent ?? null;
  while (cur) {
    const w = flattenWidth(cur.props?.style);
    if (w !== undefined) {
      const arr = Array.isArray(cur.props?.style)
        ? (cur.props!.style as unknown[]).flat(Infinity)
        : [cur.props?.style];
      const merged: Record<string, unknown> = {};
      for (const s of arr) {
        if (s && typeof s === "object") Object.assign(merged, s);
      }
      return merged;
    }
    cur = cur.parent;
  }
  return null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CalendarGrid highlight alignment (BLD-3654)", () => {
  /**
   * AC: The FIRST ancestor of the date Text with a width property is the inner
   * highlight View. Its width must be numeric cellSize (not a percent string).
   * This proves the day text sits inside the square inner View, not directly
   * in the full-column Pressable.
   */
  it("first width-bearing ancestor of day text has numeric width === cellSize", () => {
    const { getByText, unmount } = renderInProviders(<CalendarHarness />);
    const node = getByText("5") as unknown as RNNode;
    const style = firstAncestorWithWidthStyle(node);
    unmount();
    expect(style).not.toBeNull();
    expect(typeof style!.width).toBe("number");
    expect(style!.width).toBe(CELL_SIZE);
  });

  /**
   * AC: The inner highlight View is square — width equals height equals cellSize.
   * A pill (wider than tall) is impossible when width === height.
   */
  it("inner highlight View is square: width === height === cellSize", () => {
    const { getByText, unmount } = renderInProviders(<CalendarHarness />);
    const node = getByText("5") as unknown as RNNode;
    const style = firstAncestorWithWidthStyle(node);
    unmount();
    expect(style!.width).toBe(CELL_SIZE);
    expect(style!.height).toBe(CELL_SIZE);
    expect(style!.width).toBe(style!.height);
  });

  /**
   * AC: borderRadius on the inner highlight View is cellSize/2 (perfect circle).
   */
  it("inner highlight View has borderRadius === cellSize / 2", () => {
    const { getByText, unmount } = renderInProviders(<CalendarHarness />);
    const node = getByText("5") as unknown as RNNode;
    const style = firstAncestorWithWidthStyle(node);
    unmount();
    expect(style!.borderRadius).toBe(CELL_SIZE / 2);
  });

  /**
   * AC: The outer touch target retains the full percent column width.
   * Touch behavior is unchanged — the Pressable still spans the whole column.
   */
  it("outer touch target retains full percent column width", () => {
    const { getByText, unmount } = renderInProviders(<CalendarHarness />);
    const node = getByText("5") as unknown as RNNode;
    const style = findPercentWidthAncestorStyle(node);
    unmount();
    expect(style).not.toBeNull();
    expect(style!.width).toBe(COLUMN_WIDTH_PCT);
  });

  /**
   * AC: The outer touch target carries no backgroundColor — the selection
   * background and today ring are entirely on the inner square View.
   */
  it("outer touch target has no backgroundColor", () => {
    const { getByText, unmount } = renderInProviders(
      <CalendarHarness selected={SELECTED_KEY} />
    );
    const node = getByText("5") as unknown as RNNode;
    const style = findPercentWidthAncestorStyle(node);
    unmount();
    expect(style).not.toBeNull();
    const bg = style!.backgroundColor;
    // The outer Pressable must not carry a non-transparent background color.
    expect(bg == null || bg === "transparent" || bg === undefined).toBe(true);
  });

  /**
   * AC: The selected day's inner highlight View has primary backgroundColor —
   * the color is on the square View so the circle is centred over the date glyph.
   */
  it("selected day inner highlight View has primary backgroundColor", () => {
    const { getByText, unmount } = renderInProviders(
      <CalendarHarness selected={SELECTED_KEY} />
    );
    const node = getByText("5") as unknown as RNNode;
    const style = firstAncestorWithWidthStyle(node);
    unmount();
    expect(style!.backgroundColor).toBe(colors.primary);
  });

  /**
   * AC: The outer touch target has no borderWidth > 0. The today ring (if any)
   * belongs to the inner highlight View only.
   */
  it("outer touch target has no borderWidth > 0", () => {
    const { getByText, unmount } = renderInProviders(<CalendarHarness />);
    const node = getByText("5") as unknown as RNNode;
    const style = findPercentWidthAncestorStyle(node);
    unmount();
    expect(style).not.toBeNull();
    const bw = style!.borderWidth as number | undefined;
    expect(bw == null || bw === 0).toBe(true);
  });
});
