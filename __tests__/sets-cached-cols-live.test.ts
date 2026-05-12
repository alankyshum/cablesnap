/**
 * BLD-1176 BLOCKER 3 — Live-DB regression: bulkInsertSegments sets cached columns.
 *
 * CEO directive: mock-only contract coverage cannot detect the recomputeSetCaches()
 * invariant violation (raw SQL bypass leaves cached_volume_kg=0). This test uses a
 * real in-memory SQLite database to assert the actual row values written to
 * workout_sets.cached_volume_kg / cached_e1rm_kg / reps after bulkInsertSegments()
 * is called.
 *
 * Strategy:
 *   - Run migrate() on a DatabaseSync(":memory:") to get the full production schema.
 *   - Mock getDrizzle() to inject a drizzle instance backed by the real in-memory DB.
 *     The drizzle-orm/expo-sqlite driver uses sync prepareSync/executeSync; the adapter
 *     below bridges node:sqlite StatementSync to that interface.
 *   - Insert parent workout_set rows (set_type=cluster/rest_pause/myo_reps, cached cols=0).
 *   - Call bulkInsertSegments() with the CEO-specified fixtures.
 *   - Assert actual SQLite row values via raw prepared queries.
 *
 * Covers: AC #257 (cached cols non-zero after import), AC #260 (all three advanced types).
 */

// ─── Module mocks (must come before imports) ──────────────────────────────────

jest.mock("expo-crypto", () => ({
  randomUUID: () => require("crypto").randomUUID(),
}));

// Inject the real in-memory drizzle instance so that sets.ts operates on
// real SQLite. Avoids the expo-sqlite bootstrapping path (getDatabase()) entirely.
// Prefixed with "mock" so jest.mock() factory hoisting allows the reference.
let mockTestDrizzle: unknown;
jest.mock("../lib/db/helpers", () => ({
  getDrizzle: () => Promise.resolve(mockTestDrizzle),
  // Provide no-op stubs for other helpers that other modules might import.
  getDatabase: () => Promise.reject(new Error("getDatabase not used in sets-cached-cols-live")),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import * as schema from "../lib/db/schema";
import { migrate } from "../lib/db/migrations";
import { bulkInsertSegments } from "../lib/db/sets";

// ─── node:sqlite → expo-sqlite sync adapter ──────────────────────────────────
//
// drizzle-orm/expo-sqlite driver uses:
//   client.prepareSync(sql)  →  StatementAdapter with:
//     stmt.executeSync(params[])    →  { getAllSync, getFirstSync, changes, lastInsertRowId }
//     stmt.executeForRawResultSync(params[])  →  { getAllSync: () => unknown[][] }
//
// node:sqlite StatementSync uses .run() for mutations and .all()/.get() for queries.
// We detect SELECT vs DML by checking the first keyword of the SQL string.

type RawRow = Record<string, unknown>;

function isMutation(sql: string): boolean {
  return /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)\s/i.test(sql);
}

function makeExpoSyncClient(raw: InstanceType<typeof DatabaseSync>) {
  return {
    prepareSync(sql: string) {
      const stmt = raw.prepare(sql);
      const mutation = isMutation(sql);
      return {
        executeSync(params: unknown[]) {
          if (mutation) {
            const r = stmt.run(...(params as []));
            return {
              getAllSync: () => [] as RawRow[],
              getFirstSync: () => undefined,
              changes: Number(r.changes),
              lastInsertRowId: Number(r.lastInsertRowid),
            };
          } else {
            const rows = stmt.all(...(params as [])) as RawRow[];
            return {
              getAllSync: () => rows,
              getFirstSync: () => rows[0] ?? undefined,
              changes: 0,
              lastInsertRowId: 0,
            };
          }
        },
        executeForRawResultSync(params: unknown[]) {
          const rows = stmt.all(...(params as [])) as RawRow[];
          return { getAllSync: () => rows.map((row) => Object.values(row)) };
        },
      };
    },
  };
}

// ─── wrapDb for migrate() (same pattern as fk-cascade-segments.test.ts) ──────

type Row = Record<string, unknown>;
type SqlParam = null | number | bigint | string | Uint8Array;

function wrapDb(raw: InstanceType<typeof DatabaseSync>) {
  return {
    execAsync: async (sql: string): Promise<void> => { raw.exec(sql); },
    getAllAsync: async <T = Row>(sql: string, params?: unknown[]): Promise<T[]> =>
      raw.prepare(sql).all(...((params ?? []) as SqlParam[])) as T[],
    getFirstAsync: async <T = Row>(sql: string, params?: unknown[]): Promise<T | null> =>
      (raw.prepare(sql).get(...((params ?? []) as SqlParam[])) as T) ?? null,
    runAsync: async (sql: string, params?: unknown[]): Promise<{ changes: number }> => {
      const result = raw.prepare(sql).run(...((params ?? []) as SqlParam[]));
      return { changes: Number(result.changes) };
    },
  };
}

type CachedRow = { cached_volume_kg: number; reps: number; cached_e1rm_kg: number };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("BLD-1176 BLOCKER 3 — bulkInsertSegments live-DB: cached columns after import", () => {
  let raw: InstanceType<typeof DatabaseSync>;

  beforeEach(async () => {
    raw = new DatabaseSync(":memory:");
    raw.exec("PRAGMA foreign_keys = ON;");
    await migrate(wrapDb(raw) as Parameters<typeof migrate>[0]);

    // Inject real drizzle instance backed by the in-memory SQLite.
    mockTestDrizzle = drizzle(makeExpoSyncClient(raw) as Parameters<typeof drizzle>[0], { schema });

    const now = Date.now();
    raw.exec(`
      INSERT INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty)
      VALUES ('ex1', 'Cable Row', 'other', '[]', '[]', 'cable', '', 'intermediate');
      INSERT INTO workout_sessions (id, name, started_at)
      VALUES ('sess1', 'Live Test Session', ${now});
    `);
  });

  afterEach(() => {
    raw.close();
  });

  it("cluster 5+5+4 @ 100/100/95 kg → cached_volume_kg=1380, reps=14, cached_e1rm_kg≈116.67", async () => {
    const now = Date.now();
    raw.prepare(
      "INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, set_type, completed) VALUES (?, 'sess1', 'ex1', 1, 100, 0, 'cluster', 1)"
    ).run("set-cluster");

    await bulkInsertSegments("set-cluster", [
      { segmentNumber: 1, reps: 5, weight: null, restAfterSeconds: 45, completedAt: now },
      { segmentNumber: 2, reps: 5, weight: null, restAfterSeconds: 45, completedAt: now },
      { segmentNumber: 3, reps: 4, weight: 95, restAfterSeconds: null, completedAt: now },
    ]);

    const row = raw.prepare(
      "SELECT cached_volume_kg, reps, cached_e1rm_kg FROM workout_sets WHERE id = ?"
    ).get("set-cluster") as CachedRow;

    // 5×100 + 5×100 + 4×95 = 500 + 500 + 380 = 1380
    expect(row.cached_volume_kg).toBe(1380);
    expect(row.reps).toBe(14);
    // max e1RM: max(100*(1+5/30), 100*(1+5/30), 95*(1+4/30)) = 100*(1+5/30) ≈ 116.67
    expect(row.cached_e1rm_kg).toBeGreaterThan(0);
    expect(row.cached_e1rm_kg).toBeCloseTo(100 * (1 + 5 / 30), 2);
  });

  it("rest_pause 8+3+2 @ 100 kg → cached_volume_kg=1300, reps=13, cached_e1rm_kg≈126.67", async () => {
    const now = Date.now();
    raw.prepare(
      "INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, set_type, completed) VALUES (?, 'sess1', 'ex1', 2, 100, 0, 'rest_pause', 1)"
    ).run("set-rp");

    await bulkInsertSegments("set-rp", [
      { segmentNumber: 1, reps: 8, weight: null, restAfterSeconds: 15, completedAt: now },
      { segmentNumber: 2, reps: 3, weight: null, restAfterSeconds: 15, completedAt: now },
      { segmentNumber: 3, reps: 2, weight: null, restAfterSeconds: null, completedAt: now },
    ]);

    const row = raw.prepare(
      "SELECT cached_volume_kg, reps, cached_e1rm_kg FROM workout_sets WHERE id = ?"
    ).get("set-rp") as CachedRow;

    // (8+3+2) × 100 = 1300
    expect(row.cached_volume_kg).toBe(1300);
    expect(row.reps).toBe(13);
    // max e1RM: 100*(1+8/30) ≈ 126.67
    expect(row.cached_e1rm_kg).toBeGreaterThan(0);
    expect(row.cached_e1rm_kg).toBeCloseTo(100 * (1 + 8 / 30), 2);
  });

  it("myo_reps 10+5+5+4 @ 60 kg → cached_volume_kg=1440, reps=24, cached_e1rm_kg>0", async () => {
    const now = Date.now();
    raw.prepare(
      "INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, set_type, completed) VALUES (?, 'sess1', 'ex1', 3, 60, 0, 'myo_reps', 1)"
    ).run("set-myo");

    await bulkInsertSegments("set-myo", [
      { segmentNumber: 1, reps: 10, weight: null, restAfterSeconds: 30, completedAt: now },
      { segmentNumber: 2, reps: 5, weight: null, restAfterSeconds: 30, completedAt: now },
      { segmentNumber: 3, reps: 5, weight: null, restAfterSeconds: 30, completedAt: now },
      { segmentNumber: 4, reps: 4, weight: null, restAfterSeconds: null, completedAt: now },
    ]);

    const row = raw.prepare(
      "SELECT cached_volume_kg, reps, cached_e1rm_kg FROM workout_sets WHERE id = ?"
    ).get("set-myo") as CachedRow;

    // (10+5+5+4) × 60 = 1440
    expect(row.cached_volume_kg).toBe(1440);
    expect(row.reps).toBe(24);
    // max e1RM: 60*(1+10/30) ≈ 80.0
    expect(row.cached_e1rm_kg).toBeGreaterThan(0);
    expect(row.cached_e1rm_kg).toBeCloseTo(60 * (1 + 10 / 30), 2);
  });

  it("cached cols stay at 0 if bulkInsertSegments is NOT called (regression guard)", () => {
    const now = Date.now();
    raw.prepare(
      "INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, set_type, completed) VALUES (?, 'sess1', 'ex1', 4, 100, 0, 'cluster', 1)"
    ).run("set-no-import");
    raw.exec(`
      INSERT INTO workout_set_segments (id, set_id, segment_number, reps, weight, created_at)
      VALUES ('seg1', 'set-no-import', 1, 5, NULL, ${now}),
             ('seg2', 'set-no-import', 2, 5, NULL, ${now}),
             ('seg3', 'set-no-import', 3, 4, 95,   ${now});
    `);
    // Raw insert WITHOUT recomputeSetCaches → cached cols stay at DEFAULT 0
    const row = raw.prepare(
      "SELECT cached_volume_kg, reps, cached_e1rm_kg FROM workout_sets WHERE id = ?"
    ).get("set-no-import") as CachedRow;

    // This is the pre-fix behavior — cached cols are 0 even though segments exist.
    // The live tests above prove bulkInsertSegments() fixes this.
    expect(row.cached_volume_kg).toBe(0);
    expect(row.reps).toBe(0);
  });
});
