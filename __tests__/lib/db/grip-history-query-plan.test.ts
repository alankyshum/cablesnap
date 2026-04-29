/**
 * BLD-822 — EXPLAIN QUERY PLAN test for grip-variant autofill query.
 *
 * AC: PLAN-BLD-768.md line 311 — "EXPLAIN QUERY PLAN for grip autofill on
 * 1k+ set DB shows index usage".
 *
 * Risk addressed: PLAN-BLD-768.md line 344 (Medium) — partial-index
 * planner-selection regression. If a future migration adds a partial index
 * (`WHERE grip_type IS NOT NULL OR grip_width IS NOT NULL`) the SQLite
 * planner could plausibly choose the partial over the full
 * `idx_workout_sets_exercise`; this test will fail because it asserts the
 * literal `USING INDEX idx_workout_sets_exercise` plan token, forcing the
 * author to either (a) expand `getRecentBodyweightGripHistory` to bind the
 * IS-NOT-NULL predicates so the planner is happy, or (b) document a
 * deliberate migration of the index strategy.
 *
 * Engine: `node:sqlite` (Node v22+ built-in). Production uses `expo-sqlite`
 * which is a thin SQLite3 wrapper; the planner is identical (both ship
 * SQLite 3.45+ with the same query optimizer). We deliberately use a real
 * SQLite engine here rather than the mocked `expo-sqlite` used by other
 * tests because EXPLAIN QUERY PLAN is a planner-level assertion that
 * cannot be mocked meaningfully.
 *
 * Why N=1000 (not 10k as the plan loosely cites):
 * - SQLite's planner is decision-tree-based, not row-count-based — once
 *   the index exists, the planner picks it deterministically for an
 *   equality predicate on the indexed column regardless of N.
 * - 1k seed rows is sufficient to (a) populate sqlite_stat1 if ANALYZE is
 *   run, (b) keep the test fast (<200ms), (c) prove the query touches
 *   <50 rows out of 1000 (< 5% selectivity, well within typical user
 *   data scales).
 * - Bumping to 10k would only add CI cost without changing the planner's
 *   decision. If we ever observe the planner picking SCAN at 10k that it
 *   doesn't pick at 1k, that's a SQLite bug worth investigating
 *   separately.
 */

import { DatabaseSync } from "node:sqlite";

describe("BLD-822 — grip autofill query plan", () => {
  let db: DatabaseSync;

  beforeAll(() => {
    db = new DatabaseSync(":memory:");

    // Mirror the production schema for the columns the query touches.
    // Schema source-of-truth: lib/db/schema.ts:101 (workoutSets) +
    // workoutSessions. We only declare the columns the test query reads.
    db.exec(`
      CREATE TABLE workout_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        started_at INTEGER NOT NULL
      );

      CREATE TABLE workout_sets (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL,
        set_number INTEGER NOT NULL,
        grip_type TEXT,
        grip_width TEXT
      );

      -- Production indexes from lib/db/migrations.ts:43-46
      CREATE INDEX idx_workout_sets_exercise ON workout_sets(exercise_id);
      CREATE INDEX idx_workout_sets_session ON workout_sets(session_id);
      CREATE INDEX idx_workout_sessions_started_at ON workout_sessions(started_at);
    `);

    // Seed: 100 sessions × 10 sets each = 1000 rows. 50 distinct exercises,
    // so the target exercise has ~20 rows — realistic for a year of training.
    const now = Date.now();
    const insertSession = db.prepare(
      "INSERT INTO workout_sessions (id, started_at) VALUES (?, ?)"
    );
    const insertSet = db.prepare(
      "INSERT INTO workout_sets (id, session_id, exercise_id, set_number, grip_type, grip_width) VALUES (?, ?, ?, ?, ?, ?)"
    );

    db.exec("BEGIN");
    for (let s = 0; s < 100; s++) {
      const sessionId = `sess-${s}`;
      insertSession.run(sessionId, now - (100 - s) * 86400000); // newest last
      for (let n = 1; n <= 10; n++) {
        const exId = `ex-${s % 50}`; // 50 distinct exercises
        const setId = `set-${s}-${n}`;
        // Vary grip vars so type-guard fall-through paths exercise too.
        const gripType = n % 3 === 0 ? "overhand" : n % 3 === 1 ? "underhand" : null;
        const gripWidth = n % 2 === 0 ? "wide" : null;
        insertSet.run(setId, sessionId, exId, n, gripType, gripWidth);
      }
    }
    db.exec("COMMIT");
    db.exec("ANALYZE"); // populate sqlite_stat1 so planner has stats
  });

  afterAll(() => {
    db.close();
  });

  it("seeds the expected row count (sanity check)", () => {
    const setCount = db.prepare("SELECT COUNT(*) AS c FROM workout_sets").get() as {
      c: number;
    };
    const sessionCount = db
      .prepare("SELECT COUNT(*) AS c FROM workout_sessions")
      .get() as { c: number };
    expect(setCount.c).toBe(1000);
    expect(sessionCount.c).toBe(100);
  });

  it("getRecentBodyweightGripHistory query uses idx_workout_sets_exercise (no SCAN on workout_sets)", () => {
    // Production query verbatim from
    // lib/db/session-sets.ts:getRecentBodyweightGripHistory.
    const sql = `EXPLAIN QUERY PLAN
      SELECT ws.grip_type, ws.grip_width
        FROM workout_sets ws
        JOIN workout_sessions s ON s.id = ws.session_id
       WHERE ws.exercise_id = ?
       ORDER BY s.started_at DESC, ws.set_number DESC
       LIMIT ?`;
    const plan = db.prepare(sql).all("ex-7", 50) as { detail: string }[];

    // Combined plan output — single string for substring assertions.
    const planText = plan.map((r) => r.detail).join("\n");

    // ASSERTION 1: the workout_sets scan must use idx_workout_sets_exercise.
    // SQLite formats this as either:
    //   "SEARCH ws USING INDEX idx_workout_sets_exercise (exercise_id=?)"
    //   "SEARCH TABLE workout_sets USING INDEX idx_workout_sets_exercise ..."
    // We assert the literal index name so a regression to a different
    // (or missing) index is caught.
    expect(planText).toMatch(/USING INDEX idx_workout_sets_exercise/);

    // ASSERTION 2: workout_sets must NOT be scanned. A SCAN on
    // workout_sets at 1k rows means the query degraded — block on it.
    // (Note: SCAN on workout_sessions IS expected and acceptable here —
    // the join row count after the indexed exercise_id filter is small.)
    const wsLines = plan
      .map((r) => r.detail)
      .filter((d) => /\bws\b|workout_sets/.test(d));
    for (const line of wsLines) {
      expect(line).not.toMatch(/^SCAN /);
    }
  });

  it("query plan is stable under planner stats refresh (ANALYZE re-run)", () => {
    // Defensive: re-running ANALYZE should not flip the planner away
    // from the index — assert idempotency of the plan choice.
    db.exec("ANALYZE");
    const plan = db
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT ws.grip_type, ws.grip_width
           FROM workout_sets ws
           JOIN workout_sessions s ON s.id = ws.session_id
          WHERE ws.exercise_id = ?
          ORDER BY s.started_at DESC, ws.set_number DESC
          LIMIT ?`
      )
      .all("ex-7", 50) as { detail: string }[];
    const planText = plan.map((r) => r.detail).join("\n");
    expect(planText).toMatch(/USING INDEX idx_workout_sets_exercise/);
  });

  it("returns rows in newest-first order (started_at DESC, set_number DESC)", () => {
    // Functional smoke test — the query plan tests above don't validate
    // correctness of ordering, just index usage. This locks the contract
    // that getRecentBodyweightGripHistory's caller (the pure
    // `getLastBodyweightGripVariant` helper) relies on.
    const rows = db
      .prepare(
        `SELECT ws.grip_type, ws.grip_width, ws.set_number, s.started_at
           FROM workout_sets ws
           JOIN workout_sessions s ON s.id = ws.session_id
          WHERE ws.exercise_id = ?
          ORDER BY s.started_at DESC, ws.set_number DESC
          LIMIT ?`
      )
      .all("ex-7", 5) as {
      grip_type: string | null;
      grip_width: string | null;
      set_number: number;
      started_at: number;
    }[];

    expect(rows.length).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i++) {
      // started_at non-increasing
      expect(rows[i].started_at).toBeLessThanOrEqual(rows[i - 1].started_at);
      // within same session, set_number non-increasing
      if (rows[i].started_at === rows[i - 1].started_at) {
        expect(rows[i].set_number).toBeLessThan(rows[i - 1].set_number);
      }
    }
  });
});
