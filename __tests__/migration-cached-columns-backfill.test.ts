/**
 * BLD-1168 AC #275 — Migration backfill integration test.
 *
 * GIVEN a pre-1168 database (workout_sets rows with weight/reps but cached columns
 *       still at their DEFAULT 0 — which is the exact condition before the backfill)
 * WHEN migrate() is called (or re-called — it's idempotent)
 * THEN:
 *   - the workout_set_segments table is created
 *   - cached_volume_kg / cached_e1rm_kg columns are present on workout_sets
 *   - the backfill computes cached_volume_kg = weight*reps and
 *     cached_e1rm_kg = weight*(1.0+reps/30.0) for every non-null row
 *   - rows with NULL weight or NULL reps are left at 0 (untouched by backfill)
 *   - running migrate() twice produces the same results (idempotent)
 *
 * Strategy: fresh DB → migrate() once (schema ready, 0 rows) → insert
 * test rows (cached values default to 0) → migrate() again (backfill fires
 * on the 0-valued rows). This tests the actual backfill SQL path without
 * requiring a hand-crafted pre-migration schema snapshot.
 *
 * Uses node:sqlite in-memory engine via the thin async shim pattern from
 * __tests__/lib/db/migration-upgrade-paths.test.ts.
 */

import { DatabaseSync } from "node:sqlite";
import { migrate } from "../lib/db/migrations";
import { computeSetCacheValues } from "../lib/db/sets";

/**
 * Mirror of the migration backfill SQL for e1RM.
 * AC #261: legacy normal-set backfill caps at reps <= 12 so the
 * `WHERE cached_e1rm_kg > 0` analytics gate is equivalent to the
 * pre-BLD-1168 `AND ws.reps <= 12` filter.
 */
function backfillE1rm(weight: number | null, reps: number | null): number {
  if (weight == null || reps == null || reps <= 0) return 0;
  return reps <= 12 ? weight * (1 + reps / 30) : 0;
}

// ── Thin async shim (same as migration-upgrade-paths.test.ts) ────────────────

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

type WrappedDb = ReturnType<typeof wrapDb>;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("BLD-1168 AC#275 — migration cached-columns backfill (integration)", () => {
  const fixtures: Array<{
    id: string;
    weight: number | null;
    reps: number | null;
    label: string;
  }> = [
    { id: "set_100_5",  weight: 100, reps: 5,  label: "100kg×5" },
    { id: "set_80_8",   weight: 80,  reps: 8,  label: "80kg×8" },
    { id: "set_60_12",  weight: 60,  reps: 12, label: "60kg×12" },
    { id: "set_20_20",  weight: 20,  reps: 20, label: "20kg×20" },
    { id: "set_bw",     weight: 0,   reps: 10, label: "0kg×10 (bodyweight)" },
    { id: "set_null_w", weight: null, reps: 5, label: "null weight (skip)" },
    { id: "set_null_r", weight: 100, reps: null, label: "null reps (skip)" },
  ];

  let raw: InstanceType<typeof DatabaseSync>;
  let db: WrappedDb;

  beforeEach(async () => {
    raw = new DatabaseSync(":memory:");
    raw.exec("PRAGMA foreign_keys = ON;");
    db = wrapDb(raw);

    // First migrate: sets up the schema fully (no rows yet).
    await migrate(db as Parameters<typeof migrate>[0]);

    // Insert exercise + session — minimum required columns only.
    const now = Date.now();
    raw.exec(`
      INSERT INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty)
      VALUES ('ex1', 'Test Exercise', 'other', '[]', '[]', 'barbell', '', 'intermediate');
      INSERT INTO workout_sessions (id, name, started_at)
      VALUES ('sess1', 'Test', ${now});
    `);

    // Insert workout_sets with weight/reps but cached columns at their DEFAULT 0.
    // This simulates the state of legacy rows when the app first boots after the
    // BLD-1168 update: addColumnIfMissing added the columns with DEFAULT 0 and
    // the backfill has not yet run (or for new rows, weight/reps are non-zero
    // but cached values were never computed).
    for (const f of fixtures) {
      raw.prepare(
        "INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed) VALUES (?, 'sess1', 'ex1', 1, ?, ?, 1)"
      ).run(f.id, f.weight, f.reps);
    }

    // Second migrate: columns already exist (idempotent); backfill runs on
    // rows with cached_volume_kg = 0 AND cached_e1rm_kg = 0.
    await migrate(db as Parameters<typeof migrate>[0]);
  });

  it("migrate() ensures cached_volume_kg and cached_e1rm_kg columns exist on workout_sets", () => {
    const cols = raw.prepare("PRAGMA table_info(workout_sets)").all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("cached_volume_kg");
    expect(names).toContain("cached_e1rm_kg");
  });

  it("migrate() creates the workout_set_segments table with FK and unique index", () => {
    const tables = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='workout_set_segments'"
    ).all();
    expect(tables).toHaveLength(1);

    const indexes = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='workout_set_segments'"
    ).all() as Array<{ name: string }>;
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain("uq_set_segments_set_seg");
    expect(indexNames).toContain("idx_set_segments_set");
  });

  it.each(
    fixtures.filter((f) => f.weight !== null && f.reps !== null && f.weight > 0 && (f.reps ?? 0) > 0)
  )("backfill correct for $label", ({ id, weight, reps }) => {
    const row = raw.prepare(
      "SELECT cached_volume_kg, cached_e1rm_kg FROM workout_sets WHERE id = ?"
    ).get(id) as { cached_volume_kg: number; cached_e1rm_kg: number };

    const { cachedVolumeKg } = computeSetCacheValues({ weight, reps }, []);
    expect(row.cached_volume_kg).toBeCloseTo(cachedVolumeKg, 4);
    // AC #261: backfill caps e1RM at reps <= 12 to preserve legacy analytics parity
    expect(row.cached_e1rm_kg).toBeCloseTo(backfillE1rm(weight, reps), 4);
  });

  it("backfill skips rows with NULL weight (leaves cached at 0)", () => {
    const row = raw.prepare(
      "SELECT cached_volume_kg, cached_e1rm_kg FROM workout_sets WHERE id = 'set_null_w'"
    ).get() as { cached_volume_kg: number; cached_e1rm_kg: number };
    expect(row.cached_volume_kg).toBe(0);
    expect(row.cached_e1rm_kg).toBe(0);
  });

  it("backfill skips rows with NULL reps (leaves cached at 0)", () => {
    const row = raw.prepare(
      "SELECT cached_volume_kg, cached_e1rm_kg FROM workout_sets WHERE id = 'set_null_r'"
    ).get() as { cached_volume_kg: number; cached_e1rm_kg: number };
    expect(row.cached_volume_kg).toBe(0);
    expect(row.cached_e1rm_kg).toBe(0);
  });

  it("idempotent — running migrate() a third time does not corrupt cached values", async () => {
    await migrate(db as Parameters<typeof migrate>[0]);

    for (const f of fixtures.filter((fi) => fi.weight !== null && fi.reps !== null && fi.weight > 0 && (fi.reps ?? 0) > 0)) {
      const row = raw.prepare(
        "SELECT cached_volume_kg, cached_e1rm_kg FROM workout_sets WHERE id = ?"
      ).get(f.id) as { cached_volume_kg: number; cached_e1rm_kg: number };

      const { cachedVolumeKg } = computeSetCacheValues(
        { weight: f.weight, reps: f.reps },
        [],
      );
      expect(row.cached_volume_kg).toBeCloseTo(cachedVolumeKg, 4);
      // AC #261: backfill caps e1RM at reps <= 12
      expect(row.cached_e1rm_kg).toBeCloseTo(backfillE1rm(f.weight, f.reps), 4);
    }
  });
});
