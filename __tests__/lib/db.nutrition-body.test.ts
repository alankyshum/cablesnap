/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BLD-817: split from db.test.ts for worker parallelism.
 * Covers nutrition CRUD + body tracking CRUD.
 */
import {
  MOCK_UUID,
  mockDb,
  mockDrizzleDb,
  mockDrizzleAll,
  mockDrizzleGet,
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

describe("nutrition CRUD", () => {
  it("addFoodEntry creates food entry", async () => {
    await ctx.initDb();
    jest.spyOn(Date, "now").mockReturnValue(2000);
    const result = await ctx.db.addFoodEntry("Chicken", 165, 31, 0, 3.6, "100g", false);
    expect(result.id).toBe(MOCK_UUID);
    expect(result.name).toBe("Chicken");
    expect(result.calories).toBe(165);
    expect(result.protein).toBe(31);
    expect(result.is_favorite).toBe(false);
    jest.restoreAllMocks();
  });

  it("getFoodEntries returns mapped food entries", async () => {
    await ctx.initDb();
    mockDrizzleAll([
      {
        id: "f1",
        name: "Rice",
        calories: 130,
        protein: 2.7,
        carbs: 28,
        fat: 0.3,
        serving_size: "100g",
        is_favorite: 1,
        created_at: 100,
      },
    ]);

    const result = await ctx.db.getFoodEntries();
    expect(result).toHaveLength(1);
    expect(result[0].is_favorite).toBe(true);
  });

  it("toggleFavorite, deleteDailyLog fire expected Drizzle calls", async () => {
    await ctx.initDb();
    await ctx.db.toggleFavorite("f1");
    expect(mockDrizzleDb.update).toHaveBeenCalled();
    await ctx.db.deleteDailyLog("log1");
    expect(mockDrizzleDb.delete).toHaveBeenCalled();
  });

  it("addDailyLog creates a log entry", async () => {
    await ctx.initDb();
    jest.spyOn(Date, "now").mockReturnValue(3000);
    const result = await ctx.db.addDailyLog("f1", "2024-01-15", "lunch", 1.5);
    expect(result.food_entry_id).toBe("f1");
    expect(result.date).toBe("2024-01-15");
    expect(result.meal).toBe("lunch");
    expect(result.servings).toBe(1.5);
    jest.restoreAllMocks();
  });

  it("getMacroTargets returns defaults when no row exists, otherwise existing row", async () => {
    await ctx.initDb();
    mockDrizzleGet(null);
    jest.spyOn(Date, "now").mockReturnValue(4000);
    const defaults = await ctx.db.getMacroTargets();
    expect(defaults.calories).toBe(2000);
    expect(defaults.protein).toBe(150);
    expect(defaults.carbs).toBe(250);
    expect(defaults.fat).toBe(65);
    jest.restoreAllMocks();

    const existing = { id: "mt1", calories: 1800, protein: 180, carbs: 200, fat: 60, updated_at: 100 };
    mockDrizzleGet(existing);
    expect(await ctx.db.getMacroTargets()).toEqual(existing);
  });

  it("getDailySummary returns zero or computed totals based on row presence", async () => {
    await ctx.initDb();
    mockDrizzleGet({ calories: null, protein: null, carbs: null, fat: null });
    expect(await ctx.db.getDailySummary("2024-01-15")).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });

    mockDrizzleGet({ calories: 500, protein: 40, carbs: 60, fat: 15 });
    expect(await ctx.db.getDailySummary("2024-01-15")).toEqual({ calories: 500, protein: 40, carbs: 60, fat: 15 });
  });
});

describe("body tracking CRUD", () => {
  it("getBodySettings returns defaults when no row exists", async () => {
    await ctx.initDb();
    mockDrizzleGet(null);

    jest.spyOn(Date, "now").mockReturnValue(6000);
    const result = await ctx.db.getBodySettings();
    expect(result.weight_unit).toBe("kg");
    expect(result.measurement_unit).toBe("cm");
    expect(result.weight_goal).toBeNull();
    jest.restoreAllMocks();
  });

  it("updateBodySettings updates all fields", async () => {
    await ctx.initDb();
    mockDrizzleGet({
      id: "default",
      weight_unit: "kg",
      measurement_unit: "cm",
      weight_goal: null,
      body_fat_goal: null,
      updated_at: 100,
    });

    await ctx.db.updateBodySettings("lb", "in", 180, 15);
    expect(mockDrizzleDb.update).toHaveBeenCalled();
  });

  it("upsertBodyWeight inserts with ON CONFLICT", async () => {
    await ctx.initDb();
    const row = { id: "bw1", weight: 80, date: "2024-01-15", notes: "morning", logged_at: 100 };
    mockDrizzleGet(row);

    const insertChain: any = {
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockReturnThis(),
      then: (r: any) => Promise.resolve().then(r),
    };
    mockDrizzleDb.insert.mockReturnValueOnce(insertChain);

    const result = await ctx.db.upsertBodyWeight(80, "2024-01-15", "morning");
    expect(result.weight).toBe(80);
    expect(result.date).toBe("2024-01-15");
    expect(mockDrizzleDb.insert).toHaveBeenCalled();
  });

  it("getBodyWeightEntries queries with limit and offset", async () => {
    await ctx.initDb();
    mockDrizzleAll([
      { id: "bw1", weight: 80, date: "2024-01-15", notes: "", logged_at: 100 },
    ]);

    const result = await ctx.db.getBodyWeightEntries(10, 0);
    expect(result).toHaveLength(1);
  });

  it("deleteBodyWeight, deleteBodyMeasurements fire Drizzle.delete", async () => {
    await ctx.initDb();
    await ctx.db.deleteBodyWeight("bw1");
    expect(mockDrizzleDb.delete).toHaveBeenCalled();
    await ctx.db.deleteBodyMeasurements("bm1");
    expect(mockDrizzleDb.delete).toHaveBeenCalled();
  });

  it("getLatestBodyWeight returns most recent", async () => {
    await ctx.initDb();
    const row = { id: "bw1", weight: 82, date: "2024-01-20", notes: "", logged_at: 200 };
    mockDrizzleGet(row);

    const result = await ctx.db.getLatestBodyWeight();
    expect(result).toEqual(row);
  });

  it("upsertBodyMeasurements inserts with ON CONFLICT", async () => {
    await ctx.initDb();
    const vals = {
      waist: 80,
      chest: 100,
      hips: 95,
      left_arm: 35,
      right_arm: 35.5,
      left_thigh: 55,
      right_thigh: 55,
      left_calf: 38,
      right_calf: 38,
      neck: 40,
      body_fat: 15,
      notes: "post-cut",
    };
    const row = { id: "bm1", date: "2024-01-15", ...vals, logged_at: 100 };
    mockDrizzleGet(row);

    const insertChain: any = {
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockReturnThis(),
      then: (r: any) => Promise.resolve().then(r),
    };
    mockDrizzleDb.insert.mockReturnValueOnce(insertChain);

    const result = await ctx.db.upsertBodyMeasurements("2024-01-15", vals);
    expect(result.waist).toBe(80);
    expect(result.body_fat).toBe(15);
    expect(mockDrizzleDb.insert).toHaveBeenCalled();
  });

  it("getLatestMeasurements returns most recent", async () => {
    await ctx.initDb();
    mockDrizzleGet(null);

    const result = await ctx.db.getLatestMeasurements();
    expect(result).toBeNull();
  });
});
