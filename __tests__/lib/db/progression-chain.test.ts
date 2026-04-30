/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for bodyweight exercise progression chain queries (BLD-913).
 * Tests: getProgressionChain, getProgressionSuggestion, seed data integrity,
 *        and import-export dynamic column enumeration.
 */

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

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => ({
    select: jest.fn(() => {
      const chain: any = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn(() => undefined),
        all: jest.fn(() => []),
        then: (r: any) => Promise.resolve([]).then(r),
      };
      return chain;
    }),
    insert: jest.fn(() => ({
      values: jest.fn().mockReturnThis(),
      then: (r: any) => Promise.resolve().then(r),
    })),
    update: jest.fn(() => ({
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      then: (r: any) => Promise.resolve().then(r),
    })),
    delete: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      then: (r: any) => Promise.resolve().then(r),
    })),
  })),
}));

import {
  getProgressionChain,
  getProgressionSuggestion,
  type ProgressionChainExercise,
} from "../../../lib/db/exercises";

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.getFirstAsync.mockResolvedValue(null);
  mockDb.runAsync.mockResolvedValue({ changes: 1 });
});

// ─── getProgressionChain ────────────────────────────────────────────

describe("getProgressionChain", () => {
  it("returns empty array when exercise has no progression_group", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([{ progression_group: null }]);
    const result = await getProgressionChain("ex-1");
    expect(result).toEqual([]);
  });

  it("returns empty array when chain has only one exercise", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([{ progression_group: "push_up" }])
      .mockResolvedValueOnce([
        { id: "ex-1", name: "Push-Up", progression_order: 1, has_been_logged: 0 },
      ]);
    const result = await getProgressionChain("ex-1");
    expect(result).toEqual([]);
  });

  it("returns full chain ordered by progression_order", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([{ progression_group: "push_up" }])
      .mockResolvedValueOnce([
        { id: "ex-1", name: "Knee Push-Up", progression_order: 1, has_been_logged: 1 },
        { id: "ex-2", name: "Push-Up", progression_order: 2, has_been_logged: 1 },
        { id: "ex-3", name: "Diamond Push-Up", progression_order: 3, has_been_logged: 0 },
      ]);
    const result = await getProgressionChain("ex-2");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      id: "ex-1", name: "Knee Push-Up", progression_order: 1, has_been_logged: true,
    });
    expect(result[2]).toEqual({
      id: "ex-3", name: "Diamond Push-Up", progression_order: 3, has_been_logged: false,
    });
  });

  it("maps has_been_logged integer to boolean correctly", async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([{ progression_group: "squat" }])
      .mockResolvedValueOnce([
        { id: "s1", name: "BW Squat", progression_order: 1, has_been_logged: 1 },
        { id: "s2", name: "Pistol Squat", progression_order: 2, has_been_logged: 0 },
      ]);
    const result = await getProgressionChain("s1");
    expect(result[0].has_been_logged).toBe(true);
    expect(result[1].has_been_logged).toBe(false);
  });
});

// ─── getProgressionSuggestion ───────────────────────────────────────

describe("getProgressionSuggestion", () => {
  const chain: ProgressionChainExercise[] = [
    { id: "e1", name: "Knee Push-Up", progression_order: 1, has_been_logged: true },
    { id: "e2", name: "Push-Up", progression_order: 2, has_been_logged: true },
    { id: "e3", name: "Diamond Push-Up", progression_order: 3, has_been_logged: false },
  ];

  it("returns isTerminal=true for last exercise in chain", async () => {
    const result = await getProgressionSuggestion("e3", chain);
    expect(result.isTerminal).toBe(true);
    expect(result.shouldSuggest).toBe(false);
  });

  it("returns shouldSuggest=false when exercise is not in chain", async () => {
    const result = await getProgressionSuggestion("e999", chain);
    expect(result.shouldSuggest).toBe(false);
  });

  it("returns shouldSuggest=false when fewer than 3 sessions in last 30 days", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([{ count: 2 }]);
    const result = await getProgressionSuggestion("e2", chain);
    expect(result.shouldSuggest).toBe(false);
    expect(result.nextExercise).toEqual({ id: "e3", name: "Diamond Push-Up" });
  });

  it("returns shouldSuggest=false when latest session has sets under 12 reps", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([{ count: 5 }]);
    mockDb.getAllAsync.mockResolvedValueOnce([{ session_id: "sess-1" }]);
    mockDb.getAllAsync.mockResolvedValueOnce([{ count: 1 }]);
    const result = await getProgressionSuggestion("e2", chain);
    expect(result.shouldSuggest).toBe(false);
  });

  it("returns shouldSuggest=true when all criteria met", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([{ count: 5 }]);
    mockDb.getAllAsync.mockResolvedValueOnce([{ session_id: "sess-1" }]);
    mockDb.getAllAsync.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.getAllAsync.mockResolvedValueOnce([{ count: 3 }]);
    mockDb.getAllAsync.mockResolvedValueOnce([{ count: 0 }]);
    const result = await getProgressionSuggestion("e2", chain);
    expect(result.shouldSuggest).toBe(true);
    expect(result.nextExercise).toEqual({ id: "e3", name: "Diamond Push-Up" });
    expect(result.isTerminal).toBe(false);
  });

  it("returns shouldSuggest=false when next exercise already logged recently", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([{ count: 5 }]);
    mockDb.getAllAsync.mockResolvedValueOnce([{ session_id: "sess-1" }]);
    mockDb.getAllAsync.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.getAllAsync.mockResolvedValueOnce([{ count: 3 }]);
    mockDb.getAllAsync.mockResolvedValueOnce([{ count: 2 }]);
    const result = await getProgressionSuggestion("e2", chain);
    expect(result.shouldSuggest).toBe(false);
  });

  it("returns shouldSuggest=false when no normal completed sets exist", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([{ count: 5 }]);
    mockDb.getAllAsync.mockResolvedValueOnce([{ session_id: "sess-1" }]);
    mockDb.getAllAsync.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.getAllAsync.mockResolvedValueOnce([{ count: 0 }]);
    const result = await getProgressionSuggestion("e2", chain);
    expect(result.shouldSuggest).toBe(false);
  });
});

// ─── Seed Data Integrity ────────────────────────────────────────────

describe("seed data progression chains", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { seedExercises } = require("../../../lib/seed");

  const allExercises = seedExercises();
  const withProgression = allExercises.filter(
    (e: any) => e.progression_group != null
  );

  it("has at least 7 progression groups", () => {
    const groups = new Set(withProgression.map((e: any) => e.progression_group));
    expect(groups.size).toBeGreaterThanOrEqual(7);
  });

  it("each group has at least 2 exercises", () => {
    const groups = new Map<string, number>();
    for (const e of withProgression) {
      groups.set(e.progression_group, (groups.get(e.progression_group) ?? 0) + 1);
    }
    for (const [, count] of groups) {
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });

  it("no duplicate progression_order within a group", () => {
    const groups = new Map<string, Set<number>>();
    for (const e of withProgression) {
      if (!groups.has(e.progression_group)) {
        groups.set(e.progression_group, new Set());
      }
      const orders = groups.get(e.progression_group)!;
      expect(orders.has(e.progression_order)).toBe(false);
      orders.add(e.progression_order);
    }
  });

  it("all progression exercises are bodyweight equipment", () => {
    for (const e of withProgression) {
      expect(e.equipment).toBe("bodyweight");
    }
  });

  it("all progression exercises have is_custom = false", () => {
    for (const e of withProgression) {
      expect(e.is_custom).toBe(false);
    }
  });

  it("progression_order values are sequential starting from 1", () => {
    const groups = new Map<string, number[]>();
    for (const e of withProgression) {
      if (!groups.has(e.progression_group)) {
        groups.set(e.progression_group, []);
      }
      groups.get(e.progression_group)!.push(e.progression_order);
    }
    for (const [, orders] of groups) {
      orders.sort((a, b) => a - b);
      expect(orders[0]).toBe(1);
      // Check no gaps
      for (let i = 1; i < orders.length; i++) {
        expect(orders[i]).toBe(orders[i - 1] + 1);
      }
    }
  });
});

// ─── Import-Export Dynamic Columns ──────────────────────────────────

describe("import-export exercises dynamic columns", () => {
  it("exercises case in insertRow references PRAGMA table_info pattern", () => {
    // Structural test: verify the import-export source includes PRAGMA table_info
    // for the exercises table (replacing the hardcoded column list)
    const fs = require("fs");
    const source = fs.readFileSync(
      require.resolve("../../../lib/db/import-export"),
      "utf8"
    );
    expect(source).toContain("PRAGMA table_info(exercises)");
    // Should NOT contain the old hardcoded 9-column INSERT for exercises
    expect(source).not.toMatch(
      /INSERT OR IGNORE INTO exercises \(id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty, is_custom\)/
    );
  });
});
