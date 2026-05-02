/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BLD-664 (follow-up to BLD-662).
 *
 * Behavioral parity lock for the workout-history surface.
 *
 * `useHistoryData` derives THREE numbers from the same set of completed
 * workout sessions:
 *   - `heatmapData` (from `getSessionCountsByDay`)
 *   - `dotMap`      (from `getSessionsByMonth`, the current month)
 *   - `totalWorkouts` (from `getTotalSessionCount`)
 *
 * BLD-662 had the contradictory state "5 total, empty heatmap" because seed
 * timestamps were in seconds while production queries assume ms. The fix
 * landed in `__tests__/lib/db/test-seed-timestamps.test.ts`, but that test
 * asserts the *cause* (timestamp units), not the *behavior*.
 *
 * QD + techlead flagged: a future regression where one of the three queries
 * silently diverges (e.g. `getSessionCountsByDay` gains a `completed = 1`
 * predicate that the others don't) would NOT be caught by the timestamp
 * test. This file fills that gap by parameterizing over N ∈ {0, 1, 5, 30}
 * and asserting all three values stay consistent with the seeded session
 * set.
 *
 * NOTE on layering: this is an integration test of the *hook*, not of the
 * SQL. We back the three lib/db functions with a single in-memory store
 * with one shared `mockIsCompleted` predicate; if a developer ever adds a
 * predicate to one production query, they must update this shared
 * predicate too — which surfaces the asymmetry at PR review time. A true
 * SQL-level harness (real in-memory sqlite) is tracked separately.
 */

import { renderHook, waitFor, act } from "@testing-library/react-native";

// ---- Test seed store (shared by all mocked db functions) ----
type SeedSession = {
  id: string;
  template_id: string | null;
  name: string;
  started_at: number;       // ms
  completed_at: number | null; // ms; null = in-progress (must be excluded)
  duration_seconds: number;
  notes: string;
  rating: number | null;
  set_count: number;
};

const mockSeedStore: SeedSession[] = [];

// The single source of truth for "this session counts as completed".
// All three mocked queries below MUST go through this predicate.
const mockIsCompleted = (s: SeedSession) => s.completed_at !== null;

function mockStartOfDay(ts: number): Date {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d;
}

function mockDateKeyLocal(ts: number): string {
  const d = mockStartOfDay(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---- Mocks for db & friends ----

jest.mock("../../lib/db", () => ({
  getSessionsByMonth: jest.fn(async (year: number, month: number) => {
    const start = new Date(year, month, 1).getTime();
    const end = new Date(year, month + 1, 1).getTime();
    return mockSeedStore
      .filter(mockIsCompleted)
      .filter((s) => s.started_at >= start && s.started_at < end)
      .sort((a, b) => b.started_at - a.started_at);
  }),
  getRecentSessions: jest.fn(async (limit: number) => {
    return mockSeedStore
      .filter(mockIsCompleted)
      .sort((a, b) => b.started_at - a.started_at)
      .slice(0, limit);
  }),
  searchSessions: jest.fn(async () => []),
  getSessionCountsByDay: jest.fn(async (startTs: number, endTs: number) => {
    const counts = new Map<string, number>();
    for (const s of mockSeedStore) {
      if (!mockIsCompleted(s)) continue;
      if (s.started_at < startTs || s.started_at >= endTs) continue;
      const key = mockDateKeyLocal(s.started_at);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }),
  getAllCompletedSessionWeeks: jest.fn(async () => {
    const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;
    return mockSeedStore
      .filter(mockIsCompleted)
      .filter((s) => s.started_at >= twoYearsAgo)
      .map((s) => s.started_at)
      .sort((a, b) => b - a);
  }),
  getTotalSessionCount: jest.fn(async () => mockSeedStore.filter(mockIsCompleted).length),
  // BLD-938: history filter queries — empty so the hook stays on the
  // unfiltered path (these tests don't activate any chip).
  getTemplatesWithSessions: jest.fn(async () => []),
  getMuscleGroupsWithSessions: jest.fn(async () => []),
  getFilteredSessions: jest.fn(async () => ({ rows: [], total: 0 })),
}));

jest.mock("../../lib/db/settings", () => ({
  getSchedule: jest.fn().mockResolvedValue([]),
}));

// useFocusEffect normally fires only when a navigator focuses the screen.
// In tests we want it to behave as a regular useEffect so the hook loads
// data on mount.
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

// ---- Test helpers ----

function clearSeed() {
  mockSeedStore.length = 0;
}

/**
 * Seed N completed sessions on N distinct days, anchored to today and
 * walking backwards one day at a time. Keeps everything inside the
 * 16-week heatmap window (max N tested is 30 ≪ 112 days).
 */
function seedSessions(n: number) {
  clearSeed();
  const today = mockStartOfDay(Date.now()).getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  for (let i = 0; i < n; i++) {
    // Anchor each session at noon on its day so DST shifts don't push it
    // across the day boundary.
    const startedAt = today - i * oneDay + 12 * 60 * 60 * 1000;
    mockSeedStore.push({
      id: `seed-${i}`,
      template_id: null,
      name: `Workout ${i + 1}`,
      started_at: startedAt,
      completed_at: startedAt + 60 * 60 * 1000,
      duration_seconds: 3600,
      notes: "",
      rating: null,
      set_count: 6,
    });
  }
}

function expectedDotMapSize(): number {
  // dotMap is built from getSessionsByMonth (current month only),
  // keyed by distinct day. We seeded one session per distinct day,
  // so it equals the count of seeded days that fall in the current month.
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1).getTime();
  const end = new Date(y, m + 1, 1).getTime();
  const days = new Set<string>();
  for (const s of mockSeedStore) {
    if (s.completed_at === null) continue;
    if (s.started_at < start || s.started_at >= end) continue;
    days.add(mockDateKeyLocal(s.started_at));
  }
  return days.size;
}

// ---- Tests ----

describe("useHistoryData parity lock (BLD-664)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearSeed();
  });

  test.each([0, 1, 5, 30])(
    "with N=%i seeded completed sessions on distinct days, heatmapData / dotMap / totalWorkouts stay consistent",
    async (n) => {
      seedSessions(n);

      // Import lazily so each parameterization sees a fresh module state if needed.
      const { useHistoryData } = require("../../hooks/useHistoryData");

      const { result } = renderHook(() => useHistoryData());

      // Wait for both async load() and loadHeatmap() to settle.
      await waitFor(() => {
        expect(result.current.heatmapLoading).toBe(false);
      });
      await waitFor(() => {
        expect(result.current.totalWorkouts).toBe(n);
      });

      // Heatmap window is the last 16 weeks; we seeded ≤ 30 days back so
      // every seeded day lands inside the window.
      expect(result.current.heatmapData.size).toBe(n);

      // dotMap only reflects the *current calendar month*. Compute the
      // expectation from the same mockSeedStore using the same predicate.
      expect(result.current.dotMap.size).toBe(expectedDotMapSize());

      // Cross-check: totalWorkouts >= heatmapData.size >= dotMap.size.
      // (totalWorkouts counts all-time, heatmap is 16w, dotMap is 1mo.)
      expect(result.current.totalWorkouts).toBeGreaterThanOrEqual(
        result.current.heatmapData.size
      );
      expect(result.current.heatmapData.size).toBeGreaterThanOrEqual(
        result.current.dotMap.size
      );
    }
  );

  test("in-progress (completed_at = null) sessions are excluded from all three counts", async () => {
    // Seed 3 completed + 2 in-progress on distinct days.
    seedSessions(3);
    const today = mockStartOfDay(Date.now()).getTime();
    const oneDay = 24 * 60 * 60 * 1000;
    mockSeedStore.push({
      id: "in-progress-a",
      template_id: null,
      name: "Active A",
      started_at: today - 10 * oneDay + 12 * 60 * 60 * 1000,
      completed_at: null,
      duration_seconds: 0,
      notes: "",
      rating: null,
      set_count: 0,
    });
    mockSeedStore.push({
      id: "in-progress-b",
      template_id: null,
      name: "Active B",
      started_at: today - 11 * oneDay + 12 * 60 * 60 * 1000,
      completed_at: null,
      duration_seconds: 0,
      notes: "",
      rating: null,
      set_count: 0,
    });

    const { useHistoryData } = require("../../hooks/useHistoryData");
    const { result } = renderHook(() => useHistoryData());

    await waitFor(() => {
      expect(result.current.heatmapLoading).toBe(false);
    });
    await waitFor(() => {
      expect(result.current.totalWorkouts).toBe(3);
    });

    expect(result.current.heatmapData.size).toBe(3);
    expect(result.current.dotMap.size).toBe(expectedDotMapSize());
  });
});

// Silence unused-import if act is not directly referenced elsewhere.
void act;
