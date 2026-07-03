import React from "react";
import { Gesture } from "react-native-gesture-handler";
import { useSharedValue, useAnimatedStyle } from "react-native-reanimated";
import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../../components/ui/bna-toast";
import CalendarGrid from "../../../components/history/CalendarGrid";
import { DAYS } from "../../../lib/format";
import { radii } from "../../../constants/design-tokens";
import type { ThemeColors } from "@/hooks/useThemeColors";

const colors = {
  primary: "#000",
  surface: "#fff",
  onSurface: "#000",
  onSurfaceVariant: "#666",
  onBackground: "#000",
  background: "#fff",
  error: "#f00",
} as unknown as ThemeColors;

function CalendarHarness({ cellSize, dotMap = new Map() }: { cellSize: number; dotMap?: Map<string, number> }) {
  const sv = useSharedValue(0);
  const animatedCalendarStyle = useAnimatedStyle(() => ({ transform: [{ translateX: sv.value }] }));
  const swipeGesture = Gesture.Pan();
  const ref = React.useRef(null);
  return (
    <CalendarGrid
      colors={colors}
      year={2026}
      month={3}
      dotMap={dotMap}
      scheduleMap={new Map()}
      selected={null}
      animatedCalendarStyle={animatedCalendarStyle}
      swipeGesture={swipeGesture}
      cellSize={cellSize}
      scale={1}
      onPrevMonth={() => {}}
      onNextMonth={() => {}}
      onTapDay={() => {}}
      selectedCellRef={ref}
      monthSummary={{ count: 0, totalHours: 0 }}
    />
  );
}

const PERCENT_WIDTH = `${100 / 7}%`;

function flattenWidth(style: unknown): unknown {
  const arr = Array.isArray(style) ? style.flat(Infinity) : [style];
  let result: unknown = undefined;
  for (const s of arr) {
    if (s && typeof s === "object" && "width" in (s as object)) {
      result = (s as { width: unknown }).width;
    }
  }
  return result;
}

type RNNode = { props: { style?: unknown }; parent: RNNode | null };

function findAncestorWithWidth(node: RNNode | null): unknown {
  let cur: RNNode | null = node;
  while (cur) {
    const w = flattenWidth(cur.props?.style);
    if (w !== undefined) return w;
    cur = cur.parent;
  }
  return undefined;
}

describe("CalendarGrid 7-column layout (BLD-661)", () => {
  // BLD-817 perf (Path 2): All three tests are read-only assertions against
  // the same CalendarGrid output. Render once in beforeAll, capture every
  // label/date width into Maps, then unmount immediately. Each `it` block
  // asserts against the captured Maps — no live tree access required, so
  // CI's react-test-renderer cross-test unmount can't bite us. Cuts wall-
  // clock from ~6.7s to ~2.5s — the bulk was three full mounts of
  // CalendarGrid + reanimated + gesture-handler.
  const SAMPLE_DATES = ["1", "5", "15", "20", "30"] as const;
  const labelFound = new Map<string, boolean>();
  const labelWidth = new Map<string, unknown>();
  const dateWidth = new Map<string, unknown>();

  beforeAll(() => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { getByText, unmount } = render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <CalendarHarness cellSize={48} />
        </ToastProvider>
      </QueryClientProvider>
    );
    try {
      for (const label of DAYS) {
        const node = getByText(label) as unknown as RNNode;
        labelFound.set(label, !!node);
        labelWidth.set(label, findAncestorWithWidth(node));
      }
      for (const day of SAMPLE_DATES) {
        const node = getByText(day) as unknown as RNNode;
        dateWidth.set(day, findAncestorWithWidth(node));
      }
    } finally {
      unmount();
    }
  });

  it("renders all 7 weekday header labels (no wrap to a 6+1 layout)", () => {
    for (const label of DAYS) {
      expect(labelFound.get(label)).toBe(true);
    }
  });

  it("uses percent-based column widths so 7 cells always fit one row", () => {
    for (const label of DAYS) {
      expect(labelWidth.get(label)).toBe(PERCENT_WIDTH);
    }
  });

  it("date Pressables also use percent-based widths (so day cells align under their weekday header)", () => {
    // April 2026 has 30 days. Sample a representative spread of dates.
    for (const day of SAMPLE_DATES) {
      expect(dateWidth.get(day)).toBe(PERCENT_WIDTH);
    }
  });
});

// ─── BLD-2747: dot size legibility ───────────────────────────────────────────

describe("CalendarGrid dot indicator size (BLD-2747)", () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  // April 2026: day 1 is a Wednesday (offset 3). Use deterministic days:
  // day 5 → count=1 (1 dot), day 6 → count=2 (2 dots), day 7 → count=3 (badge).
  const dotMap = new Map([
    ["2026-04-05", 1],
    ["2026-04-06", 2],
    ["2026-04-07", 3],
  ]);

  type ViewNode = { props: { style?: unknown } };
  let dotViews: ViewNode[] = [];
  let badgeText: string | undefined;

  beforeAll(() => {
    const { StyleSheet, View } = require("react-native");
    const { UNSAFE_getAllByType, getByText, unmount } = render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <CalendarHarness cellSize={48} dotMap={dotMap} />
        </ToastProvider>
      </QueryClientProvider>
    );

    const allViews = UNSAFE_getAllByType(View) as ViewNode[];
    dotViews = allViews.filter((v) => {
      const s = StyleSheet.flatten(v.props.style) as { width?: number; height?: number } | null;
      return s != null && s.width === 7 && s.height === 7;
    });

    try { badgeText = getByText("3").children[0] as string; } catch { badgeText = undefined; }

    unmount();
  });

  it("dot style width and height are 7px (enlarged from 5px for legibility)", () => {
    expect(dotViews.length).toBeGreaterThanOrEqual(1);
    const { StyleSheet } = require("react-native");
    const dotStyle = StyleSheet.flatten(dotViews[0].props.style) as { width?: number; height?: number; borderRadius?: number };
    expect(dotStyle.width).toBe(7);
    expect(dotStyle.height).toBe(7);
  });

  it("dot borderRadius is radii.pill (9999) so it stays a perfect circle", () => {
    const { StyleSheet } = require("react-native");
    const dotStyle = StyleSheet.flatten(dotViews[0].props.style) as { borderRadius?: number };
    expect(dotStyle.borderRadius).toBe(radii.pill);
  });

  it("renders 1 dot View for count=1 and 2 dot Views for count=2 (total >= 3)", () => {
    // count=1 day contributes 1 dot, count=2 day contributes 2 → combined ≥ 3
    expect(dotViews.length).toBeGreaterThanOrEqual(3);
  });

  it("renders a numeric count badge (not dots) for count >= 3", () => {
    // Badge text "3" is present
    expect(badgeText).toBe("3");
    // No extra dot Views from the count=3 day — exactly 3 (1+2) dot Views total
    expect(dotViews.length).toBe(3);
  });

  it("renders no 7px dot Views when dotMap is empty (count=0)", () => {
    const { StyleSheet, View } = require("react-native");
    const { UNSAFE_getAllByType, unmount } = render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <CalendarHarness cellSize={48} dotMap={new Map()} />
        </ToastProvider>
      </QueryClientProvider>
    );
    const allViews = UNSAFE_getAllByType(View) as ViewNode[];
    const emptyDotViews = allViews.filter((v) => {
      const s = StyleSheet.flatten(v.props.style) as { width?: number; height?: number } | null;
      return s != null && s.width === 7 && s.height === 7;
    });
    expect(emptyDotViews.length).toBe(0);
    unmount();
  });
});
