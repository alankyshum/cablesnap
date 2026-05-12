/**
 * BLD-1174 AC (from plan §261) — Legacy analytics parity.
 *
 * GIVEN a pre-BLD-1168 session (normal sets only, no segments, cached columns
 *       backfilled via migration: cached_volume_kg = weight*reps,
 *       cached_e1rm_kg = weight*(1+reps/30))
 * WHEN analytics SQL queries reading cached columns are run
 * THEN every numeric output matches what the pre-BLD-1168 formula would have
 *      produced (weight*reps for volume, weight*(1+reps/30) for e1RM).
 *      No analytic regression on legacy data.
 *
 * Strategy: seeds 5 representative legacy normal/dropset/failure sets,
 * computes expected values using the legacy formula, then asserts the
 * cached-column analytics SQL produces identical results.
 */

import { DatabaseSync } from "node:sqlite";
import { migrate } from "../lib/db/migrations";

// ── Thin async shim ────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
type SqlParam = null | number | bigint | string | Uint8Array;

function wrapDb(db: InstanceType<typeof DatabaseSync>) {
  return {
    execAsync: async (sql: string): Promise<void> => { db.exec(sql); },
    getAllAsync: async <T = Row>(sql: string, params?: unknown[]): Promise<T[]> =>
      db.prepare(sql).all(...((params ?? []) as SqlParam[])) as T[],
    getFirstAsync: async <T = Row>(sql: string, params?: unknown[]): Promise<T | null> =>
      (db.prepare(sql).get(...((params ?? []) as SqlParam[])) as T) ?? null,
    runAsync: async (sql: string, params?: unknown[]): Promise<{ changes: number }> => {
      const result = db.prepare(sql).run(...((params ?? []) as SqlParam[]));
      return { changes: Number(result.changes) };
    },
  };
}

// ── Legacy fixture sets (normal/dropset/failure — no segments) ────────────────

const LEGACY_SETS = [
  { id: "l1", set_type: "normal",  weight: 100, reps: 5 },
  { id: "l2", set_type: "normal",  weight: 80,  reps: 8 },
  { id: "l3", set_type: "dropset", weight: 70,  reps: 10 },
  { id: "l4", set_type: "failure", weight: 60,  reps: 12 },
  { id: "l5", set_type: "normal",  weight: 120, reps: 3 },
];

// Hand-computed expected totals using legacy formulas (now populated in cached columns by backfill)
const EXPECTED_VOLUME = LEGACY_SETS.reduce((s, r) => s + r.weight * r.reps, 0);
// e1RM per set; max across all non-warmup sets
const EXPECTED_MAX_E1RM = Math.max(...LEGACY_SETS.map(r => r.weight * (1 + r.reps / 30)));

describe("BLD-1174 — legacy analytics parity: no regression on pre-BLD-1168 normal sets", () => {
  let db: InstanceType<typeof DatabaseSync>;
  let wdb: ReturnType<typeof wrapDb>;

  const NOW = 1_700_100_000_000;
  const SESSION_ID = "sess_legacy";

  beforeAll(async () => {
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    wdb = wrapDb(db);
    await migrate(wdb as Parameters<typeof migrate>[0]);

    db.exec(`
      INSERT INTO workout_sessions (id, name, started_at, completed_at, duration_seconds, kind)
      VALUES ('${SESSION_ID}', 'Legacy Test Session', ${NOW - 3600_000}, ${NOW}, 3600, 'workout')
    `);

    db.prepare(
      `INSERT OR IGNORE INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty)
       VALUES ('ex_legacy', 'Squat', 'quads', '[]', '[]', 'barbell', '', 'intermediate')`
    ).run();

    // Seed legacy sets with cached columns set to the legacy formula values
    // (simulates migration backfill: cached_volume_kg = weight*reps, cached_e1rm_kg = weight*(1+reps/30))
    for (let i = 0; i < LEGACY_SETS.length; i++) {
      const s = LEGACY_SETS[i];
      const cv = s.weight * s.reps;
      const ce = s.weight * (1 + s.reps / 30);
      db.prepare(
        `INSERT INTO workout_sets
           (id, session_id, exercise_id, set_number, set_type, reps, weight,
            cached_volume_kg, cached_e1rm_kg, completed)
         VALUES (?,?,?,?,?,?,?,?,?,1)`
      ).run(s.id, SESSION_ID, "ex_legacy", i + 1, s.set_type, s.reps, s.weight, cv, ce);
    }

    // Add a warmup set (must be excluded from all analytics)
    db.prepare(
      `INSERT INTO workout_sets
         (id, session_id, exercise_id, set_number, set_type, reps, weight,
          cached_volume_kg, cached_e1rm_kg, completed)
       VALUES ('l_wu', ?, 'ex_legacy', 0, 'warmup', 10, 40, 400, 41.33, 1)`
    ).run(SESSION_ID);
  });

  it("total volume (cached) matches legacy weight*reps sum", async () => {
    const row = await wdb.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(ws.cached_volume_kg), 0) AS total
         FROM workout_sets ws
         JOIN workout_sessions wss ON ws.session_id = wss.id
        WHERE ws.completed = 1 AND ws.set_type != 'warmup'
          AND wss.completed_at IS NOT NULL`
    );
    expect(row!.total).toBeCloseTo(EXPECTED_VOLUME, 2);
  });

  it("max e1RM (cached) matches legacy formula", async () => {
    const row = await wdb.getFirstAsync<{ max_e1rm: number }>(
      `SELECT MAX(ws.cached_e1rm_kg) AS max_e1rm
         FROM workout_sets ws
         JOIN workout_sessions wss ON ws.session_id = wss.id
        WHERE ws.completed = 1 AND ws.set_type != 'warmup'
          AND ws.cached_e1rm_kg > 0
          AND wss.completed_at IS NOT NULL`
    );
    expect(row!.max_e1rm).toBeCloseTo(EXPECTED_MAX_E1RM, 2);
  });

  it("warmup set is excluded: volume without warmup ≠ volume with warmup", async () => {
    const withWarmup = await wdb.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(ws.cached_volume_kg), 0) AS total
         FROM workout_sets ws JOIN workout_sessions wss ON ws.session_id = wss.id
        WHERE ws.completed = 1 AND wss.completed_at IS NOT NULL`
    );
    expect(withWarmup!.total).toBeCloseTo(EXPECTED_VOLUME + 400, 2); // includes warmup
    // Analytics queries exclude warmup — regression guard
    const row = await wdb.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(ws.cached_volume_kg), 0) AS total
         FROM workout_sets ws JOIN workout_sessions wss ON ws.session_id = wss.id
        WHERE ws.completed = 1 AND ws.set_type != 'warmup' AND wss.completed_at IS NOT NULL`
    );
    expect(row!.total).toBeCloseTo(EXPECTED_VOLUME, 2);
  });

  it("dropset and failure types are treated as working sets in volume sum", async () => {
    const dropsetVol = LEGACY_SETS.filter(s => s.set_type === 'dropset' || s.set_type === 'failure')
      .reduce((s, r) => s + r.weight * r.reps, 0);
    const row = await wdb.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(ws.cached_volume_kg), 0) AS total
         FROM workout_sets ws JOIN workout_sessions wss ON ws.session_id = wss.id
        WHERE ws.completed = 1 AND ws.set_type IN ('dropset', 'failure') AND wss.completed_at IS NOT NULL`
    );
    expect(row!.total).toBeCloseTo(dropsetVol, 2);
  });

  it("per-set cached_volume_kg = weight*reps for every legacy set", async () => {
    const rows = await wdb.getAllAsync<{ id: string; cached_volume_kg: number }>(
      `SELECT id, cached_volume_kg FROM workout_sets WHERE session_id = ? AND set_type != 'warmup'`,
      [SESSION_ID]
    );
    for (const row of rows) {
      const fixture = LEGACY_SETS.find(s => s.id === row.id)!;
      const expected = fixture.weight * fixture.reps;
      expect(row.cached_volume_kg).toBeCloseTo(expected, 2);
    }
  });

  it("per-set cached_e1rm_kg = weight*(1+reps/30) for every legacy set (reps ≤ 12)", async () => {
    const rows = await wdb.getAllAsync<{ id: string; cached_e1rm_kg: number }>(
      `SELECT id, cached_e1rm_kg FROM workout_sets WHERE session_id = ? AND set_type != 'warmup'`,
      [SESSION_ID]
    );
    for (const row of rows) {
      const fixture = LEGACY_SETS.find(s => s.id === row.id)!;
      const expected = fixture.weight * (1 + fixture.reps / 30);
      expect(row.cached_e1rm_kg).toBeCloseTo(expected, 2);
    }
  });
});

// ── AC #261: backfill caps cached_e1rm_kg at reps ≤ 12 for legacy normal sets ──
//
// Verifies that the migration backfill sets cached_e1rm_kg = 0 for sets with reps > 12
// so that the `WHERE cached_e1rm_kg > 0` gate in analytics queries is equivalent to
// the pre-BLD-1168 `AND ws.reps <= 12` filter.  Without this cap a user's "best e1RM"
// could jump ~25 % after migration with no new training stimulus.

describe("BLD-1174 AC #261 — backfill caps high-rep sets: cached_e1rm_kg = 0 for reps > 12", () => {
  let db2: InstanceType<typeof DatabaseSync>;
  let wdb2: ReturnType<typeof wrapDb>;

  const NOW2 = 1_700_200_000_000;
  const SID = "sess_hr";

  beforeAll(async () => {
    db2 = new DatabaseSync(":memory:");
    db2.exec("PRAGMA foreign_keys = ON;");
    wdb2 = wrapDb(db2);

    // First migrate call creates the schema (empty DB — backfill has nothing to process)
    await migrate(wdb2 as Parameters<typeof migrate>[0]);

    db2.exec(`
      INSERT INTO workout_sessions (id, name, started_at, completed_at, duration_seconds, kind)
      VALUES ('${SID}', 'High Rep Session', ${NOW2 - 3600_000}, ${NOW2}, 3600, 'workout')
    `);
    db2.prepare(
      `INSERT OR IGNORE INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty)
       VALUES ('ex_hr', 'Squat', 'quads', '[]', '[]', 'barbell', '', 'intermediate')`
    ).run();

    // Insert rows with cached columns = 0 (pre-backfill state)
    // l_high: reps=20 — must be excluded from e1RM analytics (AC #261)
    // l_low:  reps=10 — must be included in e1RM analytics
    db2.prepare(
      `INSERT INTO workout_sets
         (id, session_id, exercise_id, set_number, set_type, reps, weight,
          cached_volume_kg, cached_e1rm_kg, completed)
       VALUES (?,?,?,?,?,?,?,0,0,1)`
    ).run("l_high", SID, "ex_hr", 1, "normal", 20, 100);
    db2.prepare(
      `INSERT INTO workout_sets
         (id, session_id, exercise_id, set_number, set_type, reps, weight,
          cached_volume_kg, cached_e1rm_kg, completed)
       VALUES (?,?,?,?,?,?,?,0,0,1)`
    ).run("l_low", SID, "ex_hr", 2, "normal", 10, 80);

    // Second migrate call — idempotent schema DDL, backfill runs on rows with cached = 0
    await migrate(wdb2 as Parameters<typeof migrate>[0]);
  });

  it("high-rep set (reps=20) has cached_e1rm_kg = 0 after backfill", async () => {
    const row = await wdb2.getFirstAsync<{ cached_e1rm_kg: number }>(
      `SELECT cached_e1rm_kg FROM workout_sets WHERE id = 'l_high'`
    );
    expect(row!.cached_e1rm_kg).toBe(0);
  });

  it("high-rep set (reps=20) still gets cached_volume_kg = weight*reps after backfill", async () => {
    const row = await wdb2.getFirstAsync<{ cached_volume_kg: number }>(
      `SELECT cached_volume_kg FROM workout_sets WHERE id = 'l_high'`
    );
    expect(row!.cached_volume_kg).toBeCloseTo(100 * 20, 2);
  });

  it("low-rep set (reps=10) has cached_e1rm_kg = weight*(1+reps/30) after backfill", async () => {
    const row = await wdb2.getFirstAsync<{ cached_e1rm_kg: number }>(
      `SELECT cached_e1rm_kg FROM workout_sets WHERE id = 'l_low'`
    );
    expect(row!.cached_e1rm_kg).toBeCloseTo(80 * (1 + 10 / 30), 2);
  });

  it("MAX(cached_e1rm_kg) WHERE cached_e1rm_kg > 0 excludes l_high", async () => {
    const row = await wdb2.getFirstAsync<{ max_e1rm: number }>(
      `SELECT MAX(cached_e1rm_kg) AS max_e1rm
         FROM workout_sets
        WHERE session_id = ?
          AND cached_e1rm_kg > 0`,
      [SID]
    );
    // Should be l_low's value, not l_high's inflated value
    expect(row!.max_e1rm).toBeCloseTo(80 * (1 + 10 / 30), 2);
  });
});
