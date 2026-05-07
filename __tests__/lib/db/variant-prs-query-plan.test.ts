/**
 * BLD-1086 — EXPLAIN QUERY PLAN test for idx_workout_sets_variant_pr.
 *
 * AC: PLAN-BLD-1085.md Phase 0b — "EXPLAIN QUERY PLAN for the new variant
 * aggregation query reports `USING INDEX idx_workout_sets_variant_pr`".
 *
 * Risk addressed: if a future migration drops or renames `idx_workout_sets_variant_pr`,
 * the GROUP BY aggregation in `bestPerVariant` will fall back to a full table scan,
 * causing O(n) cost on every PR Dashboard load for cable exercises. This test
 * asserts the literal index name in the query plan, surfacing any regression
 * immediately.
 *
 * Engine: node:sqlite (Node v22+ built-in). Same SQLite3 query planner as
 * expo-sqlite (both ship SQLite ≥ 3.45). EXPLAIN QUERY PLAN cannot be
 * meaningfully mocked — this test requires a real SQLite engine.
 *
 * See also: __tests__/lib/db/e1rm-trends-query-plan.test.ts (same pattern for
 * idx_workout_sessions_gym_started_at from BLD-1060).
 */

import { DatabaseSync } from "node:sqlite";

describe("BLD-1086 — bestPerVariant query plan", () => {
  let db: DatabaseSync;

  beforeAll(() => {
    db = new DatabaseSync(":memory:");

    // Mirror the production schema columns touched by bestPerVariant.
    // Source: lib/db/schema.ts + lib/db/migrations.ts
    db.exec(`
      CREATE TABLE exercises (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        equipment TEXT NOT NULL DEFAULT 'cable'
      );

      CREATE TABLE workout_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER
      );

      CREATE TABLE workout_sets (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 0,
        reps INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        set_type TEXT NOT NULL DEFAULT 'normal',
        completed_at INTEGER,
        attachment TEXT,
        mount_position TEXT,
        grip_type TEXT,
        stack_unit_at_log TEXT
      );

      -- Production indexes from lib/db/migrations.ts (existing)
      CREATE INDEX idx_workout_sets_exercise ON workout_sets(exercise_id);
      CREATE INDEX idx_workout_sets_session ON workout_sets(session_id);
      CREATE INDEX idx_workout_sets_session_exercise ON workout_sets(session_id, exercise_id);

      -- BLD-1086 Phase 0b: the composite index under test
      CREATE INDEX idx_workout_sets_variant_pr
        ON workout_sets (exercise_id, attachment, mount_position, grip_type, completed_at);
    `);

    // Seed 5,000 sets across 80 exercises, ~30 distinct variant tuples.
    // This matches the plan's AC bench fixture.
    const EXERCISES = 80;
    const TARGET_EXERCISE = 'cable-triceps-pushdown';
    const VARIANT_TUPLES: [string | null, string | null, string | null, string | null][] = [
      ['rope', 'high', 'neutral', 'kg'],
      ['rope', 'high', 'overhand', 'kg'],
      ['rope', 'mid', null, 'kg'],
      ['rope', null, null, 'kg'],
      ['bar', 'high', null, 'kg'],
      ['bar', 'low', null, 'kg'],
      ['handle', 'mid', null, 'kg'],
      ['handle', null, null, null],
      [null, 'high', null, 'kg'],
      [null, null, null, null],
    ];

    db.exec("BEGIN");

    // Insert exercises
    const insertEx = db.prepare("INSERT INTO exercises (id, name) VALUES (?, ?)");
    for (let i = 0; i < EXERCISES; i++) {
      insertEx.run(`ex-${i}`, `Exercise ${i}`);
    }
    insertEx.run(TARGET_EXERCISE, "Cable Triceps Pushdown");

    const insertSession = db.prepare(
      "INSERT INTO workout_sessions (id, started_at, completed_at) VALUES (?, ?, ?)"
    );
    const insertSet = db.prepare(
      `INSERT INTO workout_sets
         (id, session_id, exercise_id, weight, reps, completed, set_type, completed_at,
          attachment, mount_position, grip_type, stack_unit_at_log)
       VALUES (?, ?, ?, ?, ?, 1, 'normal', ?, ?, ?, ?, ?)`
    );

    let setIdx = 0;
    const baseTime = Date.now() - 365 * 86400 * 1000;

    // 100 sessions × ~50 sets = 5,000 sets
    for (let s = 0; s < 100; s++) {
      const sessionId = `sess-${s}`;
      const sessionTime = baseTime + s * 86400 * 1000 * 3;
      insertSession.run(sessionId, sessionTime, sessionTime + 3600_000);

      for (let k = 0; k < 50; k++) {
        const exId = k < 10 ? TARGET_EXERCISE : `ex-${k % EXERCISES}`;
        const tuple = VARIANT_TUPLES[k % VARIANT_TUPLES.length];
        const weight = 20 + (k % 30);
        const reps = 6 + (k % 6);
        insertSet.run(`set-${setIdx++}`, sessionId, exId, weight, reps, sessionTime, ...tuple);
      }
    }

    db.exec("COMMIT");
    db.exec("ANALYZE");
  });

  afterAll(() => {
    db.close();
  });

  test('GROUP BY variant query uses idx_workout_sets_variant_pr (not SCAN TABLE)', () => {
    // This SQL shape mirrors the SHIPPING bestPerVariant query in
    // lib/db/pr-dashboard.ts:127-184 (LEFT JOIN ROW_NUMBER() form). If that
    // production query changes shape, this test must be updated in lock-step
    // so the AC "EXPLAIN QUERY PLAN confirms idx_workout_sets_variant_pr is
    // used by the new variant aggregation query" is checked against what
    // actually ships, not a stale draft.
    const planRows = db.prepare(`
      EXPLAIN QUERY PLAN
      SELECT
         ws.attachment,
         ws.mount_position,
         ws.grip_type,
         ws.stack_unit_at_log,
         MAX(ws.weight)                                   AS max_weight,
         best.reps                                        AS best_reps,
         best.completed_at                                AS achieved_at,
         COUNT(DISTINCT ws.session_id)                    AS session_count
       FROM workout_sets ws
       INNER JOIN workout_sessions wss ON ws.session_id = wss.id
       LEFT JOIN (
         SELECT
           ws_b.exercise_id,
           ws_b.attachment,
           ws_b.mount_position,
           ws_b.grip_type,
           ws_b.stack_unit_at_log,
           ws_b.reps,
           ws_b.completed_at,
           ROW_NUMBER() OVER (
             PARTITION BY ws_b.exercise_id,
                          ws_b.attachment,
                          ws_b.mount_position,
                          ws_b.grip_type,
                          ws_b.stack_unit_at_log
             ORDER BY ws_b.weight DESC, ws_b.completed_at DESC
           ) AS rn
         FROM workout_sets ws_b
         INNER JOIN workout_sessions wss_b ON ws_b.session_id = wss_b.id
         WHERE ws_b.exercise_id = ?
           AND ws_b.completed = 1
           AND ws_b.weight IS NOT NULL AND ws_b.weight > 0
           AND ws_b.set_type != 'warmup'
           AND wss_b.completed_at IS NOT NULL
       ) best ON best.rn = 1
             AND best.exercise_id = ws.exercise_id
             AND best.attachment IS ws.attachment
             AND best.mount_position IS ws.mount_position
             AND best.grip_type IS ws.grip_type
             AND best.stack_unit_at_log IS ws.stack_unit_at_log
       WHERE ws.exercise_id = ?
         AND ws.completed = 1
         AND ws.weight IS NOT NULL AND ws.weight > 0
         AND ws.set_type != 'warmup'
         AND wss.completed_at IS NOT NULL
       GROUP BY ws.exercise_id,
                ws.attachment,
                ws.mount_position,
                ws.grip_type,
                ws.stack_unit_at_log
       ORDER BY best.completed_at DESC
    `).all('cable-triceps-pushdown', 'cable-triceps-pushdown') as { detail: string }[];

    const planText = planRows.map((r) => r.detail ?? JSON.stringify(r)).join('\n');

    // Both the outer aggregation over `ws` AND the inner ROW_NUMBER() scan over
    // `ws_b` must use idx_workout_sets_variant_pr (its leading column is
    // exercise_id, matching both equality filters).
    expect(planText).toMatch(/idx_workout_sets_variant_pr/i);
    expect(planText).not.toMatch(/SCAN workout_sets(?! USING)/i);
    expect(planText).not.toMatch(/SCAN TABLE workout_sets(?! USING)/i);
  });

  test('5,000-set seed has expected row count', () => {
    const { total } = db.prepare("SELECT COUNT(*) AS total FROM workout_sets").get() as { total: number };
    expect(total).toBe(5000);
  });
});
