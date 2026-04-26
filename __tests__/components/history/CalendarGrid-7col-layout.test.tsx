import React from "react";
import { Gesture } from "react-native-gesture-handler";
import { useSharedValue, useAnimatedStyle } from "react-native-reanimated";
import CalendarGrid from "../../../components/history/CalendarGrid";
import { renderScreen } from "../../helpers/render";
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
  it("renders all 7 weekday header labels (no wrap to a 6+1 layout)", () => {
    const { getByText } = renderScreen(<CalendarHarness cellSize={48} />);
    for (const label of DAYS) {
      expect(getByText(label)).toBeTruthy();
    }
  });

  it("uses percent-based column widths so 7 cells always fit one row", () => {
    const { getByText } = renderScreen(<CalendarHarness cellSize={48} />);
    for (const label of DAYS) {
      const width = findAncestorWithWidth(getByText(label) as unknown as RNNode);
      expect(width).toBe(PERCENT_WIDTH);
    }
  });

  it("date Pressables also use percent-based widths (so day cells align under their weekday header)", () => {
    const { getByText } = renderScreen(<CalendarHarness cellSize={48} />);
    // April 2026 has 30 days. Sample a representative spread of dates.
    for (const day of ["1", "5", "15", "20", "30"]) {
      const width = findAncestorWithWidth(getByText(day) as unknown as RNNode);
      expect(width).toBe(PERCENT_WIDTH);
    }
  });
});
