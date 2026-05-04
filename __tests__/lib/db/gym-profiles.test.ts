/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BLD-1060: gym-profiles DB function tests.
 *
 * Tests:
 *   1. setDefaultGym atomicity — both UPDATEs run inside withTransactionAsync
 *   2. getActiveGymCount — counts distinct gyms with completed sessions
 *   3. deleteGymProfile soft-delete — sets deleted_at, preserves record
 */

const mockDb: any = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  prepareAsync: jest.fn().mockResolvedValue({
    executeAsync: jest.fn().mockResolvedValue(undefined),
    finalizeAsync: jest.fn().mockResolvedValue(undefined),
  }),
  withTransactionAsync: jest.fn(async (cb: (db: any) => Promise<void>) => cb(mockDb)),
};

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

jest.mock("../../../lib/uuid", () => ({
  uuid: jest.fn(() => "stack-test-id"),
}));

import {
  setDefaultGym,
  getActiveGymCount,
  deleteGymProfile,
  createCableStack,
} from "../../../lib/db/gym-profiles";

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.getFirstAsync.mockResolvedValue(null);
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.runAsync.mockResolvedValue({ changes: 1 });
  mockDb.withTransactionAsync.mockImplementation(async (cb: (db: any) => Promise<void>) => cb(mockDb));
});

describe("setDefaultGym — atomicity", () => {
  it("runs both UPDATEs inside withTransactionAsync", async () => {
    await setDefaultGym("gym-abc");

    expect(mockDb.withTransactionAsync).toHaveBeenCalled();

    // runAsync must have been called at least twice inside the transaction
    const runCalls: string[] = mockDb.runAsync.mock.calls.map((c: any[]) => c[0] as string);
    const clearCall = runCalls.find((sql) => sql.includes("is_default = 0"));
    const setCall = runCalls.find((sql) => sql.includes("is_default = 1") && sql.includes("WHERE id ="));
    expect(clearCall).toBeDefined();
    expect(setCall).toBeDefined();
  });

  it("sets the target gym id in the second UPDATE", async () => {
    await setDefaultGym("gym-xyz");
    const setCalls = mockDb.runAsync.mock.calls.filter(
      (c: any[]) => (c[0] as string).includes("is_default = 1") && (c[0] as string).includes("WHERE id =")
    );
    expect(setCalls.length).toBeGreaterThanOrEqual(1);
    // The gym id must appear as a param
    expect(setCalls[0][1]).toContain("gym-xyz");
  });
});

describe("getActiveGymCount", () => {
  it("returns the count from the SQL query", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ count: 3 });
    const result = await getActiveGymCount(90);
    expect(result).toBe(3);
  });

  it("returns 0 when no active gyms", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ count: 0 });
    const result = await getActiveGymCount(90);
    expect(result).toBe(0);
  });

  it("returns 0 when query returns null", async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    const result = await getActiveGymCount(90);
    expect(result).toBe(0);
  });

  it("passes a cutoff timestamp as a param", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ count: 1 });
    const before = Date.now();
    await getActiveGymCount(30);
    const after = Date.now();
    const call = mockDb.getFirstAsync.mock.calls[0];
    const cutoffParam = call[1][0] as number;
    const expectedMin = before - 30 * 24 * 60 * 60 * 1000;
    const expectedMax = after - 30 * 24 * 60 * 60 * 1000;
    expect(cutoffParam).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoffParam).toBeLessThanOrEqual(expectedMax);
  });
});

describe("createCableStack", () => {
  it("assigns the next position when none is provided", async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ max_position: 2 })
      .mockResolvedValueOnce({
        id: "stack-test-id",
        gym_id: "gym-1",
        name: "Cable Cross",
        unit: "kg",
        position: 3,
        created_at: 1,
        updated_at: 1,
        deleted_at: null,
      });

    const result = await createCableStack({ gym_id: "gym-1", name: "Cable Cross" });

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO cable_stacks"),
      expect.arrayContaining(["stack-test-id", "gym-1", "Cable Cross", "kg", 3]),
    );
    expect(result.position).toBe(3);
  });
});

describe("deleteGymProfile — soft delete", () => {
  it("calls UPDATE with deleted_at and preserves record (no hard delete)", async () => {
    await deleteGymProfile("gym-123");

    const runCalls: Array<[string, unknown[]]> = mockDb.runAsync.mock.calls;
    // Must NOT contain a DELETE statement
    const hardDelete = runCalls.find(([sql]) => sql.trim().toUpperCase().startsWith("DELETE"));
    expect(hardDelete).toBeUndefined();

    // Must contain an UPDATE setting deleted_at
    const softDelete = runCalls.find(([sql]) => sql.includes("deleted_at") && sql.includes("UPDATE"));
    expect(softDelete).toBeDefined();
    expect(softDelete![1]).toContain("gym-123");
  });

  it("also clears is_default on soft delete", async () => {
    await deleteGymProfile("gym-456");
    const runCalls: Array<[string, unknown[]]> = mockDb.runAsync.mock.calls;
    const updateCall = runCalls.find(([sql]) => sql.includes("deleted_at") && sql.includes("UPDATE"));
    expect(updateCall![0]).toContain("is_default");
  });
});
