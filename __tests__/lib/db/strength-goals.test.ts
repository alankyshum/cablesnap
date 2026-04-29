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
  it("creates goals with correct fields, defaults, and unique IDs across variants", async () => {
    // Weight goal with all fields
    const weightGoal = await createGoal({
      exerciseId: "ex-1",
      targetWeight: 100,
      targetReps: null,
      deadline: "2026-06-01",
    });
    expect(weightGoal.exercise_id).toBe("ex-1");
    expect(weightGoal.target_weight).toBe(100);
    expect(weightGoal.target_reps).toBeNull();
    expect(weightGoal.deadline).toBe("2026-06-01");
    expect(weightGoal.achieved_at).toBeNull();
    expect(weightGoal.id).toBeTruthy();
    expect(weightGoal.created_at).toBeTruthy();
    expect(weightGoal.updated_at).toBeTruthy();

    // Bodyweight (reps) goal
    const repsGoal = await createGoal({ exerciseId: "ex-2", targetReps: 20 });
    expect(repsGoal.exercise_id).toBe("ex-2");
    expect(repsGoal.target_weight).toBeNull();
    expect(repsGoal.target_reps).toBe(20);
    expect(repsGoal.deadline).toBeNull();

    // Defaults all optional fields to null
    const minimalGoal = await createGoal({ exerciseId: "ex-3" });
    expect(minimalGoal.target_weight).toBeNull();
    expect(minimalGoal.target_reps).toBeNull();
    expect(minimalGoal.deadline).toBeNull();
    expect(minimalGoal.achieved_at).toBeNull();

    // Unique IDs per goal
    expect(weightGoal.id).not.toBe(repsGoal.id);
    expect(repsGoal.id).not.toBe(minimalGoal.id);
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
  it("returns the goal when one exists, null otherwise", async () => {
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
    expect(await getGoalForExercise("ex-1")).toEqual(mockGoal);

    mockDrizzleGetResult = undefined;
    expect(await getGoalForExercise("ex-nonexistent")).toBeNull();
  });
});

describe("getActiveGoals", () => {
  it("returns all active (non-achieved) goals or empty array", async () => {
    const goals = [
      { id: "g-1", exercise_id: "ex-1", achieved_at: null },
      { id: "g-2", exercise_id: "ex-2", achieved_at: null },
    ];
    mockDrizzleAllResult = goals;
    const result = await getActiveGoals();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("g-1");

    mockDrizzleAllResult = [];
    expect(await getActiveGoals()).toEqual([]);
  });
});

describe("updateGoal", () => {
  type UpdateCase = {
    name: string;
    input: Parameters<typeof updateGoal>[1];
    expectProp: string;
    expectValue: unknown;
  };

  const cases: UpdateCase[] = [
    { name: "updates target weight", input: { targetWeight: 120 }, expectProp: "target_weight", expectValue: 120 },
    { name: "updates target reps", input: { targetReps: 25 }, expectProp: "target_reps", expectValue: 25 },
    { name: "updates deadline", input: { deadline: "2026-12-01" }, expectProp: "deadline", expectValue: "2026-12-01" },
    { name: "clears deadline when set to null", input: { deadline: null }, expectProp: "deadline", expectValue: null },
  ];

  it.each(cases)("$name", async ({ input, expectProp, expectValue }) => {
    await updateGoal("g-1", input);
    expect(mockUpdateSet).toHaveProperty(expectProp, expectValue);
    expect(mockUpdateSet).toHaveProperty("updated_at");
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
  it("returns max weight, or null when no completed sets exist or query is empty", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([{ best: 95.5 }]);
    expect(await getCurrentBestWeight("ex-1")).toBe(95.5);

    mockDb.getAllAsync.mockResolvedValueOnce([{ best: null }]);
    expect(await getCurrentBestWeight("ex-no-history")).toBeNull();

    mockDb.getAllAsync.mockResolvedValueOnce([]);
    expect(await getCurrentBestWeight("ex-empty")).toBeNull();
  });
});

describe("getCurrentBestReps", () => {
  it("returns max reps, or null when no completed sets exist", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([{ best: 15 }]);
    expect(await getCurrentBestReps("ex-pullups")).toBe(15);

    mockDb.getAllAsync.mockResolvedValueOnce([{ best: null }]);
    expect(await getCurrentBestReps("ex-no-data")).toBeNull();
  });
});

describe("getCurrentBestWeightsByExercise", () => {
  it("returns empty record for empty input without querying", async () => {
    const result = await getCurrentBestWeightsByExercise([]);
    expect(result).toEqual({});
    expect(mockDb.getAllAsync).not.toHaveBeenCalled();
  });

  it("returns best weights keyed by exercise ID, with null for exercises lacking completed sets", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { exercise_id: "ex-1", best: 100 },
      { exercise_id: "ex-3", best: 60 },
    ]);
    expect(
      await getCurrentBestWeightsByExercise(["ex-1", "ex-2", "ex-3"])
    ).toEqual({ "ex-1": 100, "ex-2": null, "ex-3": 60 });

    mockDb.getAllAsync.mockResolvedValueOnce([]);
    expect(await getCurrentBestWeightsByExercise(["ex-empty"])).toEqual({ "ex-empty": null });
  });
});

describe("getCurrentBestRepsByExercise", () => {
  it("returns empty record for empty input without querying", async () => {
    const result = await getCurrentBestRepsByExercise([]);
    expect(result).toEqual({});
    expect(mockDb.getAllAsync).not.toHaveBeenCalled();
  });

  it("returns best reps keyed by exercise ID, with null for exercises lacking completed sets", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { exercise_id: "ex-pullups", best: 15 },
    ]);
    expect(
      await getCurrentBestRepsByExercise(["ex-pullups", "ex-pushups"])
    ).toEqual({ "ex-pullups": 15, "ex-pushups": null });

    mockDb.getAllAsync.mockResolvedValueOnce([]);
    expect(await getCurrentBestRepsByExercise(["ex-none"])).toEqual({ "ex-none": null });
  });
});
