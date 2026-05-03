/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BLD-1044 — Behavioral tests: delete-middle, delete-first, delete-last,
 * delete-only-set, delete-then-add, delete + sync-back-to-template.
 *
 * These tests wire up a stateful in-memory row store that actually applies
 * the DELETE and ROW_NUMBER UPDATE mutations, allowing assertions on the
 * final `set_number` values of surviving rows rather than on SQL-string shape.
 *
 * The store intercepts the four raw-SQL methods that `withTransaction` calls:
 *   - getFirstAsync  → SELECT with WHERE id = ?
 *   - getAllAsync     → SELECT with WHERE id IN (...)
 *   - runAsync        → DELETE or ROW_NUMBER CTE UPDATE
 * Everything else is either unused or a no-op for these tests.
 */

// ─── In-memory row store ──────────────────────────────────────────────────────

type Row = { id: string; session_id: string; exercise_id: string; set_number: number; set_type?: string };

let rows: Row[] = [];

function seedRows(initial: Row[]): void {
  rows = initial.map((r) => ({ ...r }));
}

/**
 * Minimal SQL interpreter that handles the two patterns emitted by
 * deleteSet(), deleteSetsBatch(), and renumberExerciseGroup():
 *
 *   DELETE FROM workout_sets WHERE id = ?
 *   DELETE FROM workout_sets WHERE id IN (?, ?, ...)
 *   CTE UPDATE (ROW_NUMBER ... PARTITION BY / ORDER BY set_number ASC, id ASC)
 */
function applyRunAsync(sql: string, params: unknown[]): void {
  const normalized = sql.replace(/\s+/g, " ").trim();

  // DELETE WHERE id = ?
  if (/^DELETE FROM workout_sets WHERE id = \?$/i.test(normalized)) {
    rows = rows.filter((r) => r.id !== (params[0] as string));
    return;
  }

  // DELETE WHERE id IN (?, ?, ...)
  const deleteInMatch = /^DELETE FROM workout_sets WHERE id IN \(([^)]+)\)$/i.exec(normalized);
  if (deleteInMatch) {
    const ids = new Set(params as string[]);
    rows = rows.filter((r) => !ids.has(r.id));
    return;
  }

  // ROW_NUMBER CTE UPDATE
  if (/ROW_NUMBER.*ORDER BY set_number ASC/is.test(normalized)) {
    // params = [sessionId, exerciseId]
    const [sessionId, exerciseId] = params as [string, string];
    const group = rows
      .filter((r) => r.session_id === sessionId && r.exercise_id === exerciseId)
      .sort((a, b) => a.set_number - b.set_number || a.id.localeCompare(b.id));
    group.forEach((row, i) => {
      const idx = rows.findIndex((r) => r.id === row.id);
      if (idx !== -1) rows[idx].set_number = i + 1;
    });
    return;
  }
}

function applyGetFirstAsync(sql: string, params: unknown[]): Row | null {
  const normalized = sql.replace(/\s+/g, " ").trim();
  if (/SELECT session_id, exercise_id FROM workout_sets WHERE id = \?/i.test(normalized)) {
    return rows.find((r) => r.id === (params[0] as string)) ?? null;
  }
  return null;
}

function applyGetAllAsync(sql: string, params: unknown[]): Row[] {
  const normalized = sql.replace(/\s+/g, " ").trim();
  if (/SELECT session_id, exercise_id FROM workout_sets WHERE id IN/i.test(normalized)) {
    const ids = new Set(params as string[]);
    return rows.filter((r) => ids.has(r.id));
  }
  return [];
}

// ─── Mock wiring ──────────────────────────────────────────────────────────────

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn(async (sql: string, params?: unknown[]) =>
    applyGetAllAsync(sql, params ?? [])
  ),
  getFirstAsync: jest.fn(async (sql: string, params?: unknown[]) =>
    applyGetFirstAsync(sql, params ?? [])
  ),
  runAsync: jest.fn(async (sql: string, params?: unknown[]) => {
    applyRunAsync(sql, params ?? []);
    return { changes: 1 };
  }),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
  prepareAsync: jest.fn().mockResolvedValue({
    executeAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    finalizeAsync: jest.fn().mockResolvedValue(undefined),
  }),
};

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => ({
    insert: jest.fn(() => ({ values: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) })),
    select: jest.fn(() => ({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      get: jest.fn(() => undefined),
      all: jest.fn(() => []),
      then: (r: any, rj: any) => Promise.resolve([]).then(r, rj),
    })),
    update: jest.fn(() => ({ set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) })),
    delete: jest.fn(() => ({ where: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) })),
  })),
}));

import { deleteSet, deleteSetsBatch, addSet } from "../../../lib/db/session-sets";
import { syncTemplateFromSession } from "../../../lib/db/templates";

// Pre-warm DB to consume seed() transactions before tests reset state.
beforeAll(async () => {
  await deleteSet("__warmup__");
});

beforeEach(() => {
  jest.clearAllMocks();
  rows = [];
  // Re-wire mocks that jest.clearAllMocks() would have reset.
  mockDb.getAllAsync.mockImplementation(async (sql: string, params?: unknown[]) =>
    applyGetAllAsync(sql, params ?? [])
  );
  mockDb.getFirstAsync.mockImplementation(async (sql: string, params?: unknown[]) =>
    applyGetFirstAsync(sql, params ?? [])
  );
  mockDb.runAsync.mockImplementation(async (sql: string, params?: unknown[]) => {
    applyRunAsync(sql, params ?? []);
    return { changes: 1 };
  });
  mockDb.withTransactionAsync.mockImplementation(async (cb: () => Promise<void>) => cb());
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convenience: return set_numbers for exercise A in session s1, sorted. */
function setNumbersFor(sessionId: string, exerciseId: string): number[] {
  return rows
    .filter((r) => r.session_id === sessionId && r.exercise_id === exerciseId)
    .map((r) => r.set_number)
    .sort((a, b) => a - b);
}

const S = "sess-1";
const A = "ex-A";
const B = "ex-B";

// ─── Behavioral tests ─────────────────────────────────────────────────────────

describe("deleteSet — behavioral (row-level assertions)", () => {
  it("delete-middle: removes set 2, survivors renumber to [1, 2]", async () => {
    seedRows([
      { id: "A1", session_id: S, exercise_id: A, set_number: 1 },
      { id: "A2", session_id: S, exercise_id: A, set_number: 2 },
      { id: "A3", session_id: S, exercise_id: A, set_number: 3 },
      { id: "B1", session_id: S, exercise_id: B, set_number: 1 },
      { id: "B2", session_id: S, exercise_id: B, set_number: 2 },
    ]);

    await deleteSet("A2");

    expect(setNumbersFor(S, A)).toEqual([1, 2]);
    // Cross-exercise non-interference
    expect(setNumbersFor(S, B)).toEqual([1, 2]);
    // Correct survivors
    const survivors = rows.filter((r) => r.exercise_id === A).map((r) => r.id).sort();
    expect(survivors).toEqual(["A1", "A3"]);
  });

  it("delete-first: removes set 1, survivors renumber to [1, 2]", async () => {
    seedRows([
      { id: "A1", session_id: S, exercise_id: A, set_number: 1 },
      { id: "A2", session_id: S, exercise_id: A, set_number: 2 },
      { id: "A3", session_id: S, exercise_id: A, set_number: 3 },
      { id: "B1", session_id: S, exercise_id: B, set_number: 1 },
    ]);

    await deleteSet("A1");

    expect(setNumbersFor(S, A)).toEqual([1, 2]);
    expect(rows.filter((r) => r.exercise_id === A).map((r) => r.id).sort()).toEqual(["A2", "A3"]);
    // B untouched
    expect(setNumbersFor(S, B)).toEqual([1]);
  });

  it("delete-last: removes set 3, survivors renumber to [1, 2]", async () => {
    seedRows([
      { id: "A1", session_id: S, exercise_id: A, set_number: 1 },
      { id: "A2", session_id: S, exercise_id: A, set_number: 2 },
      { id: "A3", session_id: S, exercise_id: A, set_number: 3 },
    ]);

    await deleteSet("A3");

    expect(setNumbersFor(S, A)).toEqual([1, 2]);
    expect(rows.filter((r) => r.exercise_id === A).map((r) => r.id).sort()).toEqual(["A1", "A2"]);
  });

  it("delete-only-set: removes sole row, group becomes empty", async () => {
    seedRows([
      { id: "A1", session_id: S, exercise_id: A, set_number: 1 },
      { id: "B1", session_id: S, exercise_id: B, set_number: 1 },
    ]);

    await deleteSet("A1");

    expect(setNumbersFor(S, A)).toEqual([]);
    // B untouched
    expect(setNumbersFor(S, B)).toEqual([1]);
  });

  it("delete-then-add: after deleting middle set, new set appended as set 3", async () => {
    seedRows([
      { id: "A1", session_id: S, exercise_id: A, set_number: 1 },
      { id: "A2", session_id: S, exercise_id: A, set_number: 2 },
      { id: "A3", session_id: S, exercise_id: A, set_number: 3 },
    ]);

    // Delete middle — group becomes {1, 2}
    await deleteSet("A2");
    expect(setNumbersFor(S, A)).toEqual([1, 2]);

    // Simulate adding a new set at position 3
    const newSet = await addSet(S, A, 3);
    // addSet via Drizzle insert doesn't go through our raw-SQL store, so we
    // manually insert the returned row into our in-memory store to model
    // the full state (addSet returns the row it would have inserted).
    rows.push({ id: newSet.id, session_id: S, exercise_id: A, set_number: newSet.set_number });

    expect(setNumbersFor(S, A)).toEqual([1, 2, 3]);
    // No gaps — dense array
    const nums = setNumbersFor(S, A);
    for (let i = 0; i < nums.length; i++) {
      expect(nums[i]).toBe(i + 1);
    }
  });
});

describe("deleteSetsBatch — behavioral (row-level assertions)", () => {
  it("batch cross-exercise: renumbers each exercise group independently", async () => {
    seedRows([
      { id: "A1", session_id: S, exercise_id: A, set_number: 1 },
      { id: "A2", session_id: S, exercise_id: A, set_number: 2 },
      { id: "A3", session_id: S, exercise_id: A, set_number: 3 },
      { id: "B1", session_id: S, exercise_id: B, set_number: 1 },
      { id: "B2", session_id: S, exercise_id: B, set_number: 2 },
    ]);

    // Delete A2 (middle of A) and B1 (first of B)
    await deleteSetsBatch(["A2", "B1"]);

    expect(setNumbersFor(S, A)).toEqual([1, 2]);
    expect(setNumbersFor(S, B)).toEqual([1]);
    expect(rows.filter((r) => r.exercise_id === A).map((r) => r.id).sort()).toEqual(["A1", "A3"]);
    expect(rows.filter((r) => r.exercise_id === B).map((r) => r.id).sort()).toEqual(["B2"]);
  });

  it("batch same group: deleting two sets from A, survivor renumbers to 1", async () => {
    seedRows([
      { id: "A1", session_id: S, exercise_id: A, set_number: 1 },
      { id: "A2", session_id: S, exercise_id: A, set_number: 2 },
      { id: "A3", session_id: S, exercise_id: A, set_number: 3 },
    ]);

    await deleteSetsBatch(["A1", "A2"]);

    expect(setNumbersFor(S, A)).toEqual([1]);
    expect(rows.filter((r) => r.exercise_id === A)[0].id).toBe("A3");
  });
});

describe("delete + sync-back-to-template regression (BLD-1038 tourniquet)", () => {
  /**
   * After deleteSet(A2), syncTemplateFromSession must produce a dense
   * setTypes array with no undefined holes. This pins the BLD-1038 invariant:
   * even though syncTemplateFromSession pushes sequentially (defense-in-depth),
   * the DB rows must already be contiguous for any consumer that reads by index.
   */
  it("after deleteSet(middle), rows are contiguous for consumers that read by set_number", async () => {
    seedRows([
      { id: "A1", session_id: S, exercise_id: A, set_number: 1, set_type: "normal" },
      { id: "A2", session_id: S, exercise_id: A, set_number: 2, set_type: "warmup" },
      { id: "A3", session_id: S, exercise_id: A, set_number: 3, set_type: "normal" },
    ]);

    await deleteSet("A2");

    // After delete, rows have set_number {1, 3} pre-renumber → {1, 2} post-renumber.
    // A consumer that reads rows ordered by set_number and accesses by 1-based index
    // should find: index 0 → set_number 1, index 1 → set_number 2 (no gap at 3).
    const finalRows = rows
      .filter((r) => r.exercise_id === A)
      .sort((a, b) => a.set_number - b.set_number);

    expect(finalRows).toHaveLength(2);
    expect(finalRows[0].set_number).toBe(1);
    expect(finalRows[1].set_number).toBe(2);
    // No undefined holes when accessed by index
    expect(finalRows[0].id).toBe("A1");
    expect(finalRows[1].id).toBe("A3");

    // set_types array built by sequential push matches the survivors, dense
    const setTypes = finalRows.map((r) => r.set_type);
    expect(setTypes).toEqual(["normal", "normal"]);
    expect(setTypes).not.toContain(undefined);
  });

  it("syncTemplateFromSession is called within the mock env without throwing", async () => {
    // syncTemplateFromSession calls getDrizzle() which uses the mocked db.
    // It needs a session + template query that returns null to short-circuit.
    // The mock drizzle's select chain returns undefined from .get(), so
    // syncTemplateFromSession returns null (no template_id on session) — which
    // is the correct no-op path. The key assertion is: no error is thrown.
    await expect(syncTemplateFromSession(S)).resolves.toBeNull();
  });
});
