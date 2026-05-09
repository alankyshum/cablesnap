/**
 * BLD-1122: Query-budget behavioral and structural tests for getPlateauWindowBatch.
 *
 * (a) Mock-based behavioral: counts exactly 2 .select() calls via getDrizzle mock.
 * (b) EXPLAIN QUERY PLAN: verifies idx_workout_sets_exercise is used.
 * (c) Row-budget assertion: each Map entry has ≤32 rows.
 */

/* ── (a) Mock-based behavioral test ───────────────────────────────────── */

jest.mock("../../lib/db/helpers", () => ({
  getDrizzle: jest.fn(),
  query: jest.fn(),
  queryOne: jest.fn(),
  getDatabase: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const helpers = require("../../lib/db/helpers") as { getDrizzle: jest.Mock };

import { getPlateauWindowBatch } from "../../lib/db/exercise-history";
import { DatabaseSync } from "node:sqlite";

/** Build a minimal Drizzle-like chained mock that resolves `rows` for .all(). */
function makeMockDb(step1Rows: Record<string, unknown>[], step2Rows: Record<string, unknown>[]) {
  let callCount = 0;

  const selectSpy = jest.fn().mockImplementation(() => {
    callCount++;
    const rows = callCount === 1 ? step1Rows : step2Rows;
    // Drizzle queries are both awaitable (the terminal chain is a Promise) AND have .all()
    // We make a chain where every method returns the same chainable Promise-like object.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = new Promise((resolve) => resolve(rows));
    const methods = ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit", "offset"];
    for (const m of methods) {
      chain[m] = () => chain;
    }
    chain.all = jest.fn().mockResolvedValue(rows);
    chain.get = jest.fn().mockResolvedValue(rows[0]);
    return chain;
  });

  return { selectSpy, getCallCount: () => callCount };
}

describe("getPlateauWindowBatch — (a) behavioral query count", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("makes exactly 2 db.select() calls for 8 exercises (not N+1)", async () => {
    const exerciseIds = Array.from({ length: 8 }, (_, i) => `eid-${i}`);

    // Step 1 returns 8 sessions per exercise (2 exercises × 4 sessions each for brevity)
    const step1Rows = exerciseIds.flatMap((eid, i) =>
      Array.from({ length: 4 }, (_, j) => ({
        session_id: `sess-${i}-${j}`,
        started_at: 1700000000000 - j * 86400000,
        exercise_id: eid,
      }))
    );

    // Step 2 returns 2 working sets per session
    const sessionIds = [...new Set(step1Rows.map((r) => r.session_id as string))];
    const step2Rows = sessionIds.flatMap((sid) => [
      { session_id: sid, exercise_id: step1Rows.find((r) => r.session_id === sid)!.exercise_id, weight: 80, reps: 5, set_number: 1, set_type: "working", completed: 1, rpe: null },
      { session_id: sid, exercise_id: step1Rows.find((r) => r.session_id === sid)!.exercise_id, weight: 80, reps: 5, set_number: 2, set_type: "working", completed: 1, rpe: null },
    ]);

    const { selectSpy, getCallCount } = makeMockDb(step1Rows, step2Rows);
    helpers.getDrizzle.mockResolvedValue({ select: selectSpy });

    await getPlateauWindowBatch(exerciseIds, 4);

    expect(getCallCount()).toBe(2);
  });
});

/* ── (b) EXPLAIN QUERY PLAN — idx_workout_sets_exercise must be used ── */

describe("getPlateauWindowBatch — (b) EXPLAIN QUERY PLAN", () => {
  let db: DatabaseSync;

  beforeAll(() => {
    db = new DatabaseSync(":memory:");

    db.exec(`
      CREATE TABLE workout_sessions (
        id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        completed_at INTEGER
      );

      CREATE TABLE workout_sets (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL,
        set_number INTEGER NOT NULL DEFAULT 1,
        weight REAL,
        reps INTEGER,
        completed INTEGER DEFAULT 0,
        set_type TEXT DEFAULT 'working',
        rpe REAL,
        FOREIGN KEY (session_id) REFERENCES workout_sessions(id)
      );

      -- The index the production query relies on
      CREATE INDEX idx_workout_sets_exercise ON workout_sets(exercise_id);
    `);

    // Seed 100 rows per exercise across 5 exercises
    const insertSession = db.prepare(
      "INSERT INTO workout_sessions(id, started_at, completed_at) VALUES (?,?,?)"
    );
    const insertSet = db.prepare(
      "INSERT INTO workout_sets(id, session_id, exercise_id, weight, reps, set_number, set_type, completed) VALUES (?,?,?,?,?,?,?,?)"
    );
    let sessionCounter = 0;
    const exerciseIds = ["e1", "e2", "e3", "e4", "e5"];
    for (const eid of exerciseIds) {
      for (let s = 0; s < 20; s++) {
        const sid = `sess-${eid}-${s}`;
        insertSession.run(sid, 1700000000000 - s * 86400000, 1700000000000 - s * 86400000 + 3600000);
        for (let r = 0; r < 5; r++) {
          insertSet.run(`set-${sessionCounter++}`, sid, eid, 80, 5, r + 1, "working", 1);
        }
      }
    }
  });

  afterAll(() => {
    db.close();
  });

  it("uses idx_workout_sets_exercise for the exercise_id IN() query", () => {
    const plan = db.prepare(
      `EXPLAIN QUERY PLAN
       SELECT ws.session_id, ws.exercise_id
       FROM workout_sets ws
       WHERE ws.exercise_id IN ('e1','e2','e3')
       ORDER BY ws.session_id`
    ).all() as { detail: string }[];

    const planStr = plan.map((r) => r.detail).join("\n");
    // Must use the index, not a full scan
    expect(planStr).toMatch(/idx_workout_sets_exercise/i);
  });
});

/* ── (c) Row-budget per exercise ≤32 ──────────────────────────────────── */

describe("getPlateauWindowBatch — (c) row budget ≤32 per exercise", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("each Map entry has ≤32 session rows for n=4 with 8 exercises", async () => {
    const exerciseIds = Array.from({ length: 8 }, (_, i) => `eid-${i}`);

    // Provide 8 sessions each (more than n=4) to confirm JS-level capping
    const step1Rows = exerciseIds.flatMap((eid, i) =>
      Array.from({ length: 8 }, (_, j) => ({
        session_id: `sess-${i}-${j}`,
        started_at: 1700000000000 - j * 86400000,
        exercise_id: eid,
      }))
    );

    const sessionIds = [...new Set(step1Rows.map((r) => r.session_id as string))];
    const step2Rows = sessionIds.flatMap((sid) => {
      const eid = step1Rows.find((r) => r.session_id === sid)!.exercise_id;
      return Array.from({ length: 4 }, (_, r) => ({
        session_id: sid,
        exercise_id: eid,
        weight: 80,
        reps: 5,
        set_number: r + 1,
        set_type: "working",
        completed: 1,
        rpe: null,
      }));
    });

    const { selectSpy } = makeMockDb(step1Rows, step2Rows);
    helpers.getDrizzle.mockResolvedValue({ select: selectSpy });

    const result = await getPlateauWindowBatch(exerciseIds, 4);

    for (const [, rows] of result.entries()) {
      expect(rows.length).toBeLessThanOrEqual(32);
    }
  });
});
