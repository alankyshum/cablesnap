/**
 * BLD-1060 — EXPLAIN QUERY PLAN regression for idx_workout_sessions_gym_started_at.
 *
 * AC: PLAN-BLD-1059 rev 3 lines 223-224 — "EXPLAIN QUERY PLAN test asserts
 * idx_workout_sessions_gym_started_at is used by the gym-scoped e1RM trend query."
 *
 * Risk addressed: if a future migration reorders the WHERE predicates in
 * getE1RMTrendsByGym, or if the (gym_id, started_at) index is dropped or renamed,
 * SQLite would fall back to a full table scan on workout_sessions. This test
 * catches that regression by asserting the literal index name in the query plan.
 *
 * Engine: node:sqlite (Node v22+ built-in). Production uses expo-sqlite which is
 * the same SQLite3 library; the query planner is identical. We use a real engine
 * here because EXPLAIN QUERY PLAN cannot be meaningfully mocked.
 *
 * See __tests__/lib/db/grip-history-query-plan.test.ts for the identical pattern
 * used on BLD-822 (idx_workout_sets_exercise).
 */

import { DatabaseSync } from "node:sqlite";

describe("BLD-1060 — e1RM gym-scoped query plan", () => {
  let db: DatabaseSync;

  beforeAll(() => {
    db = new DatabaseSync(":memory:");

    // Mirror only the columns the query touches.
    // Schema source: lib/db/schema.ts + lib/db/migrations.ts
    db.exec(`
      CREATE TABLE exercises (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL
      );

      CREATE TABLE workout_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        gym_id TEXT
      );

      CREATE TABLE workout_sets (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL,
        set_number INTEGER NOT NULL,
        weight REAL NOT NULL DEFAULT 0,
        reps INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        set_type TEXT NOT NULL DEFAULT 'normal'
      );

      -- Production composite index from lib/db/migrations.ts:153
      CREATE INDEX idx_workout_sessions_gym_started_at ON workout_sessions(gym_id, started_at);

      -- Other production indexes so the planner has full statistics
      CREATE INDEX idx_workout_sets_session ON workout_sets(session_id);
      CREATE INDEX idx_workout_sets_exercise ON workout_sets(exercise_id);
    `);

    // Seed: 100 sessions across 2 gyms × 10 sets each = 1000 sets.
    // Target gym has ~50 sessions — sufficient selectivity for the planner.
    const now = Date.now();
    const insertSession = db.prepare(
      "INSERT INTO workout_sessions (id, started_at, completed_at, gym_id) VALUES (?, ?, ?, ?)"
    );
    const insertSet = db.prepare(
      "INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed, set_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const insertExercise = db.prepare(
      "INSERT INTO exercises (id, name) VALUES (?, ?)"
    );

    for (let ex = 0; ex < 20; ex++) {
      insertExercise.run(`ex-${ex}`, `Exercise ${ex}`);
    }

    db.exec("BEGIN");
    for (let s = 0; s < 100; s++) {
      const sessionId = `sess-${s}`;
      const gymId = s % 2 === 0 ? "gym-target" : "gym-other";
      insertSession.run(sessionId, now - (100 - s) * 86400000, now - (100 - s) * 86400000 + 3600000, gymId);
      for (let n = 1; n <= 10; n++) {
        const exId = `ex-${n % 20}`;
        insertSet.run(`set-${s}-${n}`, sessionId, exId, n, 60 + n, 8, 1, "normal");
      }
    }
    db.exec("COMMIT");

    // Populate sqlite_stat1 so the planner has accurate cardinality estimates.
    db.exec("ANALYZE");
  });

  afterAll(() => {
    db.close();
  });

  it("gym-scoped e1RM query uses idx_workout_sessions_gym_started_at (not a full SCAN)", () => {
    // Production SQL verbatim from lib/db/e1rm-trends.ts:getE1RMTrendsByGym.
    // Both inner subqueries share the same WHERE (gym_id = ? AND started_at >= ?),
    // which is the leading-equality prefix that lets SQLite use the composite index.
    const sql = `EXPLAIN QUERY PLAN
      SELECT
        cur.exercise_id,
        COALESCE(e.name, 'Deleted Exercise') AS name,
        cur.e1rm AS current_e1rm,
        prev.e1rm AS previous_e1rm
      FROM (
        SELECT ws.exercise_id,
               MAX(ws.weight * (1.0 + ws.reps / 30.0)) AS e1rm,
               COUNT(DISTINCT wss.id) AS session_count
        FROM workout_sets ws
        JOIN workout_sessions wss ON ws.session_id = wss.id
        WHERE ws.completed = 1
          AND ws.set_type != 'warmup'
          AND ws.weight > 0
          AND ws.reps > 0
          AND ws.reps <= 12
          AND wss.completed_at IS NOT NULL
          AND wss.gym_id = ?
          AND wss.started_at >= ?
        GROUP BY ws.exercise_id
        HAVING session_count >= 3
      ) cur
      JOIN (
        SELECT ws.exercise_id,
               MAX(ws.weight * (1.0 + ws.reps / 30.0)) AS e1rm
        FROM workout_sets ws
        JOIN workout_sessions wss ON ws.session_id = wss.id
        WHERE ws.completed = 1
          AND ws.set_type != 'warmup'
          AND ws.weight > 0
          AND ws.reps > 0
          AND ws.reps <= 12
          AND wss.completed_at IS NOT NULL
          AND wss.gym_id = ?
          AND wss.started_at >= ? AND wss.started_at < ?
        GROUP BY ws.exercise_id
      ) prev ON cur.exercise_id = prev.exercise_id
      LEFT JOIN exercises e ON cur.exercise_id = e.id
      WHERE cur.e1rm > prev.e1rm
      ORDER BY (cur.e1rm - prev.e1rm) DESC
      LIMIT 5`;

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;

    const plan = db.prepare(sql).all(
      "gym-target", thirtyDaysAgo,
      "gym-target", sixtyDaysAgo, thirtyDaysAgo
    ) as { detail: string }[];

    const planText = plan.map((r) => r.detail).join("\n");

    // ASSERTION 1: at least one scan of workout_sessions must use the composite index.
    // SQLite formats this as:
    //   "SEARCH wss USING INDEX idx_workout_sessions_gym_started_at (gym_id=? AND started_at>?)"
    expect(planText).toMatch(/USING INDEX idx_workout_sessions_gym_started_at/);

    // ASSERTION 2: workout_sessions must not be scanned without an index.
    // A full SCAN here means the planner dropped the composite index — block on that.
    const sessionLines = plan
      .map((r) => r.detail)
      .filter((d) => /\bwss\b|workout_sessions/.test(d));
    for (const line of sessionLines) {
      // Allow SEARCH (indexed) but not SCAN (unindexed full table read)
      expect(line).not.toMatch(/^SCAN /);
    }
  });

  it("plan is stable after ANALYZE re-run (planner stats refresh)", () => {
    // Guard against the planner changing its strategy when statistics are refreshed.
    db.exec("ANALYZE");

    const sql = `EXPLAIN QUERY PLAN
      SELECT ws.exercise_id
      FROM workout_sets ws
      JOIN workout_sessions wss ON ws.session_id = wss.id
      WHERE wss.gym_id = ? AND wss.started_at >= ?
      LIMIT 5`;

    const plan = db.prepare(sql).all("gym-target", Date.now() - 86400000 * 30) as { detail: string }[];
    const planText = plan.map((r) => r.detail).join("\n");

    expect(planText).toMatch(/USING INDEX idx_workout_sessions_gym_started_at/);
  });
});
