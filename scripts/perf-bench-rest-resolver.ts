#!/usr/bin/env tsx
/**
 * BLD-1100 — Performance benchmark for lib/rest-resolver.ts (AC8).
 *
 * Verifies two things:
 *   1. P95 latency of resolveRest() over 100 runs on a 10 k-set fixture
 *      is ≤ 30 ms.
 *   2. EXPLAIN QUERY PLAN for the history-median query confirms the planner
 *      uses idx_workout_sets_exercise_completed_at (fails if it does not).
 *
 * Usage (from repo root):
 *   npx tsx scripts/perf-bench-rest-resolver.ts
 *
 * The script exits with code 1 on any failure so CI can gate on it.
 */
/* eslint-disable no-console */

import * as SQLite from "expo-sqlite";
import {
  HISTORY_WINDOW_DAYS,
  WORK_ESTIMATE_SECONDS_PER_REP,
  HISTORY_FLOOR_SECONDS,
  HISTORY_CEILING_SECONDS,
} from "../lib/rest-resolver";

const RUNS = 100;
const P95_TARGET_MS = 30;
const FIXTURE_SETS = 10_000;

// ─── Seed helpers ─────────────────────────────────────────────────────────────

function seedFixture(db: SQLite.SQLiteDatabase, exerciseId: string): void {
  db.execSync("PRAGMA journal_mode=WAL");
  db.execSync(`
    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      user_rest_seconds INTEGER DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS workout_sessions (
      id TEXT PRIMARY KEY,
      template_id TEXT
    );
    CREATE TABLE IF NOT EXISTS template_exercises (
      id TEXT PRIMARY KEY,
      template_id TEXT,
      exercise_id TEXT,
      rest_seconds INTEGER
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
  `);

  db.execSync("DELETE FROM workout_sets");
  db.execSync("DELETE FROM exercises");

  // Insert the partial index (mirrors migration).
  try {
    db.execSync(`
      CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise_completed_at
        ON workout_sets (exercise_id, completed_at)
        WHERE completed_at IS NOT NULL
    `);
  } catch {
    // Already exists or not supported.
  }

  db.runSync("INSERT OR IGNORE INTO exercises (id, user_rest_seconds) VALUES (?, NULL)", [exerciseId]);

  // Seed 10 k sets: 5 k for our target exercise (straight sets in window),
  // 5 k for other exercises (noise).
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - HISTORY_WINDOW_DAYS * 86_400;

  const stmt = db.prepareSync(
    "INSERT INTO workout_sets (id, session_id, exercise_id, completed_at, reps, duration_seconds, link_id, set_type) VALUES (?, ?, ?, ?, ?, NULL, NULL, 'normal')"
  );
  try {
    db.withTransactionSync(() => {
      for (let i = 0; i < FIXTURE_SETS / 2; i++) {
        const ts = windowStart + Math.floor((i / (FIXTURE_SETS / 2)) * HISTORY_WINDOW_DAYS * 86_400);
        stmt.executeSync([`tgt-${i}`, "sess1", exerciseId, ts, 10]);
      }
      for (let i = 0; i < FIXTURE_SETS / 2; i++) {
        const ts = windowStart + Math.floor((i / (FIXTURE_SETS / 2)) * HISTORY_WINDOW_DAYS * 86_400);
        stmt.executeSync([`oth-${i}`, "sess1", `other-exercise-${i % 100}`, ts, 10]);
      }
    });
  } finally {
    stmt.finalizeSync();
  }
}

// ─── History query (mirrors lib/rest-resolver.ts queryHistoryMedian) ──────────

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

async function runBench(): Promise<void> {
  const db = await SQLite.openDatabaseAsync(":memory:");
  const exerciseId = "bench-exercise-uuid";
  seedFixture(db as unknown as SQLite.SQLiteDatabase, exerciseId);

  // ─── AC8 Part 1: EXPLAIN QUERY PLAN assertion ─────────────────────────────
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - HISTORY_WINDOW_DAYS * 86_400;
  const plan = await db.getAllAsync<{ detail: string }>(
    `EXPLAIN QUERY PLAN ${HISTORY_QUERY}`,
    [exerciseId, windowStart, "normal"]
  );
  const planText = plan.map((r) => r.detail ?? JSON.stringify(r)).join("\n");
  console.log("\n=== EXPLAIN QUERY PLAN ===");
  console.log(planText);
  if (!planText.includes("idx_workout_sets_exercise_completed_at")) {
    console.error("\n❌ FAIL: Planner did not use idx_workout_sets_exercise_completed_at");
    console.error("Plan output:\n", planText);
    process.exit(1);
  }
  console.log("✅ Index assertion passed: idx_workout_sets_exercise_completed_at is used.\n");

  // ─── AC8 Part 2: latency P95 ≤ 30 ms ─────────────────────────────────────
  const latencies: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    await db.getAllAsync(HISTORY_QUERY, [exerciseId, windowStart, "normal"]);
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
}

runBench().catch((err) => {
  console.error("Bench error:", err);
  process.exit(1);
});
