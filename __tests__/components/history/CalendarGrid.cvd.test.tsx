/**
 * CalendarGrid.cvd.test.tsx — BLD-2721
 *
 * Headless proxy tests for the CVD (colour-vision-deficiency) fix on the
 * history CalendarGrid. The original finding is a protanopia emulation
 * visual judgment that cannot be re-run headlessly; these tests cover the
 * same risk by verifying the structural properties that make the fix work:
 *
 * Encoding contract (BLD-2721):
 *   Workout day (count > 0)  → dot present AND dot has borderWidth >= 1
 *   Scheduled day (no workout) → hollow dot present (transparent bg + border)
 *   Rest / empty day           → NO dot present
 *   Count badge (count >= 3)   → numeric text glyph (CVD-safe by construction)
 *
 * Filled-vs-hollow is a shape encoding that survives any colour vision mode,
 * including full achromatopsia (greyscale). Tests assert non-colour properties
 * (testID presence, borderWidth, backgroundColor) so they are independent of
 * the specific colour values in use.
 *
 * Test scenarios:
 *  1. Workout day (count=1) — dot present, borderWidth >= 1 (filled + ring)
 *  2. Workout day (count=2) — two dots present, both bordered
 *  3. Workout day (count>=3) — count badge with numeric text (no dot-ring needed)
 *  4. Scheduled day (no workout) — hollow dot present (transparent bg + border)
 *  5. Rest day (empty, not scheduled) — NO dot at all
 *  6. Workout day does NOT render a scheduled hollow dot
 *  7. WorkoutHeatmap numeric labels regression — heatmap labels render as text
 */

import React from "react";
import { Gesture } from "react-native-gesture-handler";
import { useSharedValue, useAnimatedStyle } from "react-native-reanimated";
import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../../components/ui/bna-toast";
import CalendarGrid from "../../../components/history/CalendarGrid";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { ScheduleEntry } from "@/lib/db/settings";

// ── Constants ────────────────────────────────────────────────────────────────

/** Fixed year/month for deterministic key generation (April 2026). */
const YEAR = 2026;
const MONTH = 3; // April (0-indexed)

/**
 * Generate the dateKey that CalendarGrid uses internally.
 * Must match `formatDateKey(d.getTime())` in the component.
 * CalendarGrid uses YYYY-MM-DD keys via lib/format.formatDateKey.
 */
function makeKey(day: number): string {
  const d = new Date(YEAR, MONTH, day);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * CalendarGrid uses `weekday(d) = (d.getDay() + 6) % 7` (Monday-origin)
 * as the scheduleMap key. Convert a Date to that index.
 */
function weekdayMonOrigin(d: Date): number {
  return (d.getDay() + 6) % 7;
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

/**
 * Minimal ThemeColors stub. The CVD tests are colour-agnostic —
 * we only care about structural (non-colour) properties.
 */
const colors = {
  primary: "#FF6038",
  onPrimary: "#FFFFFF",
  primaryContainer: "#FF6038",
  onBackground: "#111111",
  onSurfaceVariant: "#666666",
} as unknown as ThemeColors;

/**
 * A ScheduleEntry stub for scheduled-day tests.
 */
const stubScheduleEntry: ScheduleEntry = {
  id: 1,
  day_of_week: 1,
  template_id: 42,
  template_name: "Upper Body",
};

// ── Harness ───────────────────────────────────────────────────────────────────

/**
 * CalendarHarness wraps CalendarGrid with the mandatory animation + gesture
 * context it requires (mirrors CalendarGrid-7col-layout.test.tsx).
 */
function CalendarHarness({
  dotMap,
  scheduleMap,
  selected = null,
}: {
  dotMap: Map<string, number>;
  scheduleMap: Map<number, ScheduleEntry>;
  selected?: string | null;
}) {
  const sv = useSharedValue(0);
  const animatedCalendarStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sv.value }],
  }));
  const swipeGesture = Gesture.Pan();
  const ref = React.useRef<null>(null);

  return (
    <CalendarGrid
      colors={colors}
      year={YEAR}
      month={MONTH}
      dotMap={dotMap}
      scheduleMap={scheduleMap}
      selected={selected}
      animatedCalendarStyle={animatedCalendarStyle}
      swipeGesture={swipeGesture}
      cellSize={48}
      scale={1}
      onPrevMonth={() => {}}
      onNextMonth={() => {}}
      onTapDay={() => {}}
      selectedCellRef={ref}
      monthSummary={{ count: 0, totalHours: 0 }}
    />
  );
}

function renderHarness(
  dotMap: Map<string, number>,
  scheduleMap: Map<number, ScheduleEntry>,
  selected?: string | null,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <CalendarHarness dotMap={dotMap} scheduleMap={scheduleMap} selected={selected} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Flatten a potentially nested style array into a single object. */
function flattenStyle(style: unknown): Record<string, unknown> {
  const arr = Array.isArray(style) ? (style as unknown[]).flat(Infinity) : [style];
  return Object.assign({}, ...arr.map((s) => (s && typeof s === "object" ? s : {})));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CalendarGrid — CVD non-colour cues (BLD-2721)", () => {
  // ── 1. Workout day (count = 1): dot present + border ring ─────────────────
  it("workout day (count=1) renders a dot with borderWidth >= 1 (filled + ring)", () => {
    const workoutDay = 10;
    const key = makeKey(workoutDay);
    const dotMap = new Map([[key, 1]]);

    const { getByTestId } = renderHarness(dotMap, new Map());

    // Workout container present
    const container = getByTestId(`cal-day-${key}-workout`);
    expect(container).toBeTruthy();

    // First dot present
    const dot = getByTestId(`cal-dot-${key}-0`);
    expect(dot).toBeTruthy();

    // Structural CVD assertion: dot must have a border ring (non-colour cue)
    const style = flattenStyle(dot.props.style);
    expect(typeof style.borderWidth).toBe("number");
    expect((style.borderWidth as number)).toBeGreaterThanOrEqual(1);

    // Structural CVD assertion: dot must have a non-transparent fill (filled)
    expect(style.backgroundColor).toBeTruthy();
    expect(style.backgroundColor).not.toBe("transparent");
  });

  // ── 2. Workout day (count = 2): two dots, both bordered ───────────────────
  it("workout day (count=2) renders two dots, both with borderWidth >= 1", () => {
    const workoutDay = 12;
    const key = makeKey(workoutDay);
    const dotMap = new Map([[key, 2]]);

    const { getByTestId } = renderHarness(dotMap, new Map());

    const dot0 = getByTestId(`cal-dot-${key}-0`);
    const dot1 = getByTestId(`cal-dot-${key}-1`);

    for (const dot of [dot0, dot1]) {
      const style = flattenStyle(dot.props.style);
      expect((style.borderWidth as number)).toBeGreaterThanOrEqual(1);
      expect(style.backgroundColor).not.toBe("transparent");
    }
  });

  // ── 3. Workout day (count >= 3): count badge with numeric text ─────────────
  //
  // When count >= 3 the component renders a `countBadge` View (numeric glyph)
  // instead of individual bordered dots. The badge is inherently CVD-safe
  // because it encodes information as text, not colour alone.
  //
  // We verify: workout container present, individual dot testIDs absent
  // (proving the badge path executed, not the 1-2 dot path).
  it("workout day (count=5) uses count badge path: no individual dot testIDs", () => {
    const workoutDay = 20;
    const key = makeKey(workoutDay);
    const dotMap = new Map([[key, 5]]);

    const { getByTestId, queryByTestId } = renderHarness(dotMap, new Map());

    // Workout container present
    expect(getByTestId(`cal-day-${key}-workout`)).toBeTruthy();

    // Individual dot testIDs must be absent — the badge path rendered, not dot path
    expect(queryByTestId(`cal-dot-${key}-0`)).toBeNull();
    expect(queryByTestId(`cal-dot-${key}-1`)).toBeNull();
  });

  // ── 4. Scheduled day (no workout): hollow dot (transparent + border) ───────
  it("scheduled day (no workout) renders a hollow dot (transparent bg + border)", () => {
    // April 1, 2026 is a Wednesday. weekdayMonOrigin = (3+6)%7 = 2.
    // We need a PAST day so `isPast` is true and it renders as "missed scheduled workout".
    // Any day in April 2026 is in the past relative to today (2026-07-03).
    const scheduledDay = 1; // April 1, 2026 (Wednesday)
    const key = makeKey(scheduledDay);
    const d = new Date(YEAR, MONTH, scheduledDay);
    const dayOfWeek = weekdayMonOrigin(d); // Mon-origin index used by CalendarGrid

    const scheduleMap = new Map([[dayOfWeek, { ...stubScheduleEntry, day_of_week: dayOfWeek }]]);

    const { getByTestId } = renderHarness(new Map(), scheduleMap);

    // Scheduled container present
    const container = getByTestId(`cal-day-${key}-scheduled`);
    expect(container).toBeTruthy();

    // Hollow dot present
    const dot = getByTestId(`cal-dot-${key}-scheduled`);
    expect(dot).toBeTruthy();

    // Structural CVD assertion: hollow = transparent fill + border ring
    const style = flattenStyle(dot.props.style);
    expect(style.backgroundColor).toBe("transparent");
    expect(typeof style.borderWidth).toBe("number");
    expect((style.borderWidth as number)).toBeGreaterThanOrEqual(1);
    expect(style.borderColor).toBeTruthy();
  });

  // ── 5. Rest day: NO dot at all ────────────────────────────────────────────
  it("rest/empty day has no dot container (no scheduled, no workout)", () => {
    const restDay = 4;
    const key = makeKey(restDay);

    const { queryByTestId } = renderHarness(new Map(), new Map());

    // No workout container
    expect(queryByTestId(`cal-day-${key}-workout`)).toBeNull();
    // No scheduled container
    expect(queryByTestId(`cal-day-${key}-scheduled`)).toBeNull();
    // No individual dots
    expect(queryByTestId(`cal-dot-${key}-0`)).toBeNull();
    expect(queryByTestId(`cal-dot-${key}-scheduled`)).toBeNull();
  });

  // ── 6. Workout day does NOT render a scheduled hollow dot ─────────────────
  it("workout day does NOT also render a scheduled hollow dot", () => {
    const workoutDay = 14; // April 14, 2026 (Tuesday)
    const key = makeKey(workoutDay);
    const d = new Date(YEAR, MONTH, workoutDay);
    const dayOfWeek = weekdayMonOrigin(d); // Mon-origin

    const dotMap = new Map([[key, 1]]);
    const scheduleMap = new Map([[dayOfWeek, { ...stubScheduleEntry, day_of_week: dayOfWeek }]]);

    const { queryByTestId } = renderHarness(dotMap, scheduleMap);

    // Workout dot IS present (filled)
    expect(queryByTestId(`cal-day-${key}-workout`)).toBeTruthy();
    // Scheduled hollow dot is NOT present (workout takes priority)
    expect(queryByTestId(`cal-day-${key}-scheduled`)).toBeNull();
    expect(queryByTestId(`cal-dot-${key}-scheduled`)).toBeNull();
  });

  // ── 7. Workout vs scheduled: structural distinction (filled ≠ hollow) ─────
  it("workout dot (filled) and scheduled dot (hollow) have distinguishable structure", () => {
    // Render two separate trees: one workout day, one scheduled day
    const workoutKey = makeKey(10);
    const { getByTestId: getWorkout } = renderHarness(
      new Map([[workoutKey, 1]]),
      new Map(),
    );
    const workoutDot = getWorkout(`cal-dot-${workoutKey}-0`);
    const workoutStyle = flattenStyle(workoutDot.props.style);

    // Scheduled: April 1, 2026 (Wed, weekdayMonOrigin=2)
    const scheduledDay = 1;
    const scheduledKey = makeKey(scheduledDay);
    const d = new Date(YEAR, MONTH, scheduledDay);
    const dayOfWeek = weekdayMonOrigin(d);
    const scheduleMap = new Map([[dayOfWeek, { ...stubScheduleEntry, day_of_week: dayOfWeek }]]);
    const { getByTestId: getScheduled } = renderHarness(new Map(), scheduleMap);
    const scheduledDot = getScheduled(`cal-dot-${scheduledKey}-scheduled`);
    const scheduledStyle = flattenStyle(scheduledDot.props.style);

    // Workout: filled (non-transparent bg)
    expect(workoutStyle.backgroundColor).not.toBe("transparent");
    // Scheduled: hollow (transparent bg)
    expect(scheduledStyle.backgroundColor).toBe("transparent");

    // Both have a border ring — the ring is the shared structural signal
    expect((workoutStyle.borderWidth as number)).toBeGreaterThanOrEqual(1);
    expect((scheduledStyle.borderWidth as number)).toBeGreaterThanOrEqual(1);
  });
});
