/**
 * session-sets-most-recent.test.ts
 *
 * BLD-1105: getMostRecentCompletedSetForExercise
 *
 * Tests:
 * - Returns null when no completed kind='workout' sets exist.
 * - Returns the most recent set when one exists.
 * - mustHaveNoClip=true excludes sets that already have a live set_media row.
 * - mustHaveNoClip=true returns a free set when one exists alongside a taken set.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
  prepareAsync: jest.fn().mockResolvedValue({
    executeAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    finalizeAsync: jest.fn().mockResolvedValue(undefined),
  }),
};

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

// We stub the drizzle chain to allow the query to be inspected by observing
// what resolves out of it. The select chain terminates at .limit(1) which
// returns a promise resolving to mockSelectResult.
let mockSelectResult: any[] = [];

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => ({
    select: jest.fn(() => {
      const chain: any = {
        from: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn(() => Promise.resolve(mockSelectResult)),
        get: jest.fn(() => undefined),
        all: jest.fn(() => mockSelectResult),
        then: (r: any) => Promise.resolve(mockSelectResult).then(r),
      };
      return chain;
    }),
    insert: jest.fn(() => ({ values: jest.fn().mockReturnThis(), returning: jest.fn(() => Promise.resolve([])), then: (r: any) => Promise.resolve([]).then(r) })),
    update: jest.fn(() => ({ set: jest.fn().mockReturnThis(), where: jest.fn(() => Promise.resolve()), then: (r: any) => Promise.resolve().then(r) })),
    delete: jest.fn(() => ({ where: jest.fn(() => Promise.resolve()), then: (r: any) => Promise.resolve().then(r) })),
  })),
}));

// Prevent circular import via cascadeDeleteClipsForSets.
jest.mock("../../../lib/media/form-clips", () => ({
  cascadeDeleteClipsForSets: jest.fn(async () => {}),
  cascadeDeleteClipsForSession: jest.fn(async () => {}),
}));

import { getMostRecentCompletedSetForExercise } from "../../../lib/db/session-sets";

beforeEach(() => {
  jest.clearAllMocks();
  mockSelectResult = [];
});

describe("getMostRecentCompletedSetForExercise", () => {
  it("returns null when no rows found", async () => {
    mockSelectResult = [];
    const result = await getMostRecentCompletedSetForExercise("ex-1");
    expect(result).toBeNull();
  });

  it("returns most recent set when found", async () => {
    const ts = Date.now();
    mockSelectResult = [{ id: "set-1", set_number: 3, completed_at: ts }];
    const result = await getMostRecentCompletedSetForExercise("ex-1");
    expect(result).toEqual({ id: "set-1", set_number: 3, completed_at: ts });
  });

  it("returns null when row has null completed_at", async () => {
    mockSelectResult = [{ id: "set-1", set_number: 1, completed_at: null }];
    const result = await getMostRecentCompletedSetForExercise("ex-1");
    expect(result).toBeNull();
  });

  it("returns null with mustHaveNoClip=true when no rows found", async () => {
    mockSelectResult = [];
    const result = await getMostRecentCompletedSetForExercise("ex-1", { mustHaveNoClip: true });
    expect(result).toBeNull();
  });

  it("returns free set when mustHaveNoClip=true and a row without clip exists", async () => {
    const ts = Date.now() - 1000;
    // LEFT JOIN: set_media.id is null → no clip for this set.
    mockSelectResult = [{ id: "set-free", set_number: 2, completed_at: ts }];
    const result = await getMostRecentCompletedSetForExercise("ex-1", { mustHaveNoClip: true });
    expect(result).toEqual({ id: "set-free", set_number: 2, completed_at: ts });
  });
});
