/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for getRecentExercises and getFrequentExercises (Phase 73 — BLD-453).
 *
 * Uses jest.resetModules() + globalThis cleanup to get fresh module state for each test.
 */

const mockRecentRows = [
  {
    id: "ex-1", name: "Barbell Bench Press", category: "chest",
    primary_muscles: '["chest"]', secondary_muscles: '["triceps"]',
    equipment: "barbell", instructions: "", difficulty: "intermediate",
    is_custom: 0, deleted_at: null,
    attachment: "handle", is_voltra: 0,
  },
  {
    id: "ex-2", name: "Barbell Squat", category: "legs_glutes",
    primary_muscles: '["quads"]', secondary_muscles: '["glutes"]',
    equipment: "barbell", instructions: "", difficulty: "intermediate",
    is_custom: 0, deleted_at: null,
    attachment: "handle", is_voltra: 0,
  },
];

const mockFrequentRows = [
  {
    id: "ex-3", name: "Deadlift", category: "back",
    primary_muscles: '["back"]', secondary_muscles: '["hamstrings"]',
    equipment: "barbell", instructions: "", difficulty: "advanced",
    is_custom: 0, deleted_at: null,
    attachment: "handle", is_voltra: 0,
  },
  {
    id: "ex-1", name: "Barbell Bench Press", category: "chest",
    primary_muscles: '["chest"]', secondary_muscles: '["triceps"]',
    equipment: "barbell", instructions: "", difficulty: "intermediate",
    is_custom: 0, deleted_at: null,
    attachment: "handle", is_voltra: 0,
  },
];

function mockCreateChain(result: any[]) {
  const chain: any = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.from = jest.fn().mockReturnValue(chain);
  chain.innerJoin = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.groupBy = jest.fn().mockReturnValue(chain);
  chain.orderBy = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockResolvedValue(result);
  return chain;
}

const mockStmt = {
  executeAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  finalizeAsync: jest.fn().mockResolvedValue(undefined),
};

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
  prepareAsync: jest.fn().mockResolvedValue(mockStmt),
};

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

describe("Quick-Add DB queries (Phase 73)", () => {
  let mockDrizzleDb: any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockDrizzleDb = null;
    // Clear the globalThis DB singleton so getDrizzle() re-initializes
    (globalThis as any).__cablesnap_db = undefined;
    (globalThis as any).__cablesnap_drizzle = undefined;
    (globalThis as any).__cablesnap_init = undefined;

    // Re-register mocks after resetModules clears them
    jest.doMock("expo-sqlite", () => ({
      openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
    }));
  });

  it("getRecentExercises returns exercises from last 7 days, maps to Exercise type, and excludes deleted", async () => {
    jest.doMock("drizzle-orm/expo-sqlite", () => ({
      drizzle: jest.fn(() => {
        mockDrizzleDb = mockCreateChain(mockRecentRows);
        return mockDrizzleDb;
      }),
    }));

    const { getRecentExercises } = require("../../../lib/db/exercise-history");
    const result = await getRecentExercises(7, 5);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("ex-1");
    expect(result[0].name).toBe("Barbell Bench Press");
    expect(result[0].primary_muscles).toEqual(["chest"]);
    expect(result[0].is_custom).toBe(false);
    expect(result[1].id).toBe("ex-2");
    expect(mockDrizzleDb.innerJoin).toHaveBeenCalledTimes(2);
    expect(mockDrizzleDb.groupBy).toHaveBeenCalled();
    expect(mockDrizzleDb.limit).toHaveBeenCalledWith(5);
  });

  it("getFrequentExercises returns top exercises by session count, excludes deleted, over-fetches by 5", async () => {
    jest.doMock("drizzle-orm/expo-sqlite", () => ({
      drizzle: jest.fn(() => {
        mockDrizzleDb = mockCreateChain(mockFrequentRows);
        return mockDrizzleDb;
      }),
    }));

    const { getFrequentExercises } = require("../../../lib/db/exercise-history");
    const result = await getFrequentExercises(10);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("ex-3");
    expect(result[0].name).toBe("Deadlift");
    expect(result[0].primary_muscles).toEqual(["back"]);
    expect(result[1].id).toBe("ex-1");
    expect(mockDrizzleDb.limit).toHaveBeenCalledWith(15);
    expect(mockDrizzleDb.innerJoin).toHaveBeenCalledTimes(2);
    expect(mockDrizzleDb.groupBy).toHaveBeenCalled();
  });
});
