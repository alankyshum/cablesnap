/**
 * BLD-2561: Preferred substitute — DB layer unit tests.
 *
 * Covers:
 *   1. Migration idempotency — addColumnIfMissing for preferred_substitute_id
 *      and preferred_substitute_updated_at never throws on fresh or already-migrated DB.
 *   2. setPreferredSubstitute + getPreferredSubstitute round-trip (production helpers).
 *   3. getPreferredSubstitute returns null when no preference is set.
 *   4. getPreferredSubstitute returns null + clears stale row when target is deleted.
 *   5. getPreferredSubstitutesBatch batch read correctness.
 *
 * The round-trip tests (groups 2-5) call the real production helpers
 * (setPreferredSubstitute, getPreferredSubstitute, getPreferredSubstitutesBatch)
 * via a drizzle sqlite-proxy backed by an in-memory node:sqlite DB.
 * This ensures that changes to the production DB layer (e.g., an added
 * isNull(deleted_at) filter on getExercisesByIds) are exercised by these tests.
 */

// ─── Mock lib/db/helpers before any production imports ──────────────────────
jest.mock("../../../lib/db/helpers", () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  getDrizzle: jest.fn(),
  getDatabase: jest.fn(),
}));

import { DatabaseSync } from "node:sqlite";
import { drizzle as proxyDrizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "../../../lib/db/schema";
import { migrate } from "../../../lib/db/migrations";

const helpers = require("../../../lib/db/helpers") as {
  query: jest.Mock;
  getDrizzle: jest.Mock;
};

// ─────────────────────────────────────────────────────────────────────────────
// Shim for the migration tests (uses expo-sqlite async API surface)
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
type SqlParam = null | number | bigint | string | Uint8Array;

function wrapDb(db: InstanceType<typeof DatabaseSync>) {
  return {
    execAsync: async (sql: string): Promise<void> => {
      db.exec(sql);
    },
    getAllAsync: async <T = Row>(sql: string, params?: unknown[]): Promise<T[]> => {
      return db.prepare(sql).all(...((params ?? []) as SqlParam[])) as T[];
    },
    getFirstAsync: async <T = Row>(sql: string, params?: unknown[]): Promise<T | null> => {
      return (db.prepare(sql).get(...((params ?? []) as SqlParam[])) as T) ?? null;
    },
    runAsync: async (sql: string, params?: unknown[]): Promise<{ changes: number }> => {
      const result = db.prepare(sql).run(...((params ?? []) as SqlParam[]));
      return { changes: Number(result.changes) };
    },
  };
}

async function freshMigratedDb() {
  const raw = new DatabaseSync(":memory:");
  const db = wrapDb(raw);
  await migrate(db as never);
  return { raw, db };
}

// ─────────────────────────────────────────────────────────────────────────────
// Wire a node:sqlite in-memory DB to getDrizzle() + query() mocks via
// drizzle sqlite-proxy (same pattern as day-session-correctness.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

function useDrizzleDb(db: InstanceType<typeof DatabaseSync>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proxyDb = proxyDrizzle(async (sql: string, params: any[], method: string) => {
    const stmt = db.prepare(sql);
    if (method === "run") {
      stmt.run(...params);
      return { rows: [] };
    }
    if (method === "get") {
      // drizzle sqlite-proxy mapGetResult receives clientResult.rows directly
      // as the `row` argument to mapResultRow, so it must be a flat array of
      // column values (NOT an array-of-arrays). Return [] for no row.
      const row = stmt.get(...params) as Record<string, unknown> | undefined;
      return { rows: row ? Object.values(row) : [] };
    }
    // "all" and "values" methods: rows must be array-of-arrays (one per row).
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return { rows: rows.map((r) => Object.values(r)) };
  }, { schema });
  helpers.getDrizzle.mockResolvedValue(proxyDb);

  // Also wire query() for helpers that use the raw query() API (getPreferredSubstitutesBatch).
  helpers.query.mockImplementation(async (sql: string, params: unknown[]) =>
    db.prepare(sql).all(...(params as SqlParam[])) as Row[]
  );
}

function insertExercise(
  raw: InstanceType<typeof DatabaseSync>,
  id: string,
  name: string,
  deletedAt: number | null = null,
) {
  raw.prepare(
    `INSERT INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment,
      instructions, difficulty) VALUES (?, ?, 'back', '[]', '[]', 'cable', '', 'beginner')`,
  ).run(id, name);
  if (deletedAt != null) {
    raw.prepare(`UPDATE exercises SET deleted_at = ? WHERE id = ?`).run(deletedAt, id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Import production helpers after mocks are established
// ─────────────────────────────────────────────────────────────────────────────

import {
  getPreferredSubstitute,
  setPreferredSubstitute,
  getPreferredSubstitutesBatch,
} from "../../../lib/db/exercises";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Migration tests (raw SQL — correct for testing migrate() itself)
// ─────────────────────────────────────────────────────────────────────────────

describe("BLD-2561: preferred_substitute migrations", () => {
  it("adds preferred_substitute_id column idempotently on fresh DB", async () => {
    const { db } = await freshMigratedDb();
    const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(exercises)");
    const names = cols.map((c) => c.name);
    expect(names).toContain("preferred_substitute_id");
    expect(names).toContain("preferred_substitute_updated_at");
  });

  it("migrate() twice does not throw (idempotency)", async () => {
    const raw = new DatabaseSync(":memory:");
    const db = wrapDb(raw);
    await migrate(db as never);
    // Second run should be a no-op, not throw.
    await expect(migrate(db as never)).resolves.not.toThrow();
  });

  it("column exists on DB that already had exercises table without the column", async () => {
    // Simulate an upgrade path: create exercises table WITHOUT the new columns,
    // then run migrate() — it must add them via addColumnIfMissing.
    const raw = new DatabaseSync(":memory:");
    const db = wrapDb(raw);
    // Create a minimal exercises table that predates BLD-2561.
    raw.exec(`
      CREATE TABLE exercises (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        primary_muscles TEXT NOT NULL,
        secondary_muscles TEXT NOT NULL,
        equipment TEXT NOT NULL,
        instructions TEXT NOT NULL,
        difficulty TEXT NOT NULL
      )
    `);
    await migrate(db as never);
    const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(exercises)");
    const names = cols.map((c) => c.name);
    expect(names).toContain("preferred_substitute_id");
    expect(names).toContain("preferred_substitute_updated_at");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2-5. Round-trip tests via real production helpers
//
// These call setPreferredSubstitute / getPreferredSubstitute /
// getPreferredSubstitutesBatch directly against an in-memory SQLite DB so that
// any production-layer change (e.g. an added isNull(deleted_at) filter) is
// exercised here rather than tested only in raw SQL.
// ─────────────────────────────────────────────────────────────────────────────

describe("BLD-2561: preferred substitute — production helper round-trip", () => {
  let raw: InstanceType<typeof DatabaseSync>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const setup = await freshMigratedDb();
    raw = setup.raw;
    useDrizzleDb(raw);
  });

  it("no preference set → getPreferredSubstitute returns null", async () => {
    insertExercise(raw, "ex-src", "Cable Row");
    const result = await getPreferredSubstitute("ex-src");
    expect(result).toBeNull();
  });

  it("setPreferredSubstitute persists and getPreferredSubstitute resolves the target", async () => {
    insertExercise(raw, "ex-src", "Cable Row");
    insertExercise(raw, "ex-tgt", "Machine Row");
    await setPreferredSubstitute("ex-src", "ex-tgt");
    const result = await getPreferredSubstitute("ex-src");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("ex-tgt");
    expect(result!.name).toBe("Machine Row");
  });

  it("setPreferredSubstitute with null clears preference", async () => {
    insertExercise(raw, "ex-src", "Cable Row");
    insertExercise(raw, "ex-tgt", "Machine Row");
    await setPreferredSubstitute("ex-src", "ex-tgt");
    // Clear it
    await setPreferredSubstitute("ex-src", null);
    const result = await getPreferredSubstitute("ex-src");
    expect(result).toBeNull();
  });

  it("null-resolve: getPreferredSubstitute returns null and clears stale id when target is soft-deleted", async () => {
    insertExercise(raw, "ex-src", "Pec Deck");
    insertExercise(raw, "ex-tgt", "Cable Fly");
    await setPreferredSubstitute("ex-src", "ex-tgt");
    // Soft-delete the target.
    raw.prepare("UPDATE exercises SET deleted_at = ? WHERE id = ?").run(Date.now(), "ex-tgt");

    // Production helper must detect deletion and return null.
    const result = await getPreferredSubstitute("ex-src");
    expect(result).toBeNull();

    // The stale preferred_substitute_id must have been eagerly cleared.
    const src = raw
      .prepare("SELECT preferred_substitute_id FROM exercises WHERE id = ?")
      .get("ex-src") as { preferred_substitute_id: string | null };
    expect(src.preferred_substitute_id).toBeNull();
  });

  it("getPreferredSubstitutesBatch returns null for exercises with no preference", async () => {
    insertExercise(raw, "ex-1", "A");
    insertExercise(raw, "ex-2", "B");
    const result = await getPreferredSubstitutesBatch(["ex-1", "ex-2"]);
    expect(result["ex-1"]).toBeNull();
    expect(result["ex-2"]).toBeNull();
  });

  it("getPreferredSubstitutesBatch returns correct values for mixed preference states", async () => {
    insertExercise(raw, "ex-1", "A");
    insertExercise(raw, "ex-2", "B");
    insertExercise(raw, "ex-tgt", "C");
    await setPreferredSubstitute("ex-1", "ex-tgt");
    const result = await getPreferredSubstitutesBatch(["ex-1", "ex-2"]);
    expect(result["ex-1"]).toBe("ex-tgt");
    expect(result["ex-2"]).toBeNull();
  });

  it("getPreferredSubstitutesBatch returns empty object for empty input", async () => {
    const result = await getPreferredSubstitutesBatch([]);
    expect(result).toEqual({});
  });
});
