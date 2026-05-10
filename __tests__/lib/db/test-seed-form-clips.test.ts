/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `seedFormClips` (BLD-1123).
 *
 * Verifies that the function writes the three expected rows:
 *   - exercises: "scenario-exercise-1" with is_custom=1 and category="strength"
 *   - workout_sessions: "scenario-fc-session-1"
 *   - workout_sets: "scenario-fc-set-1" with kind='workout' (actually no kind
 *     column — set_type='normal') and NO set_media row
 *
 * Calls `seedFormClips` directly (not via `seedScenario`) to bypass the
 * `__DEV__` guard (which Babel folds to `false` under NODE_ENV=test).
 * Guard behaviour is covered separately in test-seed-guards.test.ts.
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

describe("seedFormClips (BLD-1123)", () => {
  beforeEach(() => {
    inserts.length = 0;
    jest.clearAllMocks();
  });

  test("inserts exercise row with id 'scenario-exercise-1' and is_custom=1", async () => {
    const { seedFormClips } = require("../../../lib/db/test-seed");
    await seedFormClips(mockDb);

    const exerciseInserts = inserts.filter(
      (i) =>
        i.sql.includes("INSERT") &&
        i.sql.toLowerCase().includes("exercises") &&
        Array.isArray(i.params) &&
        i.params[0] === "scenario-exercise-1",
    );
    expect(exerciseInserts).toHaveLength(1);

    const params = exerciseInserts[0].params as unknown[];
    // (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty, is_custom)
    expect(params[0]).toBe("scenario-exercise-1"); // id
    expect(params[2]).toBe("strength");              // category
    expect(params[8]).toBe(1);                       // is_custom
  });

  test("inserts workout session row with id 'scenario-fc-session-1'", async () => {
    const { seedFormClips } = require("../../../lib/db/test-seed");
    await seedFormClips(mockDb);

    const sessionInserts = inserts.filter(
      (i) =>
        i.sql.includes("INSERT") &&
        i.sql.toLowerCase().includes("workout_sessions") &&
        Array.isArray(i.params) &&
        i.params[0] === "scenario-fc-session-1",
    );
    expect(sessionInserts).toHaveLength(1);

    const params = sessionInserts[0].params as unknown[];
    // (id, template_id, name, started_at, completed_at, duration_seconds, notes, rating)
    const startedAt = params[3] as number;
    const completedAt = params[4] as number;
    // Timestamps must be in milliseconds (> 1e12)
    expect(startedAt).toBeGreaterThan(1e12);
    expect(completedAt).toBeGreaterThan(1e12);
    expect(completedAt).toBeGreaterThan(startedAt);
  });

  test("inserts workout set row with id 'scenario-fc-set-1' linked to correct session + exercise", async () => {
    const { seedFormClips } = require("../../../lib/db/test-seed");
    await seedFormClips(mockDb);

    const setInserts = inserts.filter(
      (i) =>
        i.sql.includes("INSERT") &&
        i.sql.toLowerCase().includes("workout_sets") &&
        Array.isArray(i.params) &&
        i.params[0] === "scenario-fc-set-1",
    );
    expect(setInserts).toHaveLength(1);

    const params = setInserts[0].params as unknown[];
    // (id, session_id, exercise_id, set_number, weight, reps, completed_at)
    expect(params[0]).toBe("scenario-fc-set-1");       // id
    expect(params[1]).toBe("scenario-fc-session-1");   // session_id
    expect(params[2]).toBe("scenario-exercise-1");     // exercise_id
    expect(params[3]).toBe(1);                          // set_number
  });

  test("does NOT insert any set_media row (Record CTA should be enabled)", async () => {
    const { seedFormClips } = require("../../../lib/db/test-seed");
    await seedFormClips(mockDb);

    const mediaInserts = inserts.filter(
      (i) => i.sql.includes("INSERT") && i.sql.toLowerCase().includes("set_media"),
    );
    expect(mediaInserts).toHaveLength(0);
  });

  test("all three rows are written (exercise + session + set)", async () => {
    const { seedFormClips } = require("../../../lib/db/test-seed");
    await seedFormClips(mockDb);

    expect(mockDb.runAsync).toHaveBeenCalledTimes(3);
  });
});
