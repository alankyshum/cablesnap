/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for strength goals CRUD (Phase 66 — BLD-433).
 * Tests: createGoal, getGoalForExercise, getActiveGoals, updateGoal,
 *        achieveGoal, deleteGoal, getCompletedGoals, getCurrentBestWeight/Reps.
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

let mockDrizzleGetResult: any = undefined;
let mockDrizzleAllResult: any[] = [];
let mockUpdateSet: any = null;
let mockDeleteCalled = false;

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => ({
    select: jest.fn(() => {
      const chain: any = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn(() => mockDrizzleGetResult),
        all: jest.fn(() => mockDrizzleAllResult),
        then: (r: any) => Promise.resolve(mockDrizzleAllResult).then(r),
      };
      return chain;
    }),
    insert: jest.fn(() => {
      const c: any = {
        values: jest.fn().mockReturnThis(),
        then: (r: any) => Promise.resolve().then(r),
      };
      return c;
    }),
    update: jest.fn(() => {
      const c: any = {
        set: jest.fn((s: any) => {
          mockUpdateSet = s;
          return c;
        }),
        where: jest.fn().mockReturnThis(),
        then: (r: any) => Promise.resolve().then(r),
      };
      return c;
    }),
    delete: jest.fn(() => {
      mockDeleteCalled = true;
      const c: any = {
        where: jest.fn().mockReturnThis(),
        then: (r: any) => Promise.resolve().then(r),
      };
      return c;
    }),
  })),
}));

import {
  createGoal,
  getGoalForExercise,
  getActiveGoals,
  updateGoal,
  achieveGoal,
  deleteGoal,
  getCompletedGoals,
  getCurrentBestWeight,
  getCurrentBestWeightsByExercise,
  getCurrentBestReps,
  getCurrentBestRepsByExercise,
} from "../../../lib/db/strength-goals";

beforeEach(() => {
  jest.clearAllMocks();
  mockDrizzleGetResult = undefined;
  mockDrizzleAllResult = [];
  mockUpdateSet = null;
  mockDeleteCalled = false;
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.getFirstAsync.mockResolvedValue(null);
});

describe("createGoal", () => {
  it("creates a weight goal with correct fields", async () => {
    const result = await createGoal({
      exerciseId: "ex-1",
      targetWeight: 100,
      targetReps: null,
      deadline: "2026-06-01",
    });

    expect(result.exercise_id).toBe("ex-1");
    expect(result.target_weight).toBe(100);
    expect(result.target_reps).toBeNull();
    expect(result.deadline).toBe("2026-06-01");
    expect(result.achieved_at).toBeNull();
    expect(result.id).toBeTruthy();
    expect(result.created_at).toBeTruthy();
    expect(result.updated_at).toBeTruthy();
  });

  it("creates a bodyweight (reps) goal", async () => {
    const result = await createGoal({
      exerciseId: "ex-2",
      targetReps: 20,
    });

    expect(result.exercise_id).toBe("ex-2");
    expect(result.target_weight).toBeNull();
    expect(result.target_reps).toBe(20);
    expect(result.deadline).toBeNull();
  });

  it("defaults optional fields to null", async () => {
    const result = await createGoal({ exerciseId: "ex-3" });

    expect(result.target_weight).toBeNull();
    expect(result.target_reps).toBeNull();
    expect(result.deadline).toBeNull();
    expect(result.achieved_at).toBeNull();
  });

  it("generates a unique ID for each goal", async () => {
    const r1 = await createGoal({ exerciseId: "ex-1", targetWeight: 50 });
    const r2 = await createGoal({ exerciseId: "ex-2", targetWeight: 60 });

    expect(r1.id).not.toBe(r2.id);
  });

  it("throws when an active goal already exists for the exercise", async () => {
    await createGoal({ exerciseId: "ex-1", targetWeight: 100 });

    // Simulate that getGoalForExercise now finds the first goal
    mockDrizzleGetResult = { id: "mock-id", exercise_id: "ex-1", target_weight: 100, achieved_at: null };

    await expect(createGoal({ exerciseId: "ex-1", targetWeight: 120 }))
      .rejects.toThrow("An active goal already exists for this exercise");
  });
});

describe("getGoalForExercise", () => {
  it("returns the goal when one exists", async () => {
    const mockGoal = {
      id: "g-1",
      exercise_id: "ex-1",
      target_weight: 100,
      target_reps: null,
      deadline: null,
      achieved_at: null,
      created_at: "2026-04-20T00:00:00Z",
      updated_at: "2026-04-20T00:00:00Z",
    };
    mockDrizzleGetResult = mockGoal;

    const result = await getGoalForExercise("ex-1");
    expect(result).toEqual(mockGoal);
  });

  it("returns null when no active goal exists", async () => {
    mockDrizzleGetResult = undefined;

    const result = await getGoalForExercise("ex-nonexistent");
    expect(result).toBeNull();
  });
});

describe("getActiveGoals", () => {
  it("returns all active (non-achieved) goals", async () => {
    const goals = [
      { id: "g-1", exercise_id: "ex-1", achieved_at: null },
      { id: "g-2", exercise_id: "ex-2", achieved_at: null },
    ];
    mockDrizzleAllResult = goals;

    const result = await getActiveGoals();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("g-1");
  });

  it("returns empty array when no active goals", async () => {
    mockDrizzleAllResult = [];

    const result = await getActiveGoals();
    expect(result).toEqual([]);
  });
});

describe("updateGoal", () => {
  it("updates target weight", async () => {
    await updateGoal("g-1", { targetWeight: 120 });
    expect(mockUpdateSet).toHaveProperty("target_weight", 120);
    expect(mockUpdateSet).toHaveProperty("updated_at");
  });

  it("updates target reps", async () => {
    await updateGoal("g-1", { targetReps: 25 });
    expect(mockUpdateSet).toHaveProperty("target_reps", 25);
  });

  it("updates deadline", async () => {
    await updateGoal("g-1", { deadline: "2026-12-01" });
    expect(mockUpdateSet).toHaveProperty("deadline", "2026-12-01");
  });

  it("clears deadline when set to null", async () => {
    await updateGoal("g-1", { deadline: null });
    expect(mockUpdateSet).toHaveProperty("deadline", null);
  });

  it("only updates provided fields plus updated_at", async () => {
    await updateGoal("g-1", { targetWeight: 150 });
    expect(mockUpdateSet).not.toHaveProperty("target_reps");
    expect(mockUpdateSet).not.toHaveProperty("deadline");
    expect(mockUpdateSet).toHaveProperty("updated_at");
  });
});

describe("achieveGoal", () => {
  it("sets achieved_at and updated_at timestamps", async () => {
    await achieveGoal("g-1");
    expect(mockUpdateSet).toHaveProperty("achieved_at");
    expect(mockUpdateSet).toHaveProperty("updated_at");
    expect(mockUpdateSet.achieved_at).toBeTruthy();
  });
});

describe("deleteGoal", () => {
  it("deletes the goal", async () => {
    await deleteGoal("g-1");
    expect(mockDeleteCalled).toBe(true);
  });
});

describe("getCompletedGoals", () => {
  it("returns goals with achieved_at set", async () => {
    const completed = [
      { id: "g-1", exercise_id: "ex-1", achieved_at: "2026-04-15T00:00:00Z" },
    ];
    mockDrizzleAllResult = completed;

    const result = await getCompletedGoals();
    expect(result).toHaveLength(1);
    expect(result[0].achieved_at).toBeTruthy();
  });
});

describe("getCurrentBestWeight", () => {
  it("returns the max weight from completed workout sets", async () => {
    mockDb.getAllAsync.mockResolvedValue([{ best: 95.5 }]);

    const result = await getCurrentBestWeight("ex-1");
    expect(result).toBe(95.5);
  });

  it("returns null when no completed sets exist", async () => {
    mockDb.getAllAsync.mockResolvedValue([{ best: null }]);

    const result = await getCurrentBestWeight("ex-no-history");
    expect(result).toBeNull();
  });

  it("returns null when query returns empty", async () => {
    mockDb.getAllAsync.mockResolvedValue([]);

    const result = await getCurrentBestWeight("ex-empty");
    expect(result).toBeNull();
  });
});

describe("getCurrentBestReps", () => {
  it("returns the max reps from completed workout sets", async () => {
    mockDb.getAllAsync.mockResolvedValue([{ best: 15 }]);

    const result = await getCurrentBestReps("ex-pullups");
    expect(result).toBe(15);
  });

  it("returns null when no completed sets exist", async () => {
    mockDb.getAllAsync.mockResolvedValue([{ best: null }]);

    const result = await getCurrentBestReps("ex-no-data");
    expect(result).toBeNull();
  });
});

describe("getCurrentBestWeightsByExercise", () => {
  it("returns empty record for empty input", async () => {
    const result = await getCurrentBestWeightsByExercise([]);
    expect(result).toEqual({});
    expect(mockDb.getAllAsync).not.toHaveBeenCalled();
  });

  it("returns best weights keyed by exercise ID", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { exercise_id: "ex-1", best: 100 },
      { exercise_id: "ex-3", best: 60 },
    ]);

    const result = await getCurrentBestWeightsByExercise(["ex-1", "ex-2", "ex-3"]);
    expect(result).toEqual({ "ex-1": 100, "ex-2": null, "ex-3": 60 });
  });

  it("returns null for exercises with no completed sets", async () => {
    mockDb.getAllAsync.mockResolvedValue([]);

    const result = await getCurrentBestWeightsByExercise(["ex-empty"]);
    expect(result).toEqual({ "ex-empty": null });
  });
});

describe("getCurrentBestRepsByExercise", () => {
  it("returns empty record for empty input", async () => {
    const result = await getCurrentBestRepsByExercise([]);
    expect(result).toEqual({});
    expect(mockDb.getAllAsync).not.toHaveBeenCalled();
  });

  it("returns best reps keyed by exercise ID", async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { exercise_id: "ex-pullups", best: 15 },
    ]);

    const result = await getCurrentBestRepsByExercise(["ex-pullups", "ex-pushups"]);
    expect(result).toEqual({ "ex-pullups": 15, "ex-pushups": null });
  });

  it("returns null for exercises with no completed sets", async () => {
    mockDb.getAllAsync.mockResolvedValue([]);

    const result = await getCurrentBestRepsByExercise(["ex-none"]);
    expect(result).toEqual({ "ex-none": null });
  });
});
