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
  getBackupCategoryCounts,
  estimateExportSize,
  IMPORT_TABLE_ORDER,
  type BackupV7,
} from "../../../lib/db/import-export";

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.getFirstAsync.mockResolvedValue({ cnt: 0 });
  mockDb.runAsync.mockResolvedValue({ changes: 1 });
});

// ---- Export v3 Format ----

describe("exportAllData", () => {
  it("produces v7 category-keyed format with data wrapper and counts", async () => {
    mockDb.getAllAsync.mockResolvedValue([]);
    const result = await exportAllData();
    expect(result.version).toBe(7);
    expect(result.data).toBeDefined();
    expect(result.counts).toBeDefined();
    expect(result.exported_at).toBeDefined();
    expect(result.app_version).toBeDefined();
    expect(result.data).toHaveProperty("workout_templates");
  });

  it("includes all tables under category sections", async () => {
    mockDb.getAllAsync.mockResolvedValue([]);
    const result = await exportAllData() as BackupV7;
    expect(result.data.workout_templates).toEqual({
      workout_templates: [],
      template_exercises: [],
    });
    expect(result.data.workout_history).toEqual({
      workout_sessions: [],
      workout_sets: [],
    });
    expect(result.data.exercises).toEqual({
      exercises: [],
    });
  });

  it("omits unchecked categories from selective export", async () => {
    mockDb.getAllAsync.mockImplementation(async (sql: string) => {
      if (sql.includes("app_settings")) {
        return [
          { key: "plate_calculator_unit", value: "kg" },
          { key: "rest_timer_sound", value: "chime" },
          { key: "theme", value: "dark" },
        ];
      }
      if (sql.includes("exercises")) return [{ id: "e1" }];
      if (sql.includes("workout_templates")) return [{ id: "t1" }];
      if (sql.includes("template_exercises")) return [{ id: "te1" }];
      return [];
    });

    const result = await exportAllData({
      selectedCategories: ["workout_templates", "plate_calculator_settings"],
    }) as BackupV7;

    expect(result.data).toHaveProperty("workout_templates");
    expect(result.data).toHaveProperty("plate_calculator_settings");
    expect(result.data).not.toHaveProperty("exercises");
    expect(result.data).not.toHaveProperty("rest_timer_settings");
    expect(result.data.plate_calculator_settings?.app_settings).toEqual([
      { key: "plate_calculator_unit", value: "kg" },
    ]);
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
  it.each([
    { name: "rejects files over 50MB", bytes: 51 * 1024 * 1024, expectedType: "file_too_large" as const },
    { name: "accepts files under 50MB", bytes: 10 * 1024 * 1024, expectedType: null },
  ])("$name", ({ bytes, expectedType }) => {
    const err = validateBackupFileSize(bytes);
    if (expectedType === null) {
      expect(err).toBeNull();
    } else {
      expect(err).not.toBeNull();
      expect(err!.type).toBe(expectedType);
    }
  });
});

describe("validateBackupData", () => {
  // Consolidated as parameterized cases (BLD-816). Each row exercises one
  // validation branch — the assertion shape is the same so they fold cleanly.
  type RejectCase = { name: string; payload: unknown; type: string; messageContains?: string };
  type AcceptCase = { name: string; payload: unknown };

  const rejects: RejectCase[] = [
    { name: "non-object data", payload: "not an object", type: "corrupt_json" },
    { name: "missing version", payload: { data: {} }, type: "missing_version" },
    {
      name: "future version (v8+)",
      payload: { version: 8, data: { exercises: [{ id: "1" }] } },
      type: "future_version",
      messageContains: "update the app",
    },
    { name: "v3 without data key", payload: { version: 3 }, type: "missing_data" },
    {
      name: "empty backup",
      payload: { version: 3, data: { exercises: [], workout_templates: [] } },
      type: "empty_backup",
    },
    {
      name: "malformed category payload (no importable arrays)",
      payload: { version: 7, data: { exercises: { exercises: "not an array" } } },
      type: "empty_backup",
    },
    {
      name: "malformed category payload (no importable arrays)",
      payload: { version: 7, data: { exercises: { exercises: "not an array" } } },
      type: "empty_backup",
    },
    {
      name: "negative calorie values",
      payload: { version: 3, data: { food_entries: [{ id: "1", calories: -100 }] } },
      type: "negative_values",
    },
    {
      name: "negative weight values",
      payload: { version: 3, data: { body_weight: [{ id: "1", weight: -5 }] } },
      type: "negative_values",
    },
    {
      name: "negative reps values",
      payload: { version: 3, data: { workout_sets: [{ id: "1", reps: -3 }] } },
      type: "negative_values",
    },
  ];

  const accepts: AcceptCase[] = [
    { name: "v7 backup", payload: { version: 7, data: { exercises: { exercises: [{ id: "1" }] } } } },
    { name: "v6 backup", payload: { version: 6, data: { exercises: [{ id: "1", name: "Squat" }] } } },
    { name: "v5 backup", payload: { version: 5, data: { exercises: [{ id: "1", name: "Bench" }] } } },
    { name: "v4 backup", payload: { version: 4, data: { exercises: [{ id: "1", name: "Bench" }] } } },
    { name: "v3 backup", payload: { version: 3, data: { exercises: [{ id: "1", name: "Bench" }] } } },
    { name: "v2 backup (legacy top-level keys)", payload: { version: 2, exercises: [{ id: "1", name: "Bench" }] } },
    {
      name: "null numeric values in nullable fields",
      payload: {
        version: 3,
        data: {
          body_weight: [{ id: "1", weight: 70 }],
          workout_sets: [{ id: "1", weight: null, reps: null, set_number: 1 }],
        },
      },
    },
  ];

  it.each(rejects)("rejects $name with type=$type", ({ payload, type, messageContains }) => {
    const err = validateBackupData(payload);
    expect(err).not.toBeNull();
    expect(err!.type).toBe(type);
    if (messageContains) expect(err!.message).toContain(messageContains);
  });

  it.each(accepts)("accepts $name", ({ payload }) => {
    expect(validateBackupData(payload)).toBeNull();
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

describe("getBackupCategoryCounts", () => {
  it("returns category counts for v7 format", () => {
    const counts = getBackupCategoryCounts({
      version: 7,
      data: {
        workout_templates: {
          workout_templates: [{ id: "t1" }],
          template_exercises: [{ id: "te1" }, { id: "te2" }],
        },
        exercises: {
          exercises: [{ id: "e1" }],
        },
      },
    });

    expect(counts.workout_templates).toBe(3);
    expect(counts.exercises).toBe(1);
    expect(counts.workout_history).toBe(0);
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

  it("imports only selected categories and preserves unchecked app settings", async () => {
    const sqlCalls: { sql: string; params: unknown[] }[] = [];
    mockDb.runAsync.mockImplementation(async (sql: string, params?: unknown[]) => {
      sqlCalls.push({ sql, params: params ?? [] });
      return { changes: 1 };
    });

    await importData(
      {
        version: 7,
        data: {
          plate_calculator_settings: {
            app_settings: [{ key: "plate_calculator_unit", value: "kg" }],
          },
          rest_timer_settings: {
            app_settings: [{ key: "rest_timer_sound", value: "bell" }],
          },
          exercises: {
            exercises: [{ id: "e1", name: "Bench", category: "chest", primary_muscles: "", secondary_muscles: "", equipment: "barbell", instructions: "", difficulty: "beginner", is_custom: 0 }],
          },
        },
      },
      { selectedCategories: ["plate_calculator_settings", "exercises"] },
    );

    const appSettingInserts = sqlCalls.filter((c) => c.sql.includes("INSERT OR IGNORE INTO app_settings"));
    expect(appSettingInserts).toHaveLength(1);
    expect(appSettingInserts[0].params).toContain("plate_calculator_unit");
    expect(appSettingInserts[0].params).not.toContain("rest_timer_sound");
    expect(sqlCalls.some((c) => c.sql.includes("INSERT OR IGNORE INTO exercises"))).toBe(true);
  });

  it("supports full export/import round-trip without losing records", async () => {
    const tableRows: Record<string, unknown[]> = {
      exercises: [{ id: "e1", name: "Bench", category: "chest", primary_muscles: "", secondary_muscles: "", equipment: "barbell", instructions: "", difficulty: "beginner", is_custom: 0 }],
      workout_templates: [{ id: "t1", name: "Push", created_at: 1, updated_at: 1 }],
      template_exercises: [{ id: "te1", template_id: "t1", exercise_id: "e1", position: 0, target_sets: 3, target_reps: "8", rest_seconds: 60 }],
      workout_sessions: [{ id: "s1", template_id: "t1", name: "Push Day", started_at: 1, completed_at: 2, duration_seconds: 3600, notes: "" }],
      workout_sets: [{ id: "ws1", session_id: "s1", exercise_id: "e1", set_number: 1, weight: 100, reps: 8, completed: 1, completed_at: 2 }],
      app_settings: [{ key: "theme", value: "dark" }],
    };

    mockDb.getAllAsync.mockImplementation(async (sql: string) => {
      const table = sql.replace("SELECT * FROM ", "");
      return tableRows[table] ?? [];
    });
    mockDb.runAsync.mockResolvedValue({ changes: 1 });

    const exported = await exportAllData();
    const imported = await importData(exported);

    expect(exported.version).toBe(7);
    expect(imported.inserted).toBeGreaterThan(0);
    expect(imported.perTable.exercises.inserted).toBe(1);
    expect(imported.perTable.workout_templates.inserted).toBe(1);
    expect(imported.perTable.template_exercises.inserted).toBe(1);
    expect(imported.perTable.workout_sessions.inserted).toBe(1);
    expect(imported.perTable.workout_sets.inserted).toBe(1);
    expect(imported.perTable.app_settings.inserted).toBe(1);
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

// ---- BLD-622: eccentric_overload removal hardening ----

