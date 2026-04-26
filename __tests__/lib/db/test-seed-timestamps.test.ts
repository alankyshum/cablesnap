/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BLD-662 regression: scenario seed must write `started_at` / `completed_at`
 * in MILLISECONDS to match production (`lib/db/sessions.ts:134` writes
 * `Date.now()`). When seconds were used the heatmap / streak / dotMap
 * aggregations filtered every seeded row out (timestamps mapped to year 1970
 * via `date(started_at / 1000, 'unixepoch')`).
 *
 * `duration_seconds` stays in SECONDS (column is `*_seconds`).
 */

const inserts: Array<{ sql: string; params: unknown[] }> = [];

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockImplementation(async (sql: string, params: unknown[]) => {
    inserts.push({ sql, params });
    return { changes: 1 };
  }),
};

jest.mock("../../../lib/db/helpers", () => ({
  getDatabase: jest.fn().mockResolvedValue(mockDb),
}));

jest.mock("react-native", () => ({ Platform: { OS: "web" } }));

describe("test-seed timestamps (BLD-662)", () => {
  const realDev = (globalThis as any).__DEV__;
  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;

  beforeEach(() => {
    inserts.length = 0;
    jest.clearAllMocks();
    (globalThis as any).__DEV__ = true;
    (globalThis as any).document = { body: { dataset: {} } };
  });

  afterAll(() => {
    (globalThis as any).__DEV__ = realDev;
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
  });

  // 2026-01-01T00:00:00Z in ms = 1767225600000; in s = 1767225600.
  // The threshold (1e12) cleanly separates ms from s for any year > 2001.
  const isMillisecondTimestamp = (n: number) => n > 1e12;

  test("seedWorkoutHistory inserts started_at / completed_at as milliseconds", async () => {
    (globalThis as any).window = { __TEST_SCENARIO__: "workout-history" };
    const { seedScenario } = require("../../../lib/db/test-seed");
    await seedScenario();

    const sessionInserts = inserts.filter((i) => i.sql.includes("INSERT INTO workout_sessions"));
    expect(sessionInserts).toHaveLength(5);

    for (const ins of sessionInserts) {
      // Schema: (id, template_id, name, started_at, completed_at, duration_seconds, notes, rating)
      const startedAt = ins.params[3] as number;
      const completedAt = ins.params[4] as number;
      const durationSeconds = ins.params[5] as number;

      expect(isMillisecondTimestamp(startedAt)).toBe(true);
      expect(isMillisecondTimestamp(completedAt)).toBe(true);
      expect(completedAt).toBeGreaterThan(startedAt);

      // duration_seconds column must remain in seconds (≤ ~1 hour each here).
      expect(durationSeconds).toBeGreaterThan(0);
      expect(durationSeconds).toBeLessThan(60 * 60 * 24); // < 1 day
      // It should equal (completedAt - startedAt) / 1000 (within 1s rounding)
      expect(Math.abs(durationSeconds * 1000 - (completedAt - startedAt))).toBeLessThanOrEqual(1000);
    }
  });

  test("seedWorkoutHistory sessions land within the last 16 weeks (heatmap window)", async () => {
    (globalThis as any).window = { __TEST_SCENARIO__: "workout-history" };
    const { seedScenario } = require("../../../lib/db/test-seed");
    await seedScenario();

    const now = Date.now();
    const sixteenWeeksMs = 16 * 7 * 24 * 60 * 60 * 1000;
    const sessionInserts = inserts.filter((i) => i.sql.includes("INSERT INTO workout_sessions"));

    for (const ins of sessionInserts) {
      const startedAt = ins.params[3] as number;
      // Within last 16 weeks AND not in the future
      expect(now - startedAt).toBeLessThan(sixteenWeeksMs);
      expect(startedAt).toBeLessThanOrEqual(now);
    }
  });

  test("seedCompletedWorkout inserts started_at / completed_at as milliseconds", async () => {
    (globalThis as any).window = { __TEST_SCENARIO__: "completed-workout" };
    const { seedScenario } = require("../../../lib/db/test-seed");
    await seedScenario();

    const sessionInserts = inserts.filter((i) => i.sql.includes("INSERT INTO workout_sessions"));
    expect(sessionInserts).toHaveLength(1);

    const startedAt = sessionInserts[0].params[3] as number;
    const completedAt = sessionInserts[0].params[4] as number;
    const durationSeconds = sessionInserts[0].params[5] as number;

    expect(isMillisecondTimestamp(startedAt)).toBe(true);
    expect(isMillisecondTimestamp(completedAt)).toBe(true);
    // 1h workout = 3540 seconds (60min - 1min), NOT 3540000.
    expect(durationSeconds).toBeGreaterThan(60);
    expect(durationSeconds).toBeLessThan(60 * 60 * 24);

    // workout_sets.completed_at should also be ms.
    const setInserts = inserts.filter((i) => i.sql.includes("INSERT INTO workout_sets"));
    expect(setInserts.length).toBeGreaterThan(0);
    for (const ins of setInserts) {
      // (id, session_id, exercise_id, set_number, weight, reps, completed_at, exercise_position)
      const setCompletedAt = ins.params[6] as number;
      expect(isMillisecondTimestamp(setCompletedAt)).toBe(true);
    }
  });
});
