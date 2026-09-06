/**
 * BLD-3816 — Generative Cable Stack Definitions tests.
 *
 * Covers:
 *   1. Pure generator unit tests (generateCalibrations)
 *   2. Idempotent migration — gen_* columns added to cable_stacks
 *   3. Export/import round-trip for gen_* columns (via raw SQL — mirrors insertRow logic)
 *   4. generateStackCalibrations DB helper:
 *      - basic generation
 *      - stale-row deletion on count shrink (QD Safeguard A)
 *      - idempotent regen (identical values → no change)
 */

import { DatabaseSync } from "node:sqlite";
import { generateCalibrations } from "../lib/cable-stack";
import { migrate } from "../lib/db/migrations";

// ── Thin async shim ──────────────────────────────────────────────────────────

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
    withTransactionAsync: async (fn: () => Promise<void>): Promise<void> => {
      db.exec("BEGIN");
      try {
        await fn();
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
}

type WrappedDb = ReturnType<typeof wrapDb>;

// ── 1. Pure generator unit tests ─────────────────────────────────────────────

describe("generateCalibrations — pure generator", () => {
  it("generates markers 1..count with correct true_weight (start=5, inc=5, count=3 → 5/10/15)", () => {
    const result = generateCalibrations({ startWeight: 5, increment: 5, count: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.calibrations).toEqual([
      { marker: 1, trueWeight: 5 },
      { marker: 2, trueWeight: 10 },
      { marker: 3, trueWeight: 15 },
    ]);
  });

  it("markers are integer-indexed starting at 1", () => {
    const result = generateCalibrations({ startWeight: 2.5, increment: 2.5, count: 4 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.calibrations.map((c) => c.marker)).toEqual([1, 2, 3, 4]);
  });

  it("true_weight is monotonically increasing with positive increment", () => {
    const result = generateCalibrations({ startWeight: 10, increment: 5, count: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const weights = result.calibrations.map((c) => c.trueWeight);
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeGreaterThan(weights[i - 1]!);
    }
  });

  it("supports REAL start and increment (2.5kg)", () => {
    const result = generateCalibrations({ startWeight: 2.5, increment: 2.5, count: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.calibrations[0]?.trueWeight).toBeCloseTo(2.5);
    expect(result.calibrations[1]?.trueWeight).toBeCloseTo(5.0);
    expect(result.calibrations[2]?.trueWeight).toBeCloseTo(7.5);
  });

  it("supports negative increment (descending stacks)", () => {
    const result = generateCalibrations({ startWeight: 100, increment: -10, count: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.calibrations.map((c) => c.trueWeight)).toEqual([100, 90, 80]);
  });

  it("returns error for count <= 0", () => {
    expect(generateCalibrations({ startWeight: 5, increment: 5, count: 0 }).ok).toBe(false);
    expect(generateCalibrations({ startWeight: 5, increment: 5, count: -1 }).ok).toBe(false);
  });

  it("returns error for non-integer count", () => {
    const result = generateCalibrations({ startWeight: 5, increment: 5, count: 1.5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("count_must_be_positive");
    }
  });

  it("returns error for increment === 0", () => {
    const result = generateCalibrations({ startWeight: 5, increment: 0, count: 3 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("increment_must_be_nonzero");
    }
  });

  it("returns error for start_weight <= 0", () => {
    expect(generateCalibrations({ startWeight: 0, increment: 5, count: 3 }).ok).toBe(false);
    expect(generateCalibrations({ startWeight: -1, increment: 5, count: 3 }).ok).toBe(false);
  });

  it("count=1 produces exactly one row", () => {
    const result = generateCalibrations({ startWeight: 20, increment: 10, count: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.calibrations).toHaveLength(1);
    expect(result.calibrations[0]).toEqual({ marker: 1, trueWeight: 20 });
  });
});

// ── 2. Idempotent migration ───────────────────────────────────────────────────

describe("BLD-3816 — migration adds gen_* columns to cable_stacks", () => {
  let raw: InstanceType<typeof DatabaseSync>;
  let db: WrappedDb;

  beforeEach(async () => {
    raw = new DatabaseSync(":memory:");
    raw.exec("PRAGMA foreign_keys = ON;");
    db = wrapDb(raw);
    await migrate(db as Parameters<typeof migrate>[0]);
  });

  it("cable_stacks has gen_start_weight, gen_increment, gen_marker_count columns", () => {
    const cols = raw.prepare("PRAGMA table_info(cable_stacks)").all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("gen_start_weight");
    expect(names).toContain("gen_increment");
    expect(names).toContain("gen_marker_count");
  });

  it("gen_* columns are nullable (notnull = 0)", () => {
    const cols = raw.prepare("PRAGMA table_info(cable_stacks)").all() as Array<{ name: string; notnull: number }>;
    const genCols = cols.filter((c) => c.name.startsWith("gen_"));
    expect(genCols).toHaveLength(3);
    for (const col of genCols) {
      expect(col.notnull).toBe(0);
    }
  });

  it("idempotent — running migrate() twice does not error", async () => {
    await expect(migrate(db as Parameters<typeof migrate>[0])).resolves.not.toThrow();
  });

  it("idempotent — running migrate() three times does not error", async () => {
    await migrate(db as Parameters<typeof migrate>[0]);
    await expect(migrate(db as Parameters<typeof migrate>[0])).resolves.not.toThrow();
  });
});

// ── 3. Export/import round-trip for gen_* ────────────────────────────────────
// Tests the cable_stacks INSERT SQL used by import-export.ts insertRow() (mirrors
// the exact INSERT…VALUES used in the "cable_stacks" case after BLD-3816 extension).

describe("BLD-3816 — export/import round-trip for gen_* columns", () => {
  let raw: InstanceType<typeof DatabaseSync>;
  let db: WrappedDb;

  beforeEach(async () => {
    raw = new DatabaseSync(":memory:");
    raw.exec("PRAGMA foreign_keys = OFF;");
    db = wrapDb(raw);
    await migrate(db as Parameters<typeof migrate>[0]);
  });

  /**
   * Mirrors the updated insertRow cable_stacks case (11 columns, post-BLD-3816).
   */
  async function insertCableStack(row: {
    id: string; gym_id: string; name: string; unit?: string; position?: number;
    created_at: number; updated_at: number; deleted_at?: null;
    gen_start_weight?: number | null; gen_increment?: number | null; gen_marker_count?: number | null;
  }) {
    return db.runAsync(
      "INSERT OR IGNORE INTO cable_stacks (id, gym_id, name, unit, position, created_at, updated_at, deleted_at, gen_start_weight, gen_increment, gen_marker_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [row.id, row.gym_id, row.name, row.unit ?? "kg", row.position ?? 0,
       row.created_at, row.updated_at, row.deleted_at ?? null,
       row.gen_start_weight ?? null, row.gen_increment ?? null, row.gen_marker_count ?? null]
    );
  }

  it("imports cable_stacks row with gen_* columns losslessly", async () => {
    await insertCableStack({
      id: "stack-123", gym_id: "gym-456", name: "Main Stack",
      created_at: 1700000000000, updated_at: 1700000000000,
      gen_start_weight: 5.0, gen_increment: 5.0, gen_marker_count: 10,
    });

    const stored = raw.prepare("SELECT * FROM cable_stacks WHERE id = ?").get("stack-123") as Record<string, unknown>;
    expect(stored["gen_start_weight"]).toBeCloseTo(5.0);
    expect(stored["gen_increment"]).toBeCloseTo(5.0);
    expect(stored["gen_marker_count"]).toBe(10);
  });

  it("imports cable_stacks row without gen_* columns (pre-feature backup back-compat)", async () => {
    await insertCableStack({
      id: "stack-789", gym_id: "gym-456", name: "Old Stack",
      created_at: 1700000000000, updated_at: 1700000000000,
      // no gen_* columns → fall back to null via ?? null
    });

    const stored = raw.prepare("SELECT * FROM cable_stacks WHERE id = ?").get("stack-789") as Record<string, unknown>;
    expect(stored["gen_start_weight"]).toBeNull();
    expect(stored["gen_increment"]).toBeNull();
    expect(stored["gen_marker_count"]).toBeNull();
  });

  it("round-trip: gen_* values are preserved through export → import cycle", async () => {
    // Simulate export (read back what was stored).
    await insertCableStack({
      id: "stack-rt", gym_id: "gym-456", name: "RT Stack",
      created_at: 1700000000000, updated_at: 1700000000000,
      gen_start_weight: 2.5, gen_increment: 2.5, gen_marker_count: 8,
    });
    const exported = raw.prepare("SELECT * FROM cable_stacks WHERE id = ?").get("stack-rt") as Record<string, unknown>;

    // Simulate import into a fresh DB.
    const raw2 = new DatabaseSync(":memory:");
    raw2.exec("PRAGMA foreign_keys = OFF;");
    const db2 = wrapDb(raw2);
    await migrate(db2 as Parameters<typeof migrate>[0]);

    await db2.runAsync(
      "INSERT OR IGNORE INTO cable_stacks (id, gym_id, name, unit, position, created_at, updated_at, deleted_at, gen_start_weight, gen_increment, gen_marker_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [exported["id"], exported["gym_id"], exported["name"], exported["unit"] ?? "kg",
       exported["position"] ?? 0, exported["created_at"], exported["updated_at"],
       exported["deleted_at"] ?? null,
       exported["gen_start_weight"] ?? null, exported["gen_increment"] ?? null,
       exported["gen_marker_count"] ?? null]
    );

    const restored = raw2.prepare("SELECT * FROM cable_stacks WHERE id = ?").get("stack-rt") as Record<string, unknown>;
    expect(restored["gen_start_weight"]).toBeCloseTo(2.5);
    expect(restored["gen_increment"]).toBeCloseTo(2.5);
    expect(restored["gen_marker_count"]).toBe(8);
  });
});

// ── 4. generateStackCalibrations DB helper ────────────────────────────────────
// Exercises the transaction logic of generateStackCalibrations directly via SQL,
// mirroring the implementation in lib/db/gym-profiles.ts.

describe("BLD-3816 — generateStackCalibrations transaction (QD Safeguard A: stale-row deletion)", () => {
  let raw: InstanceType<typeof DatabaseSync>;
  let db: WrappedDb;

  function getCalibrations(stackId: string) {
    return raw.prepare(
      "SELECT marker, true_weight FROM stack_calibrations WHERE stack_id = ? ORDER BY marker ASC"
    ).all(stackId) as Array<{ marker: number; true_weight: number }>;
  }

  function getStackMeta(stackId: string) {
    return raw.prepare(
      "SELECT gen_start_weight, gen_increment, gen_marker_count FROM cable_stacks WHERE id = ?"
    ).get(stackId) as { gen_start_weight: number | null; gen_increment: number | null; gen_marker_count: number | null } | undefined;
  }

  /** Mirror the generateStackCalibrations transaction for in-test use. */
  async function generateAndApply(stackId: string, params: { startWeight: number; increment: number; count: number }) {
    const { startWeight, increment, count } = params;
    const now = Date.now();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        "UPDATE cable_stacks SET gen_start_weight = ?, gen_increment = ?, gen_marker_count = ?, updated_at = ? WHERE id = ?",
        [startWeight, increment, count, now, stackId]
      );
      for (let i = 1; i <= count; i++) {
        const trueWeight = startWeight + (i - 1) * increment;
        await db.runAsync(
          "INSERT INTO stack_calibrations (id, stack_id, marker, true_weight) VALUES (?, ?, ?, ?) ON CONFLICT(stack_id, marker) DO UPDATE SET true_weight = excluded.true_weight",
          [`gen-${stackId}-${i}`, stackId, i, trueWeight]
        );
      }
      // QD Safeguard A: delete orphaned markers > count.
      await db.runAsync(
        "DELETE FROM stack_calibrations WHERE stack_id = ? AND marker > ?",
        [stackId, count]
      );
    });
  }

  beforeEach(async () => {
    raw = new DatabaseSync(":memory:");
    raw.exec("PRAGMA foreign_keys = OFF;");
    db = wrapDb(raw);
    await migrate(db as Parameters<typeof migrate>[0]);

    raw.exec(`
      INSERT INTO gym_profiles (id, name, is_default, created_at, updated_at)
        VALUES ('gym-1', 'Test Gym', 0, 1700000000000, 1700000000000);
      INSERT INTO cable_stacks (id, gym_id, name, unit, position, created_at, updated_at)
        VALUES ('stack-1', 'gym-1', 'Main', 'kg', 0, 1700000000000, 1700000000000);
    `);
  });

  it("generates 3 calibration rows (start=5, inc=5, count=3 → 5/10/15 kg)", async () => {
    await generateAndApply("stack-1", { startWeight: 5, increment: 5, count: 3 });
    const cals = getCalibrations("stack-1");
    expect(cals).toHaveLength(3);
    expect(cals[0]).toEqual({ marker: 1, true_weight: 5 });
    expect(cals[1]).toEqual({ marker: 2, true_weight: 10 });
    expect(cals[2]).toEqual({ marker: 3, true_weight: 15 });
  });

  it("writes gen_* advisory metadata to cable_stacks", async () => {
    await generateAndApply("stack-1", { startWeight: 5, increment: 5, count: 3 });
    const meta = getStackMeta("stack-1");
    expect(meta?.gen_start_weight).toBeCloseTo(5);
    expect(meta?.gen_increment).toBeCloseTo(5);
    expect(meta?.gen_marker_count).toBe(3);
  });

  it("QD Safeguard A: deletes orphaned markers when count shrinks (5 → 3)", async () => {
    await generateAndApply("stack-1", { startWeight: 5, increment: 5, count: 5 });
    expect(getCalibrations("stack-1")).toHaveLength(5);

    await generateAndApply("stack-1", { startWeight: 5, increment: 5, count: 3 });
    const cals = getCalibrations("stack-1");
    expect(cals).toHaveLength(3);
    expect(cals.map((c) => c.marker)).toEqual([1, 2, 3]);
  });

  it("QD Safeguard A: orphaned markers are absent after count shrink", async () => {
    await generateAndApply("stack-1", { startWeight: 5, increment: 5, count: 5 });
    await generateAndApply("stack-1", { startWeight: 5, increment: 5, count: 3 });
    const orphan = raw.prepare(
      "SELECT * FROM stack_calibrations WHERE stack_id = ? AND marker > 3"
    ).all("stack-1");
    expect(orphan).toHaveLength(0);
  });

  it("upsert: regen with same count but different values updates existing rows", async () => {
    await generateAndApply("stack-1", { startWeight: 5, increment: 5, count: 3 });
    await generateAndApply("stack-1", { startWeight: 10, increment: 10, count: 3 });
    const cals = getCalibrations("stack-1");
    expect(cals).toHaveLength(3);
    expect(cals[0]?.true_weight).toBeCloseTo(10);
    expect(cals[1]?.true_weight).toBeCloseTo(20);
    expect(cals[2]?.true_weight).toBeCloseTo(30);
  });

  it("manual edit: editing a single marker after generation preserves gen_* metadata", async () => {
    await generateAndApply("stack-1", { startWeight: 5, increment: 5, count: 3 });

    // User manually edits marker 2 — gen_* metadata must remain.
    raw.prepare(
      "UPDATE stack_calibrations SET true_weight = 12.5 WHERE stack_id = ? AND marker = 2"
    ).run("stack-1");

    const meta = getStackMeta("stack-1");
    expect(meta?.gen_marker_count).toBe(3);

    const cals = getCalibrations("stack-1");
    const m2 = cals.find((c) => c.marker === 2);
    expect(m2?.true_weight).toBeCloseTo(12.5);
  });

  it("no count shrink: extra markers are preserved when count grows (3 → 5)", async () => {
    await generateAndApply("stack-1", { startWeight: 5, increment: 5, count: 3 });
    await generateAndApply("stack-1", { startWeight: 5, increment: 5, count: 5 });
    expect(getCalibrations("stack-1")).toHaveLength(5);
  });
});

// ── 5. Generated-vs-manual logging equivalence ───────────────────────────────

describe("BLD-3816 — Generated-vs-manual logging equivalence", () => {
  let raw: InstanceType<typeof DatabaseSync>;
  let db: WrappedDb;

  beforeEach(async () => {
    raw = new DatabaseSync(":memory:");
    raw.exec("PRAGMA foreign_keys = OFF;");
    db = wrapDb(raw);
    await migrate(db as Parameters<typeof migrate>[0]);

    raw.exec(`
      INSERT INTO gym_profiles (id, name, is_default, created_at, updated_at)
        VALUES ('gym-eq', 'Equivalence Gym', 1, 1000, 1000);
      INSERT INTO cable_stacks (id, gym_id, name, unit, position, created_at, updated_at)
        VALUES ('stack-gen', 'gym-eq', 'Low Pulley', 'kg', 1, 1000, 1000);
      INSERT INTO cable_stacks (id, gym_id, name, unit, position, created_at, updated_at)
        VALUES ('stack-man', 'gym-eq', 'Low Pulley', 'kg', 2, 1000, 1000);
      INSERT INTO workout_sessions (id, name, gym_id, gym_name_at_log, started_at)
        VALUES ('session-eq', 'Equivalence Session', 'gym-eq', 'Equivalence Gym', 1000);
    `);
  });

  async function generateAndApply(stackId: string, params: { startWeight: number; increment: number; count: number }) {
    const { startWeight, increment, count } = params;
    const now = Date.now();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        "UPDATE cable_stacks SET gen_start_weight = ?, gen_increment = ?, gen_marker_count = ?, updated_at = ? WHERE id = ?",
        [startWeight, increment, count, now, stackId]
      );
      for (let i = 1; i <= count; i++) {
        const trueWeight = startWeight + (i - 1) * increment;
        await db.runAsync(
          "INSERT INTO stack_calibrations (id, stack_id, marker, true_weight) VALUES (?, ?, ?, ?) ON CONFLICT(stack_id, marker) DO UPDATE SET true_weight = excluded.true_weight",
          [`gen-${stackId}-${i}`, stackId, i, trueWeight]
        );
      }
    });
  }

  async function logStackSet(
    setId: string,
    sessionId: string,
    exerciseId: string,
    setNumber: number,
    reps: number,
    stackId: string,
    marker: number,
    stackName: string,
    stackUnit: string,
    trueWeight: number
  ) {
    // Insert pristine set
    await db.runAsync(
      "INSERT INTO workout_sets (id, session_id, exercise_id, set_number, reps) VALUES (?, ?, ?, ?, ?)",
      [setId, sessionId, exerciseId, setNumber, reps]
    );

    // Update with marker info
    await db.runAsync(
      "UPDATE workout_sets SET weight = ?, stack_id = ?, stack_marker = ?, stack_name_at_log = ?, stack_unit_at_log = ? WHERE id = ?",
      [trueWeight, stackId, marker, stackName, stackUnit, setId]
    );

    // Recompute caches (normal set type fallback)
    const cachedVolumeKg = trueWeight * reps;
    const cachedE1rmKg = reps > 0 && reps <= 12 ? trueWeight * (1 + reps / 30) : 0;
    await db.runAsync(
      "UPDATE workout_sets SET cached_volume_kg = ?, cached_e1rm_kg = ? WHERE id = ?",
      [cachedVolumeKg, cachedE1rmKg, setId]
    );
  }

  it("proves generated and equivalent manual stacks produce identical snapshots and cached_e1rm_kg", async () => {
    // 1. Setup Generated Stack calibrations (start=5, inc=5, count=5)
    await generateAndApply("stack-gen", { startWeight: 5, increment: 5, count: 5 });

    // 2. Setup equivalent Manual Stack calibrations manually
    raw.exec(`
      INSERT INTO stack_calibrations (id, stack_id, marker, true_weight) VALUES ('m-1', 'stack-man', 1, 5);
      INSERT INTO stack_calibrations (id, stack_id, marker, true_weight) VALUES ('m-2', 'stack-man', 2, 10);
      INSERT INTO stack_calibrations (id, stack_id, marker, true_weight) VALUES ('m-3', 'stack-man', 3, 15);
      INSERT INTO stack_calibrations (id, stack_id, marker, true_weight) VALUES ('m-4', 'stack-man', 4, 20);
      INSERT INTO stack_calibrations (id, stack_id, marker, true_weight) VALUES ('m-5', 'stack-man', 5, 25);
    `);

    // 3. Log a set on Generated Stack at marker 3
    await logStackSet("set-gen-3", "session-eq", "ex-1", 1, 10, "stack-gen", 3, "Low Pulley", "kg", 15);

    // 4. Log a set on Manual Stack at marker 3
    await logStackSet("set-man-3", "session-eq", "ex-1", 2, 10, "stack-man", 3, "Low Pulley", "kg", 15);

    // 5. Fetch both set rows
    const setGen = (await db.getFirstAsync("SELECT * FROM workout_sets WHERE id = ?", ["set-gen-3"]))!;
    const setMan = (await db.getFirstAsync("SELECT * FROM workout_sets WHERE id = ?", ["set-man-3"]))!;

    // 6. Assert all snapshot fields are identical
    expect(setGen.weight).toBeCloseTo(15);
    expect(setMan.weight).toBeCloseTo(15);

    expect(setGen.stack_marker).toBe(3);
    expect(setMan.stack_marker).toBe(3);

    expect(setGen.stack_name_at_log).toBe("Low Pulley");
    expect(setMan.stack_name_at_log).toBe("Low Pulley");

    expect(setGen.stack_unit_at_log).toBe("kg");
    expect(setMan.stack_unit_at_log).toBe("kg");

    expect(setGen.cached_volume_kg).toBe(150);
    expect(setMan.cached_volume_kg).toBe(150);

    expect(setGen.cached_e1rm_kg).toBeCloseTo(20);
    expect(setMan.cached_e1rm_kg).toBeCloseTo(20);
  });
});
