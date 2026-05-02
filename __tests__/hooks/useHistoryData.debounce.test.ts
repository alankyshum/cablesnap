/**
 * BLD-938 — Debounce + filter-routing behavioural contract for useHistoryData.
 *
 * QD blocker R3: the 300ms filter debounce is a stated acceptance criterion
 * but had no test asserting it. This file fills that gap. We assert the
 * *observable* contract:
 *
 *   1. Rapid filter changes within 300ms collapse to ONE getFilteredSessions
 *      call carrying the FINAL filter state.
 *   2. After the 300ms quiet period ends, exactly one fetch is issued.
 *   3. A subsequent filter change >300ms later issues a SECOND fetch.
 *   4. `loadMoreFiltered` (filterPage > 0) bypasses the debounce — pagination
 *      requests must not be coalesced or dropped just because filters are
 *      changing nearby in time.
 *   5. Clearing all filters returns the hook to non-filter mode and stops
 *      issuing new filter fetches.
 *
 * Why fake timers: `useEffect` debounce is implemented with setTimeout.
 * Real time would make assertions flaky; fake timers let us deterministically
 * advance past / before the 300ms boundary.
 */

import { renderHook, waitFor, act } from "@testing-library/react-native";

// --- Mock the db module ---
//
// `mock`-prefix lets jest's hoisted `jest.mock(...)` call reference it
// (jest scans for the prefix to allow hoisting safely).

jest.mock("../../lib/db", () => ({
  getSessionsByMonth: jest.fn(async () => []),
  getRecentSessions: jest.fn(async () => []),
  searchSessions: jest.fn(async () => []),
  getSessionCountsByDay: jest.fn(async () => []),
  getAllCompletedSessionWeeks: jest.fn(async () => []),
  getTotalSessionCount: jest.fn(async () => 0),
  getTemplatesWithSessions: jest.fn(async () => [
    { id: "tmpl-upper", name: "Upper Body" },
    { id: "tmpl-lower", name: "Lower Body" },
  ]),
  getMuscleGroupsWithSessions: jest.fn(async () => ["chest", "back", "legs"]),
  getFilteredSessions: jest.fn(async () => ({ rows: [], total: 0 })),
}));

// Resolve the mocked function lazily — after jest.mock has executed.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const getFilteredSessionsMock = require("../../lib/db").getFilteredSessions as jest.Mock;

jest.mock("../../lib/db/settings", () => ({
  getSchedule: jest.fn().mockResolvedValue([]),
}));

jest.mock("expo-router", () => {
  const RealReact = require("react");
  return {
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb();
        return typeof cleanup === "function" ? cleanup : undefined;
      }, [cb]);
    },
  };
});

jest.mock("react-native-reanimated", () => ({
  useSharedValue: <T,>(v: T) => ({ value: v }),
  useReducedMotion: () => false,
  withTiming: <T,>(v: T) => v,
  useAnimatedStyle: (fn: () => Record<string, unknown>) => fn(),
  Easing: { bezier: () => (t: number) => t },
}));

jest.mock("react-native-gesture-handler", () => ({
  Gesture: {
    Pan: () => ({
      activeOffsetX: () => ({
        enabled: () => ({
          onEnd: () => ({ runOnJS: () => ({}) }),
        }),
      }),
    }),
  },
}));

jest.mock("../../lib/layout", () => ({
  useLayout: () => ({ wide: false, width: 375, scale: 1.0 }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Number of times getFilteredSessions has actually been called by the hook.
 * (Distinguishes "scheduled but not yet fired" from "fired".)
 */
const filteredCallCount = () => getFilteredSessionsMock.mock.calls.length;

/**
 * Advance fake timers by `ms` and flush microtasks so .then() handlers run.
 * Without the second await, the promise chain after the timer fires would
 * still be queued.
 */
async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    // Flush pending microtasks (Promise.then chained inside the effect).
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("BLD-938 — useHistoryData filter debounce (300ms) and routing", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    getFilteredSessionsMock.mockClear();
    getFilteredSessionsMock.mockImplementation(async () => ({ rows: [], total: 0 }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("rapid filter changes within 300ms collapse to ONE call carrying the final state", async () => {
    const { useHistoryData } = require("../../hooks/useHistoryData");
    const { result } = renderHook(() => useHistoryData());

    // Let initial mount-time async loads settle (heatmap, totals, etc.).
    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
    });

    const baseline = filteredCallCount();

    // Three rapid filter changes within the 300ms window.
    act(() => result.current.setTemplateFilter("tmpl-upper"));
    await advance(50);
    act(() => result.current.setTemplateFilter("tmpl-lower"));
    await advance(50);
    act(() => result.current.setDatePresetFilter("30d"));
    // Total elapsed since first change: 100ms. Debounce timer is 300ms.
    // No fetch should have fired yet.
    expect(filteredCallCount()).toBe(baseline);

    // Advance past the 300ms boundary from the LAST change.
    await advance(350);

    await waitFor(() => {
      expect(filteredCallCount()).toBe(baseline + 1);
    });

    // The single coalesced call must carry the FINAL state, not an
    // intermediate one (lower template + 30d preset).
    const [filtersArg, queryArg, limitArg, offsetArg] =
      getFilteredSessionsMock.mock.calls[getFilteredSessionsMock.mock.calls.length - 1];
    expect(filtersArg).toMatchObject({ templateId: "tmpl-lower", datePreset: "30d" });
    expect(queryArg).toBe("");
    expect(typeof limitArg).toBe("number");
    expect(offsetArg).toBe(0);
  });

  test("a filter change AFTER the quiet period issues a second fetch", async () => {
    const { useHistoryData } = require("../../hooks/useHistoryData");
    const { result } = renderHook(() => useHistoryData());

    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
    });

    const baseline = filteredCallCount();

    act(() => result.current.setTemplateFilter("tmpl-upper"));
    await advance(350);
    await waitFor(() => expect(filteredCallCount()).toBe(baseline + 1));

    // Quiet period elapsed; a fresh change triggers a new debounce window.
    act(() => result.current.setMuscleGroupFilter("chest"));
    await advance(350);
    await waitFor(() => expect(filteredCallCount()).toBe(baseline + 2));

    const lastCall = getFilteredSessionsMock.mock.calls[getFilteredSessionsMock.mock.calls.length - 1];
    expect(lastCall[0]).toMatchObject({ templateId: "tmpl-upper", muscleGroup: "chest" });
  });

  test("loadMoreFiltered (filterPage > 0) bypasses the debounce", async () => {
    // Seed enough rows on first page that filteredRows.length < filteredTotal.
    getFilteredSessionsMock.mockImplementation(async (_filters: unknown, _q: unknown, limit: number, offset: number) => {
      // Simulate a result set of 50 total, returning `limit` rows per page.
      const rows = Array.from({ length: Math.min(limit, 50 - offset) }, (_, i) => ({
        id: `s-${offset + i}`,
        template_id: null,
        name: `Session ${offset + i}`,
        started_at: 1_700_000_000_000 - (offset + i) * 86_400_000,
        completed_at: 1_700_000_000_000 - (offset + i) * 86_400_000 + 3_600_000,
        duration_seconds: 3600,
        notes: "",
        rating: null,
        set_count: 6,
      }));
      return { rows, total: 50 };
    });

    const { useHistoryData } = require("../../hooks/useHistoryData");
    const { result } = renderHook(() => useHistoryData());

    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Activate a filter and let the debounced page-0 fetch fire.
    act(() => result.current.setTemplateFilter("tmpl-upper"));
    await advance(350);
    await waitFor(() => expect(filteredCallCount()).toBeGreaterThanOrEqual(1));

    const callsAfterPage0 = filteredCallCount();

    // Ask for more — pagination must NOT be debounced.
    act(() => result.current.loadMoreFiltered());

    // Without advancing fake timers past 300ms, the pagination fetch must
    // already have been issued. Allow microtasks to resolve so the
    // mocked promise settles.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(filteredCallCount()).toBe(callsAfterPage0 + 1);

    // The pagination fetch must carry a non-zero offset.
    const lastCall = getFilteredSessionsMock.mock.calls[getFilteredSessionsMock.mock.calls.length - 1];
    expect(lastCall[3]).toBeGreaterThan(0); // offset > 0
  });

  test("clearAllFilters returns the hook to non-filter mode (no further filter fetches)", async () => {
    const { useHistoryData } = require("../../hooks/useHistoryData");
    const { result } = renderHook(() => useHistoryData());

    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => result.current.setTemplateFilter("tmpl-upper"));
    await advance(350);
    await waitFor(() => expect(filteredCallCount()).toBeGreaterThanOrEqual(1));
    expect(result.current.useFilterMode).toBe(true);

    const callsBeforeClear = filteredCallCount();

    act(() => result.current.clearAllFilters());
    await advance(350);

    // After clearing, hook drops out of filter mode. The effect's early
    // return (`if (!useFilterMode && !query.trim()) return`) means no
    // additional fetch is issued.
    expect(result.current.useFilterMode).toBe(false);
    expect(filteredCallCount()).toBe(callsBeforeClear);
  });
});
