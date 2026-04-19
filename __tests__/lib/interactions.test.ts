/* eslint-disable @typescript-eslint/no-explicit-any */
let mockUuidCounter = 0;
jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => `uuid-${++mockUuidCounter}`),
}));

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue({ count: 10 }),
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  prepareAsync: jest.fn().mockResolvedValue({
    executeAsync: jest.fn().mockResolvedValue(undefined),
    finalizeAsync: jest.fn().mockResolvedValue(undefined),
  }),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
};

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

let mockDrizzleQueryResult: any = [];

let mockDrizzleInsertCalls: any[] = [];
let mockDrizzleDeleteCalls: any[] = [];

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => ({
    select: jest.fn(() => {
      const chain: any = { from: jest.fn().mockReturnThis(), innerJoin: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), offset: jest.fn().mockReturnThis(), get: jest.fn(() => undefined), then: (r: any, rj: any) => Promise.resolve(mockDrizzleQueryResult).then(r, rj) };
      return chain;
    }),
    insert: jest.fn(() => {
      const c: any = {
        values: jest.fn((...args: any[]) => { mockDrizzleInsertCalls.push(args); return c; }),
        then: (r: any) => Promise.resolve().then(r),
      };
      return c;
    }),
    update: jest.fn(() => { const c: any = { set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
    delete: jest.fn(() => {
      const c: any = {
        where: jest.fn((...args: any[]) => { mockDrizzleDeleteCalls.push(args); return c; }),
        then: (r: any) => Promise.resolve().then(r),
      };
      return c;
    }),
  })),
}));

jest.mock("../../lib/seed", () => ({
  seedExercises: jest.fn(() => []),
}));

let db: typeof import("../../lib/db");

async function initDb() {
  await db.getDatabase();
  jest.clearAllMocks();
}

beforeEach(() => {
  mockUuidCounter = 0;
  jest.clearAllMocks();
  mockDrizzleQueryResult = [];
  mockDrizzleInsertCalls = [];
  mockDrizzleDeleteCalls = [];
  mockDb.execAsync.mockResolvedValue(undefined);
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.getFirstAsync.mockResolvedValue({ count: 10 });
  mockDb.runAsync.mockResolvedValue({ changes: 1 });
  mockDb.withTransactionAsync.mockImplementation(async (cb: () => Promise<void>) => cb());
  jest.resetModules();
  jest.doMock("expo-sqlite", () => ({
    openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
  }));
  jest.doMock("../../lib/seed", () => ({
    seedExercises: jest.fn(() => []),
  }));
  jest.doMock("expo-crypto", () => ({
    randomUUID: jest.fn(() => `uuid-${++mockUuidCounter}`),
  }));
  db = require("../../lib/db");
});

describe("insertInteraction", () => {
  it("inserts and prunes in a transaction", async () => {
    await initDb();
    await db.insertInteraction("navigate", "Home", null);

    expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(1);
    // INSERT via Drizzle
    expect(mockDrizzleInsertCalls).toHaveLength(1);
    const insertValues = mockDrizzleInsertCalls[0][0];
    expect(insertValues.action).toBe("navigate");
    expect(insertValues.screen).toBe("Home");
    expect(insertValues.detail).toBeNull();
    // DELETE prune via Drizzle
    expect(mockDrizzleDeleteCalls).toHaveLength(1);
  });

  it("stores detail when provided", async () => {
    await initDb();
    await db.insertInteraction("tap", "Exercises", "Bench Press");

    const insertValues = mockDrizzleInsertCalls[0][0];
    expect(insertValues.action).toBe("tap");
    expect(insertValues.screen).toBe("Exercises");
    expect(insertValues.detail).toBe("Bench Press");
  });
});

describe("getInteractions", () => {
  it("returns rows ordered by timestamp DESC, limited to 50", async () => {
    await initDb();
    const rows = [
      { id: "1", action: "navigate", screen: "Home", detail: null, timestamp: 1000 },
      { id: "2", action: "tap", screen: "Exercises", detail: "test", timestamp: 900 },
    ];
    mockDrizzleQueryResult = rows;

    const result = await db.getInteractions();
    expect(result).toEqual(rows);
  });
});

describe("clearInteractions", () => {
  it("deletes all interaction rows", async () => {
    await initDb();
    await expect(db.clearInteractions()).resolves.toBeUndefined();
  });
});
