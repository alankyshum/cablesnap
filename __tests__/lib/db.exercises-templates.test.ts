/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BLD-817: split from db.test.ts for worker parallelism.
 * Covers exercises CRUD + templates CRUD.
 */
import {
  MOCK_UUID,
  mockDb,
  mockDrizzleDb,
  mockDrizzleAll,
  mockDrizzleGet,
  resetDrizzleResults,
  setDrizzleGetResult,
  setDrizzleQueryResult,
  setupDbTestContext,
} from "../helpers/db-test-setup";

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "test-uuid-1234"),
}));

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => mockDrizzleDb),
}));

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

jest.mock("../../lib/seed", () => ({
  seedExercises: jest.fn(() => []),
}));

const ctx = setupDbTestContext();

describe("exercises CRUD", () => {
  it("getAllExercises returns mapped exercises", async () => {
    await ctx.initDb();
    mockDrizzleAll([
      {
        id: "ex1",
        name: "Cable Chest Press",
        category: "chest",
        primary_muscles: '["chest"]',
        secondary_muscles: '["triceps"]',
        equipment: "cable",
        instructions: "Press the handles",
        difficulty: "intermediate",
        is_custom: 0,
        deleted_at: null,
        attachment: "single_handle",
        is_voltra: 1,
      },
    ]);

    const exercises = await ctx.db.getAllExercises();
    expect(exercises).toHaveLength(1);
    expect(exercises[0].name).toBe("Cable Chest Press");
    expect(exercises[0].primary_muscles).toEqual(["chest"]);
    expect(exercises[0].secondary_muscles).toEqual(["triceps"]);
    expect(exercises[0].is_custom).toBe(false);
    expect(exercises[0].attachment).toBe("single_handle");
    expect(exercises[0].is_voltra).toBe(true);
    expect(exercises[0].deleted_at).toBeUndefined();
  });

  it("getExerciseById returns null for missing exercise", async () => {
    await ctx.initDb();
    mockDrizzleGet(null);

    const result = await ctx.db.getExerciseById("nonexistent");
    expect(result).toBeNull();
  });

  it("getExerciseById returns mapped exercise", async () => {
    await ctx.initDb();
    mockDrizzleGet({
      id: "ex1",
      name: "Cable Squat",
      category: "legs_glutes",
      primary_muscles: '["quads","glutes"]',
      secondary_muscles: '["hamstrings"]',
      equipment: "cable",
      instructions: "Squat down",
      difficulty: "beginner",
      is_custom: 1,
      deleted_at: null,
      attachment: "rope",
      is_voltra: 0,
    });

    const exercise = await ctx.db.getExerciseById("ex1");
    expect(exercise).not.toBeNull();
    expect(exercise!.name).toBe("Cable Squat");
    expect(exercise!.primary_muscles).toEqual(["quads", "glutes"]);
    expect(exercise!.is_custom).toBe(true);
    expect(exercise!.attachment).toBe("rope");
  });

  it("createCustomExercise inserts and returns exercise", async () => {
    await ctx.initDb();
    const input = {
      name: "My Exercise",
      category: "chest" as const,
      primary_muscles: ["chest" as const],
      secondary_muscles: ["triceps" as const],
      equipment: "cable" as const,
      instructions: "Do it",
      difficulty: "beginner" as const,
    };

    const result = await ctx.db.createCustomExercise(input);
    expect(result.id).toBe(MOCK_UUID);
    expect(result.name).toBe("My Exercise");
    expect(result.is_custom).toBe(true);
    expect(mockDrizzleDb.insert).toHaveBeenCalled();
  });

  it("softDeleteCustomExercise removes from templates and soft-deletes", async () => {
    await ctx.initDb();
    await ctx.db.softDeleteCustomExercise("ex1");
    expect(mockDb.withTransactionAsync).toHaveBeenCalled();
    expect(mockDrizzleDb.delete).toHaveBeenCalled();
    expect(mockDrizzleDb.update).toHaveBeenCalled();
  });

  it("getExerciseById returns soft-deleted exercise for historical lookup", async () => {
    await ctx.initDb();
    mockDrizzleGet({
      id: "ex-old",
      name: "Old Bench Press",
      category: "chest",
      primary_muscles: '["chest"]',
      secondary_muscles: "[]",
      equipment: "barbell",
      instructions: null,
      difficulty: "intermediate",
      is_custom: 0,
      deleted_at: 1700000000,
      attachment: null,
      is_voltra: 0,
    });

    const exercise = await ctx.db.getExerciseById("ex-old");
    expect(exercise).not.toBeNull();
    expect(exercise!.deleted_at).toBe(1700000000);
    expect(exercise!.name).toBe("Old Bench Press");
    expect(exercise!.is_voltra).toBeUndefined();
  });
});

describe("templates CRUD", () => {
  it("createTemplate inserts and returns template", async () => {
    await ctx.initDb();
    jest.spyOn(Date, "now").mockReturnValue(1000);
    const result = await ctx.db.createTemplate("Push Day");
    expect(result.id).toBe(MOCK_UUID);
    expect(result.name).toBe("Push Day");
    expect(result.created_at).toBe(1000);
    jest.restoreAllMocks();
  });

  it("getTemplates returns all templates", async () => {
    await ctx.initDb();
    setDrizzleQueryResult([
      { id: "t1", name: "Push", created_at: 100, updated_at: 200, is_starter: 0, source: null },
    ]);

    const result = await ctx.db.getTemplates();
    expect(result).toEqual([
      { id: "t1", name: "Push", created_at: 100, updated_at: 200, is_starter: false, source: null },
    ]);
    resetDrizzleResults();
  });

  it("deleteTemplate removes template and related data", async () => {
    await ctx.initDb();
    setDrizzleGetResult({ is_starter: 0 });
    await ctx.db.deleteTemplate("t1");
    expect(mockDrizzleDb.delete).toHaveBeenCalled();
    expect(mockDrizzleDb.update).toHaveBeenCalled();
    resetDrizzleResults();
  });
});
