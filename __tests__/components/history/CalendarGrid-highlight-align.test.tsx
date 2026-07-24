/**
 * CalendarGrid highlight alignment — BLD-3654
 *
 * Headless proxy for the visual finding: "orange highlighting over the calendar
 * date is misaligned slightly to the right" at 390×844 mobile.
 *
 * Root cause: the highlight (today ring + selected/workout bg) was painted
 * directly on the Pressable, which has width: COLUMN_WIDTH_PCT (≈14.28% of
 * the grid). On a 390px viewport that column is wider than cellSize, so
 * borderRadius: cellSize/2 produced a pill wider than tall — the circle was
 * no longer centred over the date glyph.
 *
 * Fix (BLD-3654): highlight moved to an inner View of exactly
 * width: cellSize × height: cellSize (borderRadius: cellSize/2) that is
 * centred within the full-column-width Pressable.
 *
 * Test approach: walks up the React tree from day number Text nodes (same
 * technique as CalendarGrid-7col-layout.test.tsx) to inspect parent styles.
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

// April 5, 2026 (not today, so isToday=false; selected to get primary bg)
const SELECTED_KEY = "2026-04-05";

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

// ── Tree traversal helpers (same technique as CalendarGrid-7col-layout.test.tsx) ─

type StyleObj = Record<string, unknown>;
type RNNode = { props?: { style?: unknown }; parent: RNNode | null };

function flattenStyle(style: unknown): StyleObj {
  const { StyleSheet } = require("react-native");
  const result = StyleSheet.flatten(style);
  return (result && typeof result === "object" ? result : {}) as StyleObj;
}

/** Walk up from node, returning the style of the first ancestor. */
function parentStyle(node: RNNode | null): StyleObj {
  return node?.parent ? flattenStyle(node.parent.props?.style) : {};
}

/** Walk up, returning the style of the grandparent. */
function grandparentStyle(node: RNNode | null): StyleObj {
  return node?.parent?.parent ? flattenStyle(node.parent.parent.props?.style) : {};
}

/** Walk up and return the first ancestor whose style has a string (percent) width. */
function findPercentWidthAncestor(node: RNNode | null): StyleObj | null {
  let cur = node?.parent ?? null;
  while (cur) {
    const s = flattenStyle(cur.props?.style);
    if (typeof s.width === "string") return s;
    cur = cur.parent;
  }
  return null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CalendarGrid highlight alignment (BLD-3654)", () => {
  /**
   * AC: The direct parent of the date Text is the inner highlight View with
   * width === cellSize and height === cellSize (square, not full column width).
   * This guarantees the circle is never wider than tall.
   */
  it("direct parent of day text has numeric width === cellSize (not percent column width)", () => {
    const { getByText, unmount } = renderInProviders(<CalendarHarness />);
    // "5" is April 5, always present in April 2026.
    const node = getByText("5") as unknown as RNNode;
    const pStyle = parentStyle(node);
    unmount();
    // Must be numeric cellSize, not a percent string.
    expect(typeof pStyle.width).toBe("number");
    expect(pStyle.width).toBe(CELL_SIZE);
  });

  /**
   * AC: The inner highlight View is a perfect square — width equals height.
   * A pill (wider than tall) would shift the ring off-centre.
   */
  it("inner highlight View is square: width === height === cellSize", () => {
    const { getByText, unmount } = renderInProviders(<CalendarHarness />);
    const node = getByText("5") as unknown as RNNode;
    const pStyle = parentStyle(node);
    unmount();
    expect(pStyle.width).toBe(CELL_SIZE);
    expect(pStyle.height).toBe(CELL_SIZE);
    expect(pStyle.width).toBe(pStyle.height);
  });

  /**
   * AC: borderRadius on the inner highlight View is cellSize/2 (perfect circle).
   */
  it("inner highlight View has borderRadius === cellSize / 2", () => {
    const { getByText, unmount } = renderInProviders(<CalendarHarness />);
    const node = getByText("5") as unknown as RNNode;
    const pStyle = parentStyle(node);
    unmount();
    expect(pStyle.borderRadius).toBe(CELL_SIZE / 2);
  });

  /**
   * AC: The outer touch target (grandparent of the date text, or nearest percent-
   * width ancestor) retains the full percent column width — touch target unchanged.
   */
  it("outer touch target retains full percent column width", () => {
    const { getByText, unmount } = renderInProviders(<CalendarHarness />);
    const node = getByText("5") as unknown as RNNode;
    const ancestorStyle = findPercentWidthAncestor(node);
    unmount();
    expect(ancestorStyle).not.toBeNull();
    expect(ancestorStyle?.width).toBe(COLUMN_WIDTH_PCT);
  });

  /**
   * AC: The outer touch target carries no backgroundColor — decoration (selected
   * bg, workout tint) lives only on the inner highlight View.
   */
  it("outer touch target has no backgroundColor — background is on inner View only", () => {
    const { getByText, unmount } = renderInProviders(
      <CalendarHarness selected={SELECTED_KEY} />
    );
    // "5" is selected (SELECTED_KEY = 2026-04-05).
    const node = getByText("5") as unknown as RNNode;
    const ancestorStyle = findPercentWidthAncestor(node);
    unmount();
    expect(ancestorStyle).not.toBeNull();
    // The outer touch target must NOT have the primary color background.
    const bg = ancestorStyle?.backgroundColor;
    expect(bg == null || bg === "transparent").toBe(true);
  });

  /**
   * AC: The selected day inner highlight View has primary backgroundColor — the
   * color is painted on the inner square View so the filled circle is centred.
   */
  it("selected day: inner highlight View has primary backgroundColor", () => {
    const { getByText, unmount } = renderInProviders(
      <CalendarHarness selected={SELECTED_KEY} />
    );
    const node = getByText("5") as unknown as RNNode;
    const pStyle = parentStyle(node);
    unmount();
    expect(pStyle.backgroundColor).toBe(colors.primary);
  });

  /**
   * AC: Outer touch target has no borderWidth > 0 — the today ring (if any)
   * is on the inner highlight View, not the outer Pressable.
   */
  it("outer touch target has no borderWidth > 0", () => {
    const { getByText, unmount } = renderInProviders(<CalendarHarness />);
    const node = getByText("5") as unknown as RNNode;
    const ancestorStyle = findPercentWidthAncestor(node);
    unmount();
    expect(ancestorStyle).not.toBeNull();
    const bw = (ancestorStyle?.borderWidth as number) ?? 0;
    expect(bw).toBe(0);
  });
});
