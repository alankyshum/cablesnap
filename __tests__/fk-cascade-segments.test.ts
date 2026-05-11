/**
 * BLD-1168 AC #274 — FK CASCADE segments integration test.
 *
 * GIVEN a parent workout_set row with associated workout_set_segments
 * WHEN the parent set is deleted (simulating session/set deletion)
 * THEN all workout_set_segments rows are automatically deleted at the SQLite
 *      layer with no orphans — enforced by the FK ON DELETE CASCADE constraint.
 *
 * Uses node:sqlite in-memory engine with PRAGMA foreign_keys = ON and the
 * exact DDL from lib/db/tables.ts (createExtensionTables DDL for workout_set_segments).
 * Pattern: same as __tests__/lib/db/foreign-keys-cascade.test.ts.
 */

import { DatabaseSync } from "node:sqlite";
import { migrate } from "../lib/db/migrations";

// ── Thin async shim — same pattern as migration-upgrade-paths.test.ts ────────

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

function count(db: InstanceType<typeof DatabaseSync>, table: string, where = "1=1"): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`).get() as { c: number }).c;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("BLD-1168 AC#274 — FK CASCADE on workout_set_segments (integration)", () => {
  it("deleting a parent workout_set cascades to orphan-free workout_set_segments", async () => {
    const raw = new DatabaseSync(":memory:");
    raw.exec("PRAGMA foreign_keys = ON;");
    await migrate(wrapDb(raw) as Parameters<typeof migrate>[0]);

    const now = Date.now();
    raw.exec(`
      INSERT INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty)
      VALUES ('ex1', 'Cable Row', 'pull', '[]', '[]', 'cable', '', 'intermediate');

      INSERT INTO workout_sessions (id, name, started_at)
      VALUES ('sess1', 'Test', ${now});

      INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed)
      VALUES ('parent1', 'sess1', 'ex1', 1, 100, 13, 1);

      INSERT INTO workout_set_segments (id, set_id, segment_number, reps, weight, created_at)
      VALUES ('seg1', 'parent1', 1, 8, NULL, ${now}),
             ('seg2', 'parent1', 2, 3, NULL, ${now}),
             ('seg3', 'parent1', 3, 2, NULL, ${now});
    `);

    // Pre-condition: 3 segments exist.
    expect(count(raw, "workout_set_segments", "set_id='parent1'")).toBe(3);

    // Delete the parent set — CASCADE should remove all segments.
    raw.prepare("DELETE FROM workout_sets WHERE id = ?").run("parent1");

    // Post-condition: no orphan segments remain.
    expect(count(raw, "workout_set_segments", "set_id='parent1'")).toBe(0);
    expect(count(raw, "workout_sets")).toBe(0);
  });

  it("cascade works for multiple parent sets — all segments orphan-free after bulk delete", async () => {
    const raw = new DatabaseSync(":memory:");
    raw.exec("PRAGMA foreign_keys = ON;");
    await migrate(wrapDb(raw) as Parameters<typeof migrate>[0]);

    const now = Date.now();
    raw.exec(`
      INSERT INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty)
      VALUES ('ex1', 'Squat', 'legs', '[]', '[]', 'barbell', '', 'intermediate');

      INSERT INTO workout_sessions (id, name, started_at)
      VALUES ('sess1', 'Leg day', ${now});

      INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed)
      VALUES ('s1', 'sess1', 'ex1', 1, 120, 5, 1),
             ('s2', 'sess1', 'ex1', 2, 120, 3, 1);

      INSERT INTO workout_set_segments (id, set_id, segment_number, reps, weight, created_at)
      VALUES ('sg1a', 's1', 1, 5, NULL, ${now}),
             ('sg1b', 's1', 2, 3, NULL, ${now}),
             ('sg2a', 's2', 1, 3, NULL, ${now});
    `);

    expect(count(raw, "workout_set_segments")).toBe(3);

    // Delete both parent sets — CASCADE should remove all segments.
    raw.exec("DELETE FROM workout_sets WHERE session_id = 'sess1'");

    expect(count(raw, "workout_sets")).toBe(0);
    expect(count(raw, "workout_set_segments")).toBe(0);
  });

  it("unique index uq_set_segments_set_seg prevents duplicate (set_id, segment_number)", async () => {
    const raw = new DatabaseSync(":memory:");
    raw.exec("PRAGMA foreign_keys = ON;");
    await migrate(wrapDb(raw) as Parameters<typeof migrate>[0]);

    const now = Date.now();
    raw.exec(`
      INSERT INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty)
      VALUES ('ex1', 'Press', 'push', '[]', '[]', 'barbell', '', 'intermediate');

      INSERT INTO workout_sessions (id, name, started_at)
      VALUES ('sess1', 'Push', ${now});

      INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed)
      VALUES ('p1', 'sess1', 'ex1', 1, 80, 5, 1);

      INSERT INTO workout_set_segments (id, set_id, segment_number, reps, weight, created_at)
      VALUES ('sg1', 'p1', 1, 5, NULL, ${now});
    `);

    // Inserting a second row with the same (set_id, segment_number) must fail.
    expect(() => {
      raw.prepare(
        "INSERT INTO workout_set_segments (id, set_id, segment_number, reps, weight, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("sg2", "p1", 1, 3, null, now);
    }).toThrow();
  });

  it("workout_set_segments is in VALID_TABLES allowlist (tables.ts)", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs");
    const path = require("path");
    const src: string = fs.readFileSync(path.join(__dirname, "../lib/db/tables.ts"), "utf-8");
    expect(src).toMatch(/"workout_set_segments"/);
  });
});

