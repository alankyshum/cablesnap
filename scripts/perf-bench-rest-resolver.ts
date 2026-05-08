#!/usr/bin/env node
/**
 * BLD-1100 — Performance benchmark for lib/rest-resolver.ts (AC8).
 *
 * Verifies two things:
 *   1. P95 latency of the history-median query over 100 runs on a 10 k-set fixture
 *      is ≤ 30 ms.
 *   2. EXPLAIN QUERY PLAN confirms the planner uses
 *      idx_workout_sets_exercise_completed_at (fails if it does not).
 *
 * Uses Node.js built-in `node:sqlite` (Node 22+) so it runs without any RN
 * bundler or expo-sqlite dependency. SQL and constants are inlined to avoid
 * transitive RN bundle resolution — they must stay in sync with
 * lib/rest-resolver.ts queryHistoryMedian.
 *
 * Usage (from repo root):
 *   node --experimental-sqlite scripts/perf-bench-rest-resolver.ts
 *   # or: npx tsx --conditions=node scripts/perf-bench-rest-resolver.ts
 *
 * The script exits with code 1 on any failure so CI can gate on it.
 */
/* eslint-disable no-console, @typescript-eslint/no-explicit-any */

// @ts-expect-error — node:sqlite available in Node 22+; typedefs may lag toolchain
import { DatabaseSync } from "node:sqlite";

// ─── Constants (must stay in sync with lib/rest-resolver.ts) ─────────────────
const WORK_ESTIMATE_SECONDS_PER_REP = 2;
const HISTORY_WINDOW_DAYS = 30;
const HISTORY_FLOOR_SECONDS = 15;
const HISTORY_CEILING_SECONDS = 600;

const RUNS = 100;
const P95_TARGET_MS = 30;
const FIXTURE_SETS = 10_000;

// ─── Seed helpers ─────────────────────────────────────────────────────────────

function seedFixture(db: any, exerciseId: string): void {
  db.exec(`PRAGMA journal_mode=WAL`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      user_rest_seconds INTEGER DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS workout_sets (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      exercise_id TEXT,
      completed_at INTEGER,
      reps INTEGER,
      duration_seconds INTEGER,
      link_id TEXT,
      set_type TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise_completed_at
      ON workout_sets (exercise_id, completed_at)
      WHERE completed_at IS NOT NULL;
  `);

  db.exec("DELETE FROM workout_sets");
  db.exec("DELETE FROM exercises");
  db.prepare("INSERT OR IGNORE INTO exercises (id, user_rest_seconds) VALUES (?, NULL)").run(exerciseId);

  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - HISTORY_WINDOW_DAYS * 86_400;
  const stmt = db.prepare(
    "INSERT INTO workout_sets (id, session_id, exercise_id, completed_at, reps, duration_seconds, link_id, set_type) VALUES (?, ?, ?, ?, ?, NULL, NULL, 'normal')"
  );

  db.exec("BEGIN");
  for (let i = 0; i < FIXTURE_SETS / 2; i++) {
    const ts = windowStart + Math.floor((i / (FIXTURE_SETS / 2)) * HISTORY_WINDOW_DAYS * 86_400);
    stmt.run(`tgt-${i}`, "sess1", exerciseId, ts, 10);
  }
  for (let i = 0; i < FIXTURE_SETS / 2; i++) {
    const ts = windowStart + Math.floor((i / (FIXTURE_SETS / 2)) * HISTORY_WINDOW_DAYS * 86_400);
    stmt.run(`oth-${i}`, "sess1", `other-exercise-${i % 100}`, ts, 10);
  }
  db.exec("COMMIT");
}

// ─── History query (mirrors lib/rest-resolver.ts queryHistoryMedian) ──────────
// Must stay in sync with the CTE in queryHistoryMedian.

const HISTORY_QUERY = `
  WITH pairs AS (
    SELECT
      completed_at AS curr_at,
      LAG(completed_at) OVER w AS prev_at,
      COALESCE(duration_seconds, ${WORK_ESTIMATE_SECONDS_PER_REP} * COALESCE(reps, 0)) AS work_est,
      link_id AS curr_link_id,
      LAG(link_id) OVER w AS prev_link_id,
      set_type
    FROM workout_sets
    WHERE exercise_id = ?
      AND completed_at IS NOT NULL
      AND completed_at >= ?
    WINDOW w AS (ORDER BY completed_at ASC)
  )
  SELECT (curr_at - work_est - prev_at) AS actual_rest
  FROM pairs
  WHERE prev_at IS NOT NULL
    AND curr_link_id IS NULL
    AND prev_link_id IS NULL
    AND set_type = ?
    AND (curr_at - work_est - prev_at) >= ${HISTORY_FLOOR_SECONDS}
    AND (curr_at - work_est - prev_at) <= ${HISTORY_CEILING_SECONDS}
`;

function runBench(): void {
  const db = new DatabaseSync(":memory:");
  const exerciseId = "bench-exercise-uuid";
  seedFixture(db, exerciseId);

  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - HISTORY_WINDOW_DAYS * 86_400;

  // ─── AC8 Part 1: EXPLAIN QUERY PLAN assertion ─────────────────────────────
  const planRows = db.prepare(`EXPLAIN QUERY PLAN ${HISTORY_QUERY}`).all(exerciseId, windowStart, "normal") as { detail: string }[];
  const planText = planRows.map((r) => r.detail ?? JSON.stringify(r)).join("\n");
  console.log("\n=== EXPLAIN QUERY PLAN ===");
  console.log(planText);
  if (!planText.includes("idx_workout_sets_exercise_completed_at")) {
    console.error("\n❌ FAIL: Planner did not use idx_workout_sets_exercise_completed_at");
    console.error("Plan output:\n", planText);
    process.exit(1);
  }
  console.log("✅ Index assertion passed: idx_workout_sets_exercise_completed_at is used.\n");

  // ─── AC8 Part 2: latency P95 ≤ 30 ms ─────────────────────────────────────
  const stmt = db.prepare(HISTORY_QUERY);
  const latencies: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    stmt.all(exerciseId, windowStart, "normal");
    latencies.push(performance.now() - start);
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(RUNS * 0.5)];
  const p95 = latencies[Math.floor(RUNS * 0.95)];
  const p99 = latencies[Math.floor(RUNS * 0.99)];

  console.log(`Latency over ${RUNS} runs on ${FIXTURE_SETS}-set fixture:`);
  console.log(`  P50 = ${p50.toFixed(2)} ms`);
  console.log(`  P95 = ${p95.toFixed(2)} ms  (target ≤ ${P95_TARGET_MS} ms)`);
  console.log(`  P99 = ${p99.toFixed(2)} ms`);

  if (p95 > P95_TARGET_MS) {
    console.error(`\n❌ FAIL: P95 ${p95.toFixed(2)} ms exceeds ${P95_TARGET_MS} ms target`);
    process.exit(1);
  }

  console.log(`\n✅ PASS: P95 ${p95.toFixed(2)} ms ≤ ${P95_TARGET_MS} ms`);
  db.close();
}

runBench();
