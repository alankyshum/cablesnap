const mockStmt = {
  executeAsync: jest.fn().mockResolvedValue(undefined),
  finalizeAsync: jest.fn().mockResolvedValue(undefined),
};

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  prepareAsync: jest.fn().mockResolvedValue(mockStmt),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
};

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

import {
  exportAllData,
  importData,
  validateBackupData,
  validateBackupFileSize,
  getBackupCounts,
  estimateExportSize,
  IMPORT_TABLE_ORDER,
} from "../../../lib/db/import-export";

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.getFirstAsync.mockResolvedValue({ cnt: 0 });
  mockDb.runAsync.mockResolvedValue({ changes: 1 });
});

// ---- Export v3 Format ----

describe("exportAllData", () => {
  it("produces v6 format with data wrapper and counts", async () => {
    mockDb.getAllAsync.mockResolvedValue([]);
    const result = await exportAllData();
    expect(result.version).toBe(6);
    expect(result.data).toBeDefined();
    expect(result.counts).toBeDefined();
    expect(result.exported_at).toBeDefined();
    expect(result.app_version).toBeDefined();
  });

  it("includes all 20 tables", async () => {
    mockDb.getAllAsync.mockResolvedValue([]);
    const result = await exportAllData();
    for (const table of IMPORT_TABLE_ORDER) {
      expect(result.data).toHaveProperty(table);
      expect(Array.isArray((result.data as Record<string, unknown>)[table])).toBe(true);
    }
  });

  it("calls progress callback per table", async () => {
    mockDb.getAllAsync.mockResolvedValue([]);
    const progress: string[] = [];
    await exportAllData((p) => progress.push(p.table));
    // Should have 20 table calls plus "done"
    expect(progress.length).toBe(IMPORT_TABLE_ORDER.length + 1);
    expect(progress[progress.length - 1]).toBe("done");
  });

  it("counts are accurate", async () => {
    let callIdx = 0;
    mockDb.getAllAsync.mockImplementation(async () => {
      callIdx++;
      // First table (exercises) returns 3 rows
      if (callIdx === 1) return [{ id: "a" }, { id: "b" }, { id: "c" }];
      return [];
    });
    const result = await exportAllData();
    expect(result.counts.exercises).toBe(3);
  });
});

// ---- Validation ----

describe("validateBackupFileSize", () => {
  it("rejects files over 50MB", () => {
    const err = validateBackupFileSize(51 * 1024 * 1024);
    expect(err).not.toBeNull();
    expect(err!.type).toBe("file_too_large");
  });

  it("accepts files under 50MB", () => {
    const err = validateBackupFileSize(10 * 1024 * 1024);
    expect(err).toBeNull();
  });
});

describe("validateBackupData", () => {
  it("rejects non-object data", () => {
    const err = validateBackupData("not an object");
    expect(err).not.toBeNull();
    expect(err!.type).toBe("corrupt_json");
  });

  it("rejects missing version", () => {
    const err = validateBackupData({ data: {} });
    expect(err).not.toBeNull();
    expect(err!.type).toBe("missing_version");
  });

  it("rejects future version (v7+)", () => {
    const err = validateBackupData({ version: 7, data: { exercises: [{ id: "1" }] } });
    expect(err).not.toBeNull();
    expect(err!.type).toBe("future_version");
    expect(err!.message).toContain("update the app");
  });

  it("accepts v6 backup", () => {
    const err = validateBackupData({
      version: 6,
      data: { exercises: [{ id: "1", name: "Squat" }] },
    });
    expect(err).toBeNull();
  });

  it("accepts v5 backup", () => {
    const err = validateBackupData({
      version: 5,
      data: { exercises: [{ id: "1", name: "Bench" }] },
    });
    expect(err).toBeNull();
  });

  it("accepts v4 backup", () => {
    const err = validateBackupData({
      version: 4,
      data: { exercises: [{ id: "1", name: "Bench" }] },
    });
    expect(err).toBeNull();
  });

  it("accepts v2 backup", () => {
    const err = validateBackupData({
      version: 2,
      exercises: [{ id: "1", name: "Bench" }],
    });
    expect(err).toBeNull();
  });

  it("accepts v3 backup", () => {
    const err = validateBackupData({
      version: 3,
      data: {
        exercises: [{ id: "1", name: "Bench" }],
      },
    });
    expect(err).toBeNull();
  });

  it("rejects v3 without data key", () => {
    const err = validateBackupData({ version: 3 });
    expect(err).not.toBeNull();
    expect(err!.type).toBe("missing_data");
  });

  it("rejects empty backup", () => {
    const err = validateBackupData({
      version: 3,
      data: {
        exercises: [],
        workout_templates: [],
      },
    });
    expect(err).not.toBeNull();
    expect(err!.type).toBe("empty_backup");
  });

  it("rejects invalid table (not an array)", () => {
    const err = validateBackupData({
      version: 3,
      data: {
        exercises: "not an array",
      },
    });
    expect(err).not.toBeNull();
    expect(err!.type).toBe("invalid_table");
  });

  it("rejects negative calorie values", () => {
    const err = validateBackupData({
      version: 3,
      data: {
        food_entries: [{ id: "1", calories: -100 }],
      },
    });
    expect(err).not.toBeNull();
    expect(err!.type).toBe("negative_values");
  });

  it("rejects negative weight values", () => {
    const err = validateBackupData({
      version: 3,
      data: {
        body_weight: [{ id: "1", weight: -5 }],
      },
    });
    expect(err).not.toBeNull();
    expect(err!.type).toBe("negative_values");
  });

  it("rejects negative reps values", () => {
    const err = validateBackupData({
      version: 3,
      data: {
        workout_sets: [{ id: "1", reps: -3 }],
      },
    });
    expect(err).not.toBeNull();
    expect(err!.type).toBe("negative_values");
  });

  it("allows null numeric values (nullable fields)", () => {
    const err = validateBackupData({
      version: 3,
      data: {
        body_weight: [{ id: "1", weight: 70 }],
        workout_sets: [{ id: "1", weight: null, reps: null, set_number: 1 }],
      },
    });
    expect(err).toBeNull();
  });
});

// ---- getBackupCounts ----

describe("getBackupCounts", () => {
  it("returns counts for v3 format", () => {
    const counts = getBackupCounts({
      version: 3,
      data: {
        exercises: [{ id: "1" }, { id: "2" }],
        workout_templates: [{ id: "t1" }],
      },
    });
    expect(counts.exercises).toBe(2);
    expect(counts.workout_templates).toBe(1);
    expect(counts.programs).toBe(0);
  });

  it("returns counts for v2 format using legacy keys", () => {
    const counts = getBackupCounts({
      version: 2,
      exercises: [{ id: "1" }],
      templates: [{ id: "t1" }, { id: "t2" }],
      sessions: [{ id: "s1" }],
      sets: [{ id: "set1" }],
    });
    expect(counts.exercises).toBe(1);
    expect(counts.workout_templates).toBe(2);
    expect(counts.workout_sessions).toBe(1);
    expect(counts.workout_sets).toBe(1);
  });
});

// ---- Import FK Ordering ----

describe("importData", () => {
  it("imports tables in FK-dependency order", // eslint-disable-next-line max-lines-per-function
  async () => {
    const importOrder: string[] = [];
    mockDb.withTransactionAsync.mockImplementation(async (cb: () => Promise<void>) => {
      await cb();
    });
    mockDb.runAsync.mockImplementation(async (sql: string) => {
      const match = sql.match(/INSERT OR IGNORE INTO (\w+)/);
      if (match) importOrder.push(match[1]);
      return { changes: 1 };
    });

    const data = {
      version: 3,
      data: {
        exercises: [{ id: "e1", name: "Bench", category: "chest", primary_muscles: "", secondary_muscles: "", equipment: "barbell", instructions: "", difficulty: "beginner", is_custom: 0 }],
        workout_templates: [{ id: "t1", name: "Push", created_at: 1, updated_at: 1 }],
        template_exercises: [{ id: "te1", template_id: "t1", exercise_id: "e1", position: 0, target_sets: 3, target_reps: "8", rest_seconds: 60 }],
        workout_sessions: [{ id: "s1", template_id: "t1", name: "Push Day", started_at: 1, completed_at: 2, duration_seconds: 3600, notes: "" }],
        workout_sets: [{ id: "ws1", session_id: "s1", exercise_id: "e1", set_number: 1, weight: 100, reps: 8, completed: 1, completed_at: 2 }],
      },
    };

    await importData(data);

    // exercises must come before template_exercises and workout_sets
    const exIdx = importOrder.indexOf("exercises");
    const teIdx = importOrder.indexOf("template_exercises");
    const wsIdx = importOrder.indexOf("workout_sets");
    const tplIdx = importOrder.indexOf("workout_templates");
    const sessIdx = importOrder.indexOf("workout_sessions");

    expect(exIdx).toBeLessThan(teIdx);
    expect(exIdx).toBeLessThan(wsIdx);
    expect(tplIdx).toBeLessThan(teIdx);
    expect(sessIdx).toBeLessThan(wsIdx);
  });

  it("returns inserted and skipped counts", async () => {
    let callCount = 0;
    mockDb.runAsync.mockImplementation(async () => {
      callCount++;
      // Alternate: first insert succeeds, second is duplicate
      return { changes: callCount % 2 === 1 ? 1 : 0 };
    });

    const data = {
      version: 3,
      data: {
        exercises: [
          { id: "e1", name: "Bench", category: "chest", primary_muscles: "", secondary_muscles: "", equipment: "barbell", instructions: "", difficulty: "beginner", is_custom: 0 },
          { id: "e2", name: "Squat", category: "legs_glutes", primary_muscles: "", secondary_muscles: "", equipment: "barbell", instructions: "", difficulty: "intermediate", is_custom: 0 },
        ],
      },
    };

    const result = await importData(data);
    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.perTable.exercises).toEqual({ inserted: 1, skipped: 1 });
  });

  it("handles v2 backward compatibility (missing tables as empty)", async () => {
    mockDb.runAsync.mockResolvedValue({ changes: 1 });

    const v2Data = {
      version: 2,
      exercises: [{ id: "e1", name: "Bench", category: "chest", primary_muscles: "", secondary_muscles: "", equipment: "barbell", instructions: "", difficulty: "beginner", is_custom: 0 }],
      templates: [{ id: "t1", name: "Push", created_at: 1, updated_at: 1 }],
    };

    const result = await importData(v2Data);
    expect(result.inserted).toBe(2);
    // Missing tables should have 0 inserted
    expect(result.perTable.programs).toEqual({ inserted: 0, skipped: 0 });
    expect(result.perTable.achievements_earned).toEqual({ inserted: 0, skipped: 0 });
  });

  it("enables foreign keys pragma", async () => {
    mockDb.runAsync.mockResolvedValue({ changes: 0 });
    await importData({ version: 3, data: { exercises: [{ id: "1" }] } });
    expect(mockDb.execAsync).toHaveBeenCalledWith("PRAGMA foreign_keys = ON");
  });

  it("calls progress callback during import", async () => {
    mockDb.runAsync.mockResolvedValue({ changes: 1 });
    const progress: string[] = [];
    await importData(
      { version: 3, data: { exercises: [{ id: "1" }] } },
      (p) => progress.push(p.table)
    );
    expect(progress).toContain("exercises");
    expect(progress[progress.length - 1]).toBe("done");
  });

  it("preserves is_starter flag when importing workout_templates", async () => {
    const sqlCalls: { sql: string; params: unknown[] }[] = [];
    mockDb.runAsync.mockImplementation(async (sql: string, params?: unknown[]) => {
      sqlCalls.push({ sql, params: params ?? [] });
      return { changes: 1 };
    });

    const data = {
      version: 3,
      data: {
        workout_templates: [
          { id: "starter-tpl-1", name: "Full Body", created_at: 0, updated_at: 0, is_starter: 1 },
          { id: "user-tpl-1", name: "My Custom", created_at: 1, updated_at: 1 },
        ],
      },
    };

    await importData(data);
    const tplInserts = sqlCalls.filter((c) => c.sql.includes("INSERT OR IGNORE INTO workout_templates"));
    expect(tplInserts).toHaveLength(2);
    // Starter template should have is_starter=1
    expect(tplInserts[0].params).toContain(1);
    // User template should default to is_starter=0
    expect(tplInserts[1].params).toContain(0);
  });

  it("preserves is_starter flag when importing programs", async () => {
    const sqlCalls: { sql: string; params: unknown[] }[] = [];
    mockDb.runAsync.mockImplementation(async (sql: string, params?: unknown[]) => {
      sqlCalls.push({ sql, params: params ?? [] });
      return { changes: 1 };
    });

    const data = {
      version: 3,
      data: {
        programs: [
          { id: "starter-prog-1", name: "PPL", description: "", is_active: 0, current_day_id: null, created_at: 0, updated_at: 0, is_starter: 1 },
          { id: "user-prog-1", name: "My Program", description: "", is_active: 1, current_day_id: null, created_at: 1, updated_at: 1 },
        ],
      },
    };

    await importData(data);
    const progInserts = sqlCalls.filter((c) => c.sql.includes("INSERT OR IGNORE INTO programs"));
    expect(progInserts).toHaveLength(2);
    // Starter program should have is_starter=1
    expect(progInserts[0].params).toContain(1);
    // User program should default to is_starter=0
    expect(progInserts[1].params).toContain(0);
  });

  it("imports new tables: programs, achievements_earned, app_settings", async () => {
    const inserted: string[] = [];
    mockDb.runAsync.mockImplementation(async (sql: string) => {
      const match = sql.match(/INSERT OR IGNORE INTO (\w+)/);
      if (match) inserted.push(match[1]);
      return { changes: 1 };
    });

    const data = {
      version: 3,
      data: {
        programs: [{ id: "p1", name: "PPL", description: "", is_active: 1, current_day_id: null, created_at: 1, updated_at: 1, deleted_at: null }],
        achievements_earned: [{ achievement_id: "first_workout", earned_at: 12345 }],
        app_settings: [{ key: "theme", value: "dark" }],
        program_days: [{ id: "pd1", program_id: "p1", template_id: null, position: 0, label: "Day 1" }],
        program_log: [{ id: "pl1", program_id: "p1", day_id: "pd1", session_id: "s1", completed_at: 1 }],
        program_schedule: [{ program_id: "p1", day_of_week: 1, template_id: "t1" }],
      },
    };

    await importData(data);
    expect(inserted).toContain("programs");
    expect(inserted).toContain("achievements_earned");
    expect(inserted).toContain("app_settings");
    expect(inserted).toContain("program_days");
    expect(inserted).toContain("program_log");
    expect(inserted).toContain("program_schedule");
  });
});

// ---- Import Meal Templates ----

describe("importData — meal templates", () => {
  it("imports meal_templates and meal_template_items", async () => {
    const inserted: string[] = [];
    mockDb.runAsync.mockImplementation(async (sql: string) => {
      const match = sql.match(/INSERT OR IGNORE INTO (\w+)/);
      if (match) inserted.push(match[1]);
      return { changes: 1 };
    });

    const data = {
      version: 6,
      data: {
        meal_templates: [
          { id: "mt1", name: "Breakfast Bowl", meal: "breakfast", cached_calories: 500, cached_protein: 30, cached_carbs: 60, cached_fat: 15, last_used_at: null, created_at: 1000, updated_at: 1000 },
        ],
        meal_template_items: [
          { id: "mti1", template_id: "mt1", food_entry_id: "f1", servings: 2, sort_order: 0 },
          { id: "mti2", template_id: "mt1", food_entry_id: "f2", servings: 1, sort_order: 1 },
        ],
      },
    };

    await importData(data);
    expect(inserted).toContain("meal_templates");
    expect(inserted).toContain("meal_template_items");
  });

  it("imports meal_templates before meal_template_items (FK order)", async () => {
    const importOrder: string[] = [];
    mockDb.runAsync.mockImplementation(async (sql: string) => {
      const match = sql.match(/INSERT OR IGNORE INTO (\w+)/);
      if (match) importOrder.push(match[1]);
      return { changes: 1 };
    });

    const data = {
      version: 6,
      data: {
        meal_templates: [{ id: "mt1", name: "Lunch", meal: "lunch", cached_calories: 0, cached_protein: 0, cached_carbs: 0, cached_fat: 0, last_used_at: null, created_at: 1, updated_at: 1 }],
        meal_template_items: [{ id: "mti1", template_id: "mt1", food_entry_id: "f1", servings: 1, sort_order: 0 }],
      },
    };

    await importData(data);
    const mtIdx = importOrder.indexOf("meal_templates");
    const mtiIdx = importOrder.indexOf("meal_template_items");
    expect(mtIdx).toBeGreaterThanOrEqual(0);
    expect(mtiIdx).toBeGreaterThanOrEqual(0);
    expect(mtIdx).toBeLessThan(mtiIdx);
  });

  it("handles old backups without meal template tables gracefully", async () => {
    mockDb.runAsync.mockResolvedValue({ changes: 1 });

    const data = {
      version: 5,
      data: {
        exercises: [{ id: "e1", name: "Bench", category: "chest", primary_muscles: "", secondary_muscles: "", equipment: "barbell", instructions: "", difficulty: "beginner", is_custom: 0 }],
      },
    };

    const result = await importData(data);
    expect(result.perTable.meal_templates).toEqual({ inserted: 0, skipped: 0 });
    expect(result.perTable.meal_template_items).toEqual({ inserted: 0, skipped: 0 });
  });

  it("defaults cached macros to 0 for meal_templates with missing fields", async () => {
    const sqlCalls: { sql: string; params: unknown[] }[] = [];
    mockDb.runAsync.mockImplementation(async (sql: string, params?: unknown[]) => {
      sqlCalls.push({ sql, params: params ?? [] });
      return { changes: 1 };
    });

    const data = {
      version: 6,
      data: {
        meal_templates: [{ id: "mt1", name: "Quick Meal", meal: "dinner", created_at: 1, updated_at: 1 }],
      },
    };

    await importData(data);
    const mtInserts = sqlCalls.filter((c) => c.sql.includes("INSERT OR IGNORE INTO meal_templates"));
    expect(mtInserts).toHaveLength(1);
    // cached_calories (idx 3), cached_protein (idx 4), cached_carbs (idx 5), cached_fat (idx 6) should default to 0
    expect(mtInserts[0].params[3]).toBe(0);
    expect(mtInserts[0].params[4]).toBe(0);
    expect(mtInserts[0].params[5]).toBe(0);
    expect(mtInserts[0].params[6]).toBe(0);
  });
});

// ---- Meal Template in IMPORT_TABLE_ORDER ----

describe("IMPORT_TABLE_ORDER includes meal templates", () => {
  it("contains meal_templates and meal_template_items", () => {
    expect(IMPORT_TABLE_ORDER).toContain("meal_templates");
    expect(IMPORT_TABLE_ORDER).toContain("meal_template_items");
  });

  it("has meal_templates before meal_template_items", () => {
    const mtIdx = IMPORT_TABLE_ORDER.indexOf("meal_templates");
    const mtiIdx = IMPORT_TABLE_ORDER.indexOf("meal_template_items");
    expect(mtIdx).toBeLessThan(mtiIdx);
  });
});

describe("estimateExportSize", () => {
  it("returns size estimate based on row counts", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ cnt: 100 });
    const { bytes, label } = await estimateExportSize();
    expect(bytes).toBeGreaterThan(0);
    expect(label).toBeTruthy();
  });
});
