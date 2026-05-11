/**
 * BLD-1174 AC #268 — Analytics parity for advanced set types.
 *
 * GIVEN a fixture session containing:
 *   - rest_pause: 8+3+2 @ 100kg
 *   - cluster:    3+3+2 @ 100/100/95kg (segment-level weight overrides)
 *   - myo_reps:   15+5+5+4+3 @ 25kg
 *
 * THEN the cached column values computed by computeSetCacheValues() match
 * hand-computed reference values within ±0.01, AND the analytics SQL
 * expressions reading those cached columns produce the expected sums.
 *
 * Strategy: uses computeSetCacheValues (pure) for cache computation assertions,
 * and node:sqlite for SQL aggregate assertions against a seeded in-memory DB.
 */

import { DatabaseSync } from "node:sqlite";
import { computeSetCacheValues } from "../lib/db/sets";
import { migrate } from "../lib/db/migrations";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Hand-computed reference values ───────────────────────────────────────────
// rest_pause: 8+3+2 @ 100kg
//   cached_volume_kg = (8+3+2) × 100 = 1300
//   cached_e1rm_kg   = MAX(100×(1+8/30), 100×(1+3/30), 100×(1+2/30))
//                    = MAX(126.667, 110, 106.667) = 126.667
const REF_RP_VOLUME  = 1300;
const REF_RP_E1RM    = 100 * (1 + 8 / 30); // ≈ 126.667

// cluster: 3+3+2 @ 100/100/95kg segment-level overrides
//   cached_volume_kg = 3×100 + 3×100 + 2×95 = 300 + 300 + 190 = 790
//   cached_e1rm_kg   = MAX(100×(1+3/30), 100×(1+3/30), 95×(1+2/30))
//                    = MAX(110, 110, 101.333) = 110
const REF_CL_VOLUME  = 790;
const REF_CL_E1RM    = 100 * (1 + 3 / 30); // = 110

// myo_reps: 15+5+5+4+3 @ 25kg (all same weight)
//   cached_volume_kg = (15+5+5+4+3) × 25 = 32 × 25 = 800
//   cached_e1rm_kg   = MAX(25×(1+15/30), 25×(1+5/30), ...) = 25×(1+15/30) = 37.5
const REF_MR_VOLUME  = 800;
const REF_MR_E1RM    = 25 * (1 + 15 / 30); // = 37.5

// ── Pure computeSetCacheValues assertions ─────────────────────────────────────

describe("BLD-1174 AC#268 — computeSetCacheValues: rest_pause 8+3+2 @100kg", () => {
  const result = computeSetCacheValues(
    { weight: 100, reps: 13, isAdvancedSet: true },
    [
      { reps: 8, weight: null },
      { reps: 3, weight: null },
      { reps: 2, weight: null },
    ]
  );

  it("cached_volume_kg = 1300", () => {
    expect(result.cachedVolumeKg).toBeCloseTo(REF_RP_VOLUME, 2);
  });

  it("cached_e1rm_kg ≈ 126.67 (max-segment Epley)", () => {
    expect(result.cachedE1rmKg).toBeCloseTo(REF_RP_E1RM, 2);
  });

  it("totalReps = 13", () => {
    expect(result.totalReps).toBe(13);
  });
});

describe("BLD-1174 AC#268 — computeSetCacheValues: cluster 3+3+2 @100/100/95kg", () => {
  const result = computeSetCacheValues(
    { weight: 100, reps: 8, isAdvancedSet: true },
    [
      { reps: 3, weight: 100 },
      { reps: 3, weight: 100 },
      { reps: 2, weight: 95 },
    ]
  );

  it("cached_volume_kg = 790", () => {
    expect(result.cachedVolumeKg).toBeCloseTo(REF_CL_VOLUME, 2);
  });

  it("cached_e1rm_kg = 110 (max of two equal 100kg×3 segments)", () => {
    expect(result.cachedE1rmKg).toBeCloseTo(REF_CL_E1RM, 2);
  });

  it("totalReps = 8", () => {
    expect(result.totalReps).toBe(8);
  });
});

describe("BLD-1174 AC#268 — computeSetCacheValues: myo_reps 15+5+5+4+3 @25kg", () => {
  const result = computeSetCacheValues(
    { weight: 25, reps: 32, isAdvancedSet: true },
    [
      { reps: 15, weight: null },
      { reps: 5,  weight: null },
      { reps: 5,  weight: null },
      { reps: 4,  weight: null },
      { reps: 3,  weight: null },
    ]
  );

  it("cached_volume_kg = 800", () => {
    expect(result.cachedVolumeKg).toBeCloseTo(REF_MR_VOLUME, 2);
  });

  it("cached_e1rm_kg = 37.5 (activation segment wins)", () => {
    expect(result.cachedE1rmKg).toBeCloseTo(REF_MR_E1RM, 2);
  });

  it("totalReps = 32", () => {
    expect(result.totalReps).toBe(32);
  });
});

// ── SQL aggregate assertions using in-memory SQLite ───────────────────────────

describe("BLD-1174 AC#268 — SQL analytics parity: cached columns produce correct aggregates", () => {
  let db: InstanceType<typeof DatabaseSync>;
  let wdb: ReturnType<typeof wrapDb>;

  const NOW = 1_700_000_000_000;
  const SESSION_ID = "sess_fixture";

  beforeAll(async () => {
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    wdb = wrapDb(db);
    await migrate(wdb as Parameters<typeof migrate>[0]);

    // Insert a session
    db.exec(`
      INSERT INTO workout_sessions (id, started_at, completed_at, duration_seconds, kind)
      VALUES ('${SESSION_ID}', ${NOW - 3600_000}, ${NOW}, 3600, 'workout')
    `);

    // Insert a sample exercise
    db.prepare(
      `INSERT OR IGNORE INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty)
       VALUES ('ex1', 'Press', 'chest', '[]', '[]', 'barbell', '', 'intermediate')`
    ).run();

    // Insert 3 sets with pre-computed cached values
    const sets = [
      { id: "set_rp",  set_type: "rest_pause", reps: 13, weight: 100, cv: REF_RP_VOLUME, ce: REF_RP_E1RM },
      { id: "set_cl",  set_type: "cluster",    reps: 8,  weight: 100, cv: REF_CL_VOLUME, ce: REF_CL_E1RM },
      { id: "set_mr",  set_type: "myo_reps",   reps: 32, weight: 25,  cv: REF_MR_VOLUME, ce: REF_MR_E1RM },
    ];
    for (let i = 0; i < sets.length; i++) {
      const s = sets[i];
      db.prepare(
        `INSERT INTO workout_sets
           (id, session_id, exercise_id, set_number, set_type, reps, weight,
            cached_volume_kg, cached_e1rm_kg, completed, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,1,?)`
      ).run(s.id, SESSION_ID, "ex1", i + 1, s.set_type, s.reps, s.weight, s.cv, s.ce, NOW);
    }

    // Also insert one warmup set (should be excluded from analytics)
    db.prepare(
      `INSERT INTO workout_sets
         (id, session_id, exercise_id, set_number, set_type, reps, weight,
          cached_volume_kg, cached_e1rm_kg, completed, created_at)
       VALUES ('set_wu', ?, 'ex1', 0, 'warmup', 5, 60, 300, 62, 1, ?)`
    ).run(SESSION_ID, NOW);
  });

  it("SUM(cached_volume_kg) excludes warmup and equals 1300+790+800=2890", async () => {
    const row = await wdb.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(ws.cached_volume_kg), 0) AS total
         FROM workout_sets ws
         JOIN workout_sessions wss ON ws.session_id = wss.id
        WHERE ws.completed = 1
          AND ws.set_type != 'warmup'
          AND wss.completed_at IS NOT NULL`
    );
    expect(row!.total).toBeCloseTo(REF_RP_VOLUME + REF_CL_VOLUME + REF_MR_VOLUME, 2);
  });

  it("MAX(cached_e1rm_kg) is the rest_pause set ≈ 126.67", async () => {
    const row = await wdb.getFirstAsync<{ max_e1rm: number }>(
      `SELECT MAX(ws.cached_e1rm_kg) AS max_e1rm
         FROM workout_sets ws
         JOIN workout_sessions wss ON ws.session_id = wss.id
        WHERE ws.completed = 1
          AND ws.set_type != 'warmup'
          AND ws.cached_e1rm_kg > 0
          AND wss.completed_at IS NOT NULL`
    );
    expect(row!.max_e1rm).toBeCloseTo(REF_RP_E1RM, 2);
  });

  it("volume per-session sum = 2890 (matches monthly/weekly-summary pattern)", async () => {
    const rows = await wdb.getAllAsync<{ session_id: string; volume: number }>(
      `SELECT ws.session_id, SUM(ws.cached_volume_kg) AS volume
         FROM workout_sets ws
         JOIN workout_sessions wss ON ws.session_id = wss.id
        WHERE ws.completed = 1
          AND ws.set_type != 'warmup'
          AND wss.completed_at IS NOT NULL
        GROUP BY ws.session_id`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].volume).toBeCloseTo(2890, 2);
  });

  it("achievements: max single-session volume = 2890", async () => {
    const row = await wdb.getFirstAsync<{ volume: number }>(
      `SELECT COALESCE(MAX(sv.volume), 0) AS volume FROM (
         SELECT ws.session_id, SUM(ws.cached_volume_kg) AS volume
           FROM workout_sets ws
           JOIN workout_sessions wss ON ws.session_id = wss.id
          WHERE ws.completed = 1
            AND ws.set_type != 'warmup'
            AND ws.cached_volume_kg > 0
            AND wss.completed_at IS NOT NULL
          GROUP BY ws.session_id
       ) sv`
    );
    expect(row!.volume).toBeCloseTo(2890, 2);
  });

  it("legacy warmup set is excluded: total without it = 2890 not 3190", async () => {
    const row = await wdb.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(ws.cached_volume_kg), 0) AS total
         FROM workout_sets ws
         JOIN workout_sessions wss ON ws.session_id = wss.id
        WHERE ws.completed = 1
          AND ws.set_type != 'warmup'
          AND wss.completed_at IS NOT NULL`
    );
    expect(row!.total).not.toBeCloseTo(3190, 2); // 2890 + 300 warmup
    expect(row!.total).toBeCloseTo(2890, 2);
  });
});
