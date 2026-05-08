/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BLD-1044: Renumber session sets on delete.
 *
 * Verifies that deleteSet() and deleteSetsBatch() renumber surviving rows
 * to restore contiguous 1..N set_number within each (session_id, exercise_id)
 * group, in the same transaction as the delete.
 *
 * Strategy: mock lib/db/helpers so withTransaction is fully controlled
 * (no seed/migrate overhead) and all SQL calls issued via the mockDb are
 * captured for assertion.
 */

// jest.mock must appear before imports (hoisted by babel-jest).
jest.mock("expo-sqlite", () => ({ openDatabaseAsync: jest.fn() }));
jest.mock("drizzle-orm/expo-sqlite", () => ({ drizzle: jest.fn(() => ({})) }));
jest.mock("../../../lib/db/helpers", () => ({
  getDrizzle: jest.fn().mockResolvedValue({}),
  withTransaction: jest.fn(),
  getDatabase: jest.fn(),
}));
jest.mock("../../../lib/media/form-clips", () => ({
  cascadeDeleteClipsForSets: jest.fn().mockResolvedValue(undefined),
  cascadeDeleteClipsForSession: jest.fn().mockResolvedValue(undefined),
}));

import { withTransaction } from "../../../lib/db/helpers";
import { deleteSet, deleteSetsBatch } from "../../../lib/db/session-sets";

// ── Test state ────────────────────────────────────────────────────────────────

/** Raw SQL calls recorded during the test. */
const runCalls: { sql: string; params: unknown[] }[] = [];

let mockGetFirstResult: { session_id: string; exercise_id: string } | null = null;
let mockGetAllResult: { session_id: string; exercise_id: string }[] = [];

let txCallCount = 0;
const txCallSequences: { sql: string; params: unknown[] }[][] = [];
let currentTxCalls: { sql: string; params: unknown[] }[] | null = null;

const mockDb = {
  getFirstAsync: jest.fn(),
  getAllAsync: jest.fn(),
  runAsync: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  runCalls.length = 0;
  txCallCount = 0;
  txCallSequences.length = 0;
  currentTxCalls = null;
  mockGetFirstResult = null;
  mockGetAllResult = [];

  mockDb.getFirstAsync.mockImplementation(async () => mockGetFirstResult);
  mockDb.getAllAsync.mockImplementation(async () => mockGetAllResult);
  mockDb.runAsync.mockImplementation(async (sql: string, params?: unknown[]) => {
    const entry = { sql: sql.replace(/\s+/g, " ").trim(), params: params ?? [] };
    runCalls.push(entry);
    if (currentTxCalls) currentTxCalls.push(entry);
    return { changes: 1 };
  });

  (withTransaction as jest.Mock).mockImplementation(async (fn: (db: any) => Promise<void>) => {
    txCallCount++;
    currentTxCalls = [];
    await fn(mockDb);
    txCallSequences.push([...currentTxCalls!]);
    currentTxCalls = null;
  });
});

// ─── deleteSet ───────────────────────────────────────────────────────────────

describe("deleteSet", () => {
  it("runs inside exactly one transaction", async () => {
    mockGetFirstResult = { session_id: "sess-1", exercise_id: "ex-A" };
    await deleteSet("set-2");
    expect(txCallCount).toBe(1);
  });

  it("issues DELETE and renumber UPDATE in the same transaction (atomicity)", async () => {
    mockGetFirstResult = { session_id: "sess-1", exercise_id: "ex-A" };
    await deleteSet("set-2");

    const txCalls = txCallSequences[0];
    expect(txCalls).toBeDefined();

    const deleteSql = txCalls.find((c) => /^DELETE FROM workout_sets/i.test(c.sql));
    const renumberSql = txCalls.find((c) => /ROW_NUMBER/i.test(c.sql));

    expect(deleteSql).toBeDefined();
    expect(renumberSql).toBeDefined();
    // DELETE must precede renumber
    expect(txCalls.indexOf(deleteSql!)).toBeLessThan(txCalls.indexOf(renumberSql!));
  });

  it("DELETE targets the correct set id", async () => {
    mockGetFirstResult = { session_id: "sess-1", exercise_id: "ex-A" };
    await deleteSet("set-target");

    const deleteSql = runCalls.find((c) => /^DELETE FROM workout_sets/i.test(c.sql));
    expect(deleteSql?.params).toContain("set-target");
  });

  it("renumber UPDATE scopes to correct session_id and exercise_id", async () => {
    mockGetFirstResult = { session_id: "sess-99", exercise_id: "ex-ZZ" };
    await deleteSet("set-2");

    const renumberSql = runCalls.find((c) => /ROW_NUMBER/i.test(c.sql));
    expect(renumberSql?.params).toContain("sess-99");
    expect(renumberSql?.params).toContain("ex-ZZ");
  });

  it("no-op when set id does not exist (getFirstAsync returns null)", async () => {
    mockGetFirstResult = null;
    await deleteSet("does-not-exist");

    const deleteSql = runCalls.find((c) => /^DELETE FROM workout_sets/i.test(c.sql));
    expect(deleteSql).toBeUndefined();
    const renumberSql = runCalls.find((c) => /ROW_NUMBER/i.test(c.sql));
    expect(renumberSql).toBeUndefined();
  });

  it("looks up session_id and exercise_id BEFORE issuing DELETE", async () => {
    mockGetFirstResult = { session_id: "sess-1", exercise_id: "ex-A" };
    const callOrder: string[] = [];

    mockDb.getFirstAsync.mockImplementationOnce(async () => {
      callOrder.push("getFirst");
      return mockGetFirstResult;
    });
    mockDb.runAsync.mockImplementation(async (sql: string, params?: unknown[]) => {
      const entry = { sql: sql.replace(/\s+/g, " ").trim(), params: params ?? [] };
      if (/^DELETE/i.test(sql)) callOrder.push("delete");
      if (/ROW_NUMBER/i.test(sql)) callOrder.push("renumber");
      runCalls.push(entry);
      if (currentTxCalls) currentTxCalls.push(entry);
      return { changes: 1 };
    });

    await deleteSet("set-2");
    expect(callOrder).toEqual(["getFirst", "delete", "renumber"]);
  });
});

// ── deleteSetsBatch ───────────────────────────────────────────────────────────

describe("deleteSetsBatch", () => {
  it("returns early for empty array without entering a transaction", async () => {
    await deleteSetsBatch([]);
    expect(txCallCount).toBe(0);
    expect(runCalls).toHaveLength(0);
  });

  it("runs inside exactly one transaction", async () => {
    mockGetAllResult = [{ session_id: "sess-1", exercise_id: "ex-A" }];
    await deleteSetsBatch(["set-1", "set-2"]);
    expect(txCallCount).toBe(1);
  });

  it("issues DELETE and renumber UPDATE(s) in the same transaction", async () => {
    mockGetAllResult = [
      { session_id: "sess-1", exercise_id: "ex-A" },
      { session_id: "sess-1", exercise_id: "ex-A" },
    ];
    await deleteSetsBatch(["set-1", "set-2"]);

    const txCalls = txCallSequences[0];
    const deleteSql = txCalls.find((c) => /^DELETE FROM workout_sets/i.test(c.sql));
    const renumberSql = txCalls.find((c) => /ROW_NUMBER/i.test(c.sql));
    expect(deleteSql).toBeDefined();
    expect(renumberSql).toBeDefined();
    expect(txCalls.indexOf(deleteSql!)).toBeLessThan(txCalls.indexOf(renumberSql!));
  });

  it("renumbers each distinct (session_id, exercise_id) group exactly once", async () => {
    mockGetAllResult = [
      { session_id: "sess-1", exercise_id: "ex-A" },
      { session_id: "sess-1", exercise_id: "ex-A" }, // duplicate group -- must dedup
      { session_id: "sess-1", exercise_id: "ex-B" },
    ];
    await deleteSetsBatch(["set-A1", "set-A2", "set-B1"]);

    const renumberCalls = runCalls.filter((c) => /ROW_NUMBER/i.test(c.sql));
    // 2 distinct groups -> exactly 2 renumber calls
    expect(renumberCalls).toHaveLength(2);
  });

  it("passes all ids to the DELETE statement", async () => {
    mockGetAllResult = [{ session_id: "sess-1", exercise_id: "ex-A" }];
    await deleteSetsBatch(["id-1", "id-2", "id-3"]);

    const deleteSql = runCalls.find((c) => /^DELETE FROM workout_sets/i.test(c.sql));
    expect(deleteSql?.params).toContain("id-1");
    expect(deleteSql?.params).toContain("id-2");
    expect(deleteSql?.params).toContain("id-3");
  });

  it("does nothing after DELETE when no matching rows (getAllAsync returns empty)", async () => {
    mockGetAllResult = [];
    await deleteSetsBatch(["ghost-1", "ghost-2"]);

    const deleteSql = runCalls.find((c) => /^DELETE FROM workout_sets/i.test(c.sql));
    const renumberSql = runCalls.find((c) => /ROW_NUMBER/i.test(c.sql));
    expect(deleteSql).toBeUndefined();
    expect(renumberSql).toBeUndefined();
  });

  it("cross-exercise batch: renumbers each exercise group independently", async () => {
    mockGetAllResult = [
      { session_id: "sess-1", exercise_id: "ex-A" },
      { session_id: "sess-1", exercise_id: "ex-B" },
    ];
    await deleteSetsBatch(["A2", "B1"]);

    const renumberCalls = runCalls.filter((c) => /ROW_NUMBER/i.test(c.sql));
    expect(renumberCalls).toHaveLength(2);

    const paramsFlat = renumberCalls.flatMap((c) => c.params);
    expect(paramsFlat).toContain("ex-A");
    expect(paramsFlat).toContain("ex-B");
  });

  it("handles single-item batch", async () => {
    mockGetAllResult = [{ session_id: "sess-1", exercise_id: "ex-A" }];
    await deleteSetsBatch(["set-1"]);

    const deleteSql = runCalls.find((c) => /^DELETE FROM workout_sets/i.test(c.sql));
    const renumberSql = runCalls.find((c) => /ROW_NUMBER/i.test(c.sql));
    expect(deleteSql).toBeDefined();
    expect(renumberSql).toBeDefined();
  });
});
