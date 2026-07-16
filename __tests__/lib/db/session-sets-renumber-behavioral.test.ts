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

  // ROW_NUMBER / DENSE_RANK CTE UPDATE
  if (/(ROW_NUMBER|DENSE_RANK).*ORDER BY set_number ASC/is.test(normalized)) {
    // params = [sessionId, exerciseId]
    const [sessionId, exerciseId] = params as [string, string];
    const group = rows
      .filter((r) => r.session_id === sessionId && r.exercise_id === exerciseId)
      .sort((a, b) => a.set_number - b.set_number || a.id.localeCompare(b.id));
    
    if (/DENSE_RANK/i.test(normalized)) {
      let rank = 0;
      let prevSetNumber = -1;
      group.forEach((row) => {
        if (row.set_number !== prevSetNumber) {
          rank++;
          prevSetNumber = row.set_number;
        }
        const idx = rows.findIndex((r) => r.id === row.id);
        if (idx !== -1) rows[idx].set_number = rank;
      });
    } else {
      group.forEach((row, i) => {
        const idx = rows.findIndex((r) => r.id === row.id);
        if (idx !== -1) rows[idx].set_number = i + 1;
      });
    }
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
import { getDrizzle } from "../../../lib/db/helpers";

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
  const TPL_ID = "tpl-sync";
  const TE_ID = "te-sync";

  // Restore drizzle select/update to default no-ops after each test in this block,
  // so any per-test overrides don't bleed into other describe blocks.
  afterEach(async () => {
    const drizzleDb = await getDrizzle() as any;
    drizzleDb.select.mockImplementation(() => ({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      get: jest.fn(() => undefined),
      all: jest.fn(() => []),
      then: (r: any, rj: any) => Promise.resolve([]).then(r, rj),
    }));
    drizzleDb.update.mockImplementation(() => ({
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      then: (r: any) => Promise.resolve().then(r),
    }));
  });

  /**
   * Row-level: After deleteSet(A2), survivors must have set_number {1, 2}.
   * This is the pre-condition for the syncTemplateFromSession integration test below.
   */
  it("after deleteSet(middle), rows are contiguous for consumers that read by set_number", async () => {
    seedRows([
      { id: "A1", session_id: S, exercise_id: A, set_number: 1, set_type: "normal" },
      { id: "A2", session_id: S, exercise_id: A, set_number: 2, set_type: "warmup" },
      { id: "A3", session_id: S, exercise_id: A, set_number: 3, set_type: "normal" },
    ]);

    await deleteSet("A2");

    const finalRows = rows
      .filter((r) => r.exercise_id === A)
      .sort((a, b) => a.set_number - b.set_number);

    expect(finalRows).toHaveLength(2);
    expect(finalRows[0].set_number).toBe(1);
    expect(finalRows[1].set_number).toBe(2);
    expect(finalRows[0].id).toBe("A1");
    expect(finalRows[1].id).toBe("A3");

    // set_types array built by sequential push is dense — no undefined holes
    const setTypes = finalRows.map((r) => r.set_type);
    expect(setTypes).toEqual(["normal", "normal"]);
    expect(setTypes).not.toContain(undefined);
  });

  /**
   * Integration: deleteSet(middle) → syncTemplateFromSession reads the renumbered rows
   * and updates the template with 2 dense sets (no warmup hole).
   *
   * Before BLD-1044 the DB would have set_number {1, 3} after a middle delete.
   * syncTemplateFromSession pushes sequentially from ordered rows so it still produced
   * 2 setTypes — but any consumer relying on set_number as a 1-based index would find a gap.
   * BLD-1044 fixes this at the source; this test pins that the renumber actually fires
   * before syncTemplateFromSession reads the rows.
   */
  it("after deleteSet(middle), syncTemplateFromSession reads contiguous rows and writes dense setTypes to template", async () => {
    seedRows([
      { id: "A1", session_id: S, exercise_id: A, set_number: 1, set_type: "normal" },
      { id: "A2", session_id: S, exercise_id: A, set_number: 2, set_type: "warmup" },
      { id: "A3", session_id: S, exercise_id: A, set_number: 3, set_type: "normal" },
    ]);

    // Step 1: delete the warmup (middle set) — triggers in-transaction renumber
    await deleteSet("A2");
    expect(setNumbersFor(S, A)).toEqual([1, 2]);

    // Step 2: wire the cached Drizzle mock to return realistic data for the
    // four Drizzle select calls that syncTemplateFromSession makes, in order:
    //   0. select().from(workoutSessions)…get()    → { template_id }
    //   1. select().from(workoutTemplates)…get()   → { is_starter: 0 }
    //   2. select().from(workoutSets)…orderBy()    → current rows (post-renumber)
    //   3. select().from(templateExercises)…where  → original 3-set exercise
    const drizzleDb = await getDrizzle() as any;
    let selectCallIdx = 0;

    const makeSyncChain = (resolveTo: unknown, useGet: boolean) => {
      const chain: any = {
        from: jest.fn().mockImplementation(function(this: any) { return this; }),
        where: jest.fn().mockImplementation(function(this: any) { return this; }),
        orderBy: jest.fn().mockImplementation(function(this: any) { return this; }),
        leftJoin: jest.fn().mockImplementation(function(this: any) { return this; }),
        get: jest.fn(() => (useGet ? resolveTo : undefined)),
        all: jest.fn(() => (!useGet ? resolveTo : [])),
        then: (r: any, rj: any) => Promise.resolve(resolveTo).then(r, rj),
      };
      return chain;
    };

    drizzleDb.select.mockImplementation(() => {
      const idx = selectCallIdx++;
      // Call 0: workoutSessions — session has a template_id
      if (idx === 0) return makeSyncChain({ template_id: TPL_ID }, true);
      // Call 1: workoutTemplates — user-owned (not starter)
      if (idx === 1) return makeSyncChain({ is_starter: 0, name: "Test Template", source: null }, true);
      // Call 2: workoutSets — return the renumbered in-memory rows
      if (idx === 2) {
        const setsData = rows
          .filter((r) => r.session_id === S)
          .map((r) => ({
            exercise_id: r.exercise_id,
            exercise_position: 0,
            set_number: r.set_number,
            set_type: r.set_type ?? "normal",
          }))
          .sort((a, b) => a.set_number - b.set_number);
        return makeSyncChain(setsData, false);
      }
      // Call 3: templateExercises — original template had 3 sets including warmup
      if (idx === 3) {
        return makeSyncChain(
          [{ id: TE_ID, exercise_id: A, position: 0, target_sets: 3, set_types: JSON.stringify(["normal", "warmup", "normal"]) }],
          false
        );
      }
      return makeSyncChain(undefined, true);
    });

    // Capture what update(…).set(…) receives across both update calls in syncTemplateFromSession
    // (call 0: templateExercises update; call 1: workoutTemplates timestamp update)
    const capturedUpdates: any[] = [];
    const updateChain: any = {
      set: jest.fn((args: any) => { capturedUpdates.push(args); return updateChain; }),
      where: jest.fn(() => updateChain),
      then: (r: any) => Promise.resolve().then(r),
    };
    drizzleDb.update.mockImplementation(() => updateChain);

    // Step 3: call syncTemplateFromSession — it must see 2 contiguous rows and diff them
    const result = await syncTemplateFromSession(S);

    // Result should be "updated" (not null, not "cloned")
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("updated");
    if (result?.kind === "updated") {
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].newTargetSets).toBe(2); // 2 survivors, not 3
      expect(result.changes[0].newSetTypes).toEqual(["normal", "normal"]); // no warmup hole
    }

    // The template exercise row was updated with the correct, dense set data
    // capturedUpdates[0] = templateExercises.set({target_sets, set_types})
    // capturedUpdates[1] = workoutTemplates.set({updated_at})  ← second update call
    expect(capturedUpdates.length).toBeGreaterThanOrEqual(1);
    expect(capturedUpdates[0].target_sets).toBe(2);
    expect(JSON.parse(capturedUpdates[0].set_types as string)).toEqual(["normal", "normal"]);
  });
});
