// Mock crypto.randomUUID
let uuidCounter = 0;
Object.defineProperty(global, "crypto", {
  value: {
    randomUUID: jest.fn(() => `uuid-${++uuidCounter}`),
  },
});

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

jest.mock("../../lib/seed", () => ({
  seedExercises: jest.fn(() => []),
}));

let db: typeof import("../../lib/db");

async function initDb() {
  await db.getDatabase();
  jest.clearAllMocks();
}

beforeEach(() => {
  uuidCounter = 0;
  jest.clearAllMocks();
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
  db = require("../../lib/db");
});

describe("insertInteraction", () => {
  it("inserts and prunes in a transaction", async () => {
    await initDb();
    await db.insertInteraction("navigate", "Home", null);

    expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(2);

    // First call: INSERT
    const insertCall = mockDb.runAsync.mock.calls[0];
    expect(insertCall[0]).toContain("INSERT INTO interaction_log");
    expect(insertCall[1][1]).toBe("navigate");
    expect(insertCall[1][2]).toBe("Home");
    expect(insertCall[1][3]).toBeNull();

    // Second call: DELETE (FIFO prune)
    const deleteCall = mockDb.runAsync.mock.calls[1];
    expect(deleteCall[0]).toContain("DELETE FROM interaction_log");
    expect(deleteCall[0]).toContain("LIMIT 10");
  });

  it("stores detail when provided", async () => {
    await initDb();
    await db.insertInteraction("tap", "Exercises", "Bench Press");

    const insertCall = mockDb.runAsync.mock.calls[0];
    expect(insertCall[1][1]).toBe("tap");
    expect(insertCall[1][2]).toBe("Exercises");
    expect(insertCall[1][3]).toBe("Bench Press");
  });
});

describe("getInteractions", () => {
  it("returns rows ordered by timestamp DESC, limited to 10", async () => {
    await initDb();
    const rows = [
      { id: "1", action: "navigate", screen: "Home", detail: null, timestamp: 1000 },
      { id: "2", action: "tap", screen: "Exercises", detail: "test", timestamp: 900 },
    ];
    mockDb.getAllAsync.mockResolvedValueOnce(rows);

    const result = await db.getInteractions();
    expect(result).toEqual(rows);
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      "SELECT * FROM interaction_log ORDER BY timestamp DESC LIMIT 10"
    );
  });
});

describe("clearInteractions", () => {
  it("deletes all interaction rows", async () => {
    await initDb();
    await db.clearInteractions();
    expect(mockDb.runAsync).toHaveBeenCalledWith("DELETE FROM interaction_log");
  });
});
