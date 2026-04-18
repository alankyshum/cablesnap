let mockUuidCounter = 0;

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => `mock-uuid-${++mockUuidCounter}`),
}));

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
  prepareAsync: jest.fn().mockResolvedValue({
    executeAsync: jest.fn().mockResolvedValue(undefined),
    finalizeAsync: jest.fn().mockResolvedValue(undefined),
  }),
};

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

import {
  createMealTemplate,
  getMealTemplates,
  getMealTemplateById,
  updateMealTemplate,
  deleteMealTemplate,
  logFromTemplate,
  undoLogFromTemplate,
} from "../../../lib/db/meal-templates";
import { getDatabase } from "../../../lib/db/helpers";

async function initDb() {
  await getDatabase();
  jest.clearAllMocks();
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockUuidCounter = 0;
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.getFirstAsync.mockResolvedValue(null);
  mockDb.runAsync.mockResolvedValue({ changes: 1 });
  mockDb.withTransactionAsync.mockImplementation(async (cb: () => Promise<void>) => cb());
  await initDb();
});

// ---- createMealTemplate ----

describe("createMealTemplate", () => {
  it("creates a template with items and cached macros", async () => {
    // Mock food lookups for macro computation
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ calories: 200, protein: 10, carbs: 30, fat: 5 })
      .mockResolvedValueOnce({ calories: 150, protein: 20, carbs: 10, fat: 3 });

    const result = await createMealTemplate({
      name: "My Breakfast",
      meal: "breakfast",
      items: [
        { food_entry_id: "food-1", servings: 1 },
        { food_entry_id: "food-2", servings: 2 },
      ],
    });

    expect(result.name).toBe("My Breakfast");
    expect(result.meal).toBe("breakfast");
    expect(result.cached_calories).toBe(200 + 150 * 2);
    expect(result.cached_protein).toBe(10 + 20 * 2);
    expect(result.cached_carbs).toBe(30 + 10 * 2);
    expect(result.cached_fat).toBe(5 + 3 * 2);

    expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(1);
    // 1 template INSERT + 2 item INSERTs
    expect(mockDb.runAsync).toHaveBeenCalledTimes(3);
  });

  it("handles empty items", async () => {
    const result = await createMealTemplate({
      name: "Empty Template",
      meal: "snack",
      items: [],
    });

    expect(result.cached_calories).toBe(0);
    expect(result.cached_protein).toBe(0);
    // 1 template INSERT, 0 item INSERTs
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
  });
});

// ---- getMealTemplates ----

describe("getMealTemplates", () => {
  it("returns templates sorted by last_used_at", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: "t1", name: "Breakfast", meal: "breakfast", cached_calories: 500, cached_protein: 30, cached_carbs: 60, cached_fat: 15, last_used_at: 2000, created_at: 1000, updated_at: 1000 },
      { id: "t2", name: "Lunch", meal: "lunch", cached_calories: 700, cached_protein: 40, cached_carbs: 80, cached_fat: 20, last_used_at: 1000, created_at: 900, updated_at: 900 },
    ]);

    const templates = await getMealTemplates();
    expect(templates).toHaveLength(2);
    expect(templates[0].name).toBe("Breakfast");
    expect(templates[1].name).toBe("Lunch");
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY last_used_at DESC")
    );
  });
});

// ---- getMealTemplateById ----

describe("getMealTemplateById", () => {
  it("returns template with items and joined food data", async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({
      id: "t1", name: "Breakfast", meal: "breakfast", cached_calories: 500, cached_protein: 30, cached_carbs: 60, cached_fat: 15, last_used_at: null, created_at: 1000, updated_at: 1000,
    });
    mockDb.getAllAsync.mockResolvedValueOnce([
      {
        id: "item-1", template_id: "t1", food_entry_id: "food-1", servings: 1, sort_order: 0,
        food_name: "Oatmeal", food_calories: 200, food_protein: 8, food_carbs: 35, food_fat: 4, food_serving_size: "1 cup", food_is_favorite: 1, food_created_at: 500,
      },
      {
        id: "item-2", template_id: "t1", food_entry_id: "food-2", servings: 2, sort_order: 1,
        food_name: null, food_calories: null, food_protein: null, food_carbs: null, food_fat: null, food_serving_size: null, food_is_favorite: null, food_created_at: null,
      },
    ]);

    const template = await getMealTemplateById("t1");
    expect(template).not.toBeNull();
    expect(template!.items).toHaveLength(2);
    // First item has food data
    expect(template!.items![0].food?.name).toBe("Oatmeal");
    expect(template!.items![0].food?.is_favorite).toBe(true);
    // Second item has missing food (deleted)
    expect(template!.items![1].food).toBeUndefined();
  });

  it("returns null for non-existent template", async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    const template = await getMealTemplateById("nonexistent");
    expect(template).toBeNull();
  });
});

// ---- updateMealTemplate ----

describe("updateMealTemplate", () => {
  it("updates template, deletes old items, inserts new items", async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ calories: 300, protein: 15, carbs: 40, fat: 10 });

    await updateMealTemplate("t1", {
      name: "Updated Breakfast",
      meal: "breakfast",
      items: [{ food_entry_id: "food-3", servings: 1.5 }],
    });

    expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(1);
    // 1 UPDATE + 1 DELETE old items + 1 INSERT new item
    expect(mockDb.runAsync).toHaveBeenCalledTimes(3);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE meal_templates"),
      expect.arrayContaining(["Updated Breakfast", "breakfast"])
    );
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM meal_template_items"),
      ["t1"]
    );
  });
});

// ---- deleteMealTemplate ----

describe("deleteMealTemplate", () => {
  it("deletes items then template in transaction (manual cascade)", async () => {
    await deleteMealTemplate("t1");

    expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(2);
    // Items deleted first
    expect(mockDb.runAsync).toHaveBeenNthCalledWith(1,
      "DELETE FROM meal_template_items WHERE template_id = ?",
      ["t1"]
    );
    // Then template
    expect(mockDb.runAsync).toHaveBeenNthCalledWith(2,
      "DELETE FROM meal_templates WHERE id = ?",
      ["t1"]
    );
  });
});

// ---- logFromTemplate ----

describe("logFromTemplate", () => {
  it("logs items to daily_log, skipping missing food entries", async () => {
    // Items query: 2 items, one with valid food, one with null (missing)
    mockDb.getAllAsync.mockResolvedValueOnce([
      { food_entry_id: "food-1", servings: 1, food_id: "food-1" },
      { food_entry_id: "food-deleted", servings: 2, food_id: null }, // missing
    ]);
    // Template query for meal
    mockDb.getFirstAsync.mockResolvedValueOnce({ meal: "breakfast" });

    const result = await logFromTemplate("t1", "2026-04-18");

    expect(result.logIds).toHaveLength(1); // Only 1 logged (missing skipped)
    expect(result.meal).toBe("breakfast");
    expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(1);
    // 1 daily_log INSERT + 1 last_used_at UPDATE
    expect(mockDb.runAsync).toHaveBeenCalledTimes(2);
  });

  it("logs all items when none are missing", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { food_entry_id: "food-1", servings: 1, food_id: "food-1" },
      { food_entry_id: "food-2", servings: 2, food_id: "food-2" },
    ]);
    mockDb.getFirstAsync.mockResolvedValueOnce({ meal: "lunch" });

    const result = await logFromTemplate("t1", "2026-04-18");

    expect(result.logIds).toHaveLength(2);
    expect(result.meal).toBe("lunch");
    // 2 daily_log INSERTs + 1 last_used_at UPDATE
    expect(mockDb.runAsync).toHaveBeenCalledTimes(3);
  });

  it("throws when template not found", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    mockDb.getFirstAsync.mockResolvedValueOnce(null);

    await expect(logFromTemplate("nonexistent", "2026-04-18"))
      .rejects.toThrow("Template not found");
  });
});

// ---- undoLogFromTemplate ----

describe("undoLogFromTemplate", () => {
  it("deletes all logged entries in transaction", async () => {
    await undoLogFromTemplate(["log-1", "log-2", "log-3"]);

    expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(3);
    expect(mockDb.runAsync).toHaveBeenNthCalledWith(1,
      "DELETE FROM daily_log WHERE id = ?",
      ["log-1"]
    );
  });

  it("handles empty logIds array", async () => {
    await undoLogFromTemplate([]);

    expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });
});
