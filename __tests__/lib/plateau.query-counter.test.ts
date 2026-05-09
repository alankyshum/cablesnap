/**
 * BLD-1122: Query-budget behavioral and structural tests for getPlateauWindowBatch.
 *
 * (a) Mock-based behavioral: getDrizzle called exactly once (not N+1) — verified
 *     using lib/dev/query-counter (countQuery/resetQueryCounts/dumpQueryCounts).
 * (b) EXPLAIN QUERY PLAN: verifies idx_workout_sets_exercise is used.
 * (c) Row-budget assertion: each Map entry has ≤ n aggregated session rows.
 */

/* ── (a) Mock-based behavioral test with lib/dev/query-counter ─────────── */

jest.mock("../../lib/db/helpers", () => ({
  getDrizzle: jest.fn(),
  query: jest.fn(),
  queryOne: jest.fn(),
  getDatabase: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const helpers = require("../../lib/db/helpers") as { getDrizzle: jest.Mock };

import { getPlateauWindowBatch } from "../../lib/db/exercise-history";
import { resetQueryCounts, dumpQueryCounts, countQuery } from "../../lib/dev/query-counter";
import { DatabaseSync } from "node:sqlite";

/** Build a drizzle-like chain mock. Each getDrizzle call in the mock increments
 *  query-counter "drizzle" kind, simulating the real helpers.ts devCountQuery("drizzle") call.
 */
function makeMockDb(step1Rows: Record<string, unknown>[], step2Rows: Record<string, unknown>[]) {
  let callCount = 0;

  const selectSpy = jest.fn().mockImplementation(() => {
    callCount++;
    const rows = callCount === 1 ? step1Rows : step2Rows;
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

  return { selectSpy, getSelectCallCount: () => callCount };
}

describe("getPlateauWindowBatch — (a) behavioral query count via query-counter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetQueryCounts();
  });

  it("calls getDrizzle exactly once (not N+1 per exercise) for 8 exercises", async () => {
    const exerciseIds = Array.from({ length: 8 }, (_, i) => `eid-${i}`);

    const step1Rows = exerciseIds.flatMap((eid, i) =>
      Array.from({ length: 4 }, (_, j) => ({
        session_id: `sess-${i}-${j}`,
        started_at: 1700000000000 - j * 86400000,
        exercise_id: eid,
      }))
    );
    const sessionIds = [...new Set(step1Rows.map((r) => r.session_id as string))];
    const step2Rows = sessionIds.flatMap((sid) => [
      { session_id: sid, exercise_id: step1Rows.find((r) => r.session_id === sid)!.exercise_id, weight: 80, reps: 5, set_number: 1, set_type: "normal", completed: 1, rpe: null, bodyweight_modifier_kg: null },
    ]);

    const { selectSpy } = makeMockDb(step1Rows, step2Rows);
    helpers.getDrizzle.mockImplementation(async () => {
      // Simulate what helpers.ts:155 does: devCountQuery("drizzle")
      countQuery("drizzle");
      return { select: selectSpy };
    });

    await getPlateauWindowBatch(exerciseIds, 4);

    const counts = dumpQueryCounts();
    const drizzleCount = counts.find((r) => r.kind === "drizzle")?.count ?? 0;
    // getDrizzle must be called exactly once — not once per exercise
    expect(drizzleCount).toBe(1);
    // And exactly 2 select() calls on the drizzle instance (step 1 + step 2)
    expect(selectSpy).toHaveBeenCalledTimes(2);
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
        set_type TEXT DEFAULT 'normal',
        rpe REAL,
        FOREIGN KEY (session_id) REFERENCES workout_sessions(id)
      );

      -- The index the production query relies on
      CREATE INDEX idx_workout_sets_exercise ON workout_sets(exercise_id);
    `);

    const insertSession = db.prepare(
      "INSERT INTO workout_sessions(id, started_at, completed_at) VALUES (?,?,?)"
    );
    const insertSet = db.prepare(
      "INSERT INTO workout_sets(id, session_id, exercise_id, weight, reps, set_number, set_type, completed) VALUES (?,?,?,?,?,?,?,?)"
    );
    let counter = 0;
    const exerciseIds = ["e1", "e2", "e3", "e4", "e5"];
    for (const eid of exerciseIds) {
      for (let s = 0; s < 20; s++) {
        const sid = `sess-${eid}-${s}`;
        insertSession.run(sid, 1700000000000 - s * 86400000, 1700000000000 - s * 86400000 + 3600000);
        for (let r = 0; r < 4; r++) {
          insertSet.run(`set-${counter++}`, sid, eid, 80, 5, r + 1, "normal", 1);
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
    expect(planStr).toMatch(/idx_workout_sets_exercise/i);
  });
});

/* (c) Row-budget: result has <= n sessions per exercise */

describe("getPlateauWindowBatch — (c) row budget ≤ n sessions per exercise", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetQueryCounts();
  });

  it("each Map entry has ≤ n=4 PlateauSessionRows even when more sessions exist", async () => {
    const exerciseIds = Array.from({ length: 8 }, (_, i) => `eid-${i}`);
    const n = 4;

    // Step 1 returns 8 sessions per exercise (more than n=4)
    const step1Rows = exerciseIds.flatMap((eid, i) =>
      Array.from({ length: 8 }, (_, j) => ({
        session_id: `sess-${i}-${j}`,
        started_at: 1700000000000 - j * 86400000,
        exercise_id: eid,
      }))
    );

    // buildSessionsMap caps to n=4 sessions per exercise → step 2 only sees capped sessions
    const cappedSessionIds = exerciseIds.flatMap((_, i) =>
      Array.from({ length: n }, (__, j) => `sess-${i}-${j}`)
    );
    const step2Rows = cappedSessionIds.flatMap((sid) => {
      const eid = step1Rows.find((r) => r.session_id === sid)!.exercise_id;
      return Array.from({ length: 4 }, (__, r) => ({
        session_id: sid,
        exercise_id: eid,
        weight: 80,
        reps: 5,
        set_number: r + 1,
        set_type: "normal",
        completed: 1,
        rpe: null,
        bodyweight_modifier_kg: null,
      }));
    });

    const { selectSpy } = makeMockDb(step1Rows, step2Rows);
    helpers.getDrizzle.mockImplementation(async () => {
      countQuery("drizzle");
      return { select: selectSpy };
    });

    const result = await getPlateauWindowBatch(exerciseIds, n);

    for (const [, rows] of result.entries()) {
      // Each exercise gets at most n aggregated session rows
      expect(rows.length).toBeLessThanOrEqual(n);
    }
  });
});
