import React from "react";
import { Gesture } from "react-native-gesture-handler";
import { useSharedValue, useAnimatedStyle } from "react-native-reanimated";
import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../../components/ui/bna-toast";
import CalendarGrid from "../../../components/history/CalendarGrid";
import { DAYS } from "../../../lib/format";
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

function CalendarHarness({ cellSize }: { cellSize: number }) {
  const sv = useSharedValue(0);
  const animatedCalendarStyle = useAnimatedStyle(() => ({ transform: [{ translateX: sv.value }] }));
  const swipeGesture = Gesture.Pan();
  const ref = React.useRef(null);
  return (
    <CalendarGrid
      colors={colors}
      year={2026}
      month={3}
      dotMap={new Map()}
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
