const MOCK_UUID = "test-uuid-1234";
jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "test-uuid-1234"),
}));

// Build mock database with tracking functions
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

// Force re-require db module for each test to reset singleton
let db: typeof import("../../lib/db");

// Helper: initialize the database (consumes migration mocks), then clear mocks
async function initDb() {
  await db.getDatabase();
  jest.clearAllMocks();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.execAsync.mockResolvedValue(undefined);
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.getFirstAsync.mockResolvedValue({ count: 10 });
  mockDb.runAsync.mockResolvedValue({ changes: 1 });

  // Reset the cached db module to clear singleton
  jest.resetModules();
  jest.doMock("expo-sqlite", () => ({
    openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
  }));
  jest.doMock("../../lib/seed", () => ({
    seedExercises: jest.fn(() => []),
  }));
  jest.doMock("expo-crypto", () => ({
    randomUUID: jest.fn(() => "test-uuid-1234"),
  }));
  db = require("../../lib/db");
});

describe("getDatabase", () => {
  it("initializes database and runs migrations", async () => {
    const result = await db.getDatabase();
    expect(result).toBeDefined();
    expect(mockDb.execAsync).toHaveBeenCalled();
  });
});

describe("getDatabase web fallback", () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const originalPlatform = jest.requireActual("react-native").Platform;

  it("falls back to :memory: on web when OPFS fails", async () => {
    jest.resetModules();

    const failOnce = jest.fn()
      .mockRejectedValueOnce(new Error("cannot create file"))
      .mockResolvedValue(mockDb);

    jest.doMock("expo-sqlite", () => ({
      openDatabaseAsync: failOnce,
    }));
    jest.doMock("react-native", () => ({
      Platform: { OS: "web" },
    }));
    jest.doMock("../../lib/seed", () => ({
      seedExercises: jest.fn(() => []),
    }));

    const dbMod = require("../../lib/db");
    const result = await dbMod.getDatabase();

    expect(result).toBe(mockDb);
    expect(failOnce).toHaveBeenCalledTimes(2);
    expect(failOnce).toHaveBeenNthCalledWith(1, "fitforge.db");
    expect(failOnce).toHaveBeenNthCalledWith(2, ":memory:");
    expect(dbMod.isMemoryFallback()).toBe(true);
  });

  it("throws on non-web platform when open fails", async () => {
    jest.resetModules();

    const fail = jest.fn().mockRejectedValue(new Error("native crash"));

    jest.doMock("expo-sqlite", () => ({
      openDatabaseAsync: fail,
    }));
    jest.doMock("react-native", () => ({
      Platform: { OS: "android" },
    }));
    jest.doMock("../../lib/seed", () => ({
      seedExercises: jest.fn(() => []),
    }));

    const dbMod = require("../../lib/db");
    await expect(dbMod.getDatabase()).rejects.toThrow("native crash");
    expect(fail).toHaveBeenCalledTimes(1);
    expect(dbMod.isMemoryFallback()).toBe(false);
  });
});

describe("exercises CRUD", () => {
  it("getAllExercises returns mapped exercises", async () => {
    await initDb();
    mockDb.getAllAsync.mockResolvedValueOnce([
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
        mount_position: "mid",
        attachment: "single_handle",
        training_modes: '["strength"]',
        is_voltra: 1,
      },
    ]);

    const exercises = await db.getAllExercises();
    expect(exercises).toHaveLength(1);
    expect(exercises[0].name).toBe("Cable Chest Press");
    expect(exercises[0].primary_muscles).toEqual(["chest"]);
    expect(exercises[0].secondary_muscles).toEqual(["triceps"]);
    expect(exercises[0].is_custom).toBe(false);
    expect(exercises[0].mount_position).toBe("mid");
    expect(exercises[0].attachment).toBe("single_handle");
    expect(exercises[0].training_modes).toEqual(["strength"]);
    expect(exercises[0].is_voltra).toBe(true);
    expect(exercises[0].deleted_at).toBeUndefined();
  });

  it("getExerciseById returns null for missing exercise", async () => {
    await initDb();
    mockDb.getFirstAsync.mockResolvedValueOnce(null);

    const result = await db.getExerciseById("nonexistent");
    expect(result).toBeNull();
  });

  it("getExerciseById returns mapped exercise", async () => {
    await initDb();
    mockDb.getFirstAsync.mockResolvedValueOnce({
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
      mount_position: "low",
      attachment: "rope",
      training_modes: '["strength","hypertrophy"]',
      is_voltra: 0,
    });

    const exercise = await db.getExerciseById("ex1");
    expect(exercise).not.toBeNull();
    expect(exercise!.name).toBe("Cable Squat");
    expect(exercise!.primary_muscles).toEqual(["quads", "glutes"]);
    expect(exercise!.is_custom).toBe(true);
    expect(exercise!.mount_position).toBe("low");
    expect(exercise!.training_modes).toEqual(["strength", "hypertrophy"]);
  });

  it("createCustomExercise inserts and returns exercise", async () => {
    await initDb();
    const input = {
      name: "My Exercise",
      category: "chest" as const,
      primary_muscles: ["chest" as const],
      secondary_muscles: ["triceps" as const],
      equipment: "cable" as const,
      instructions: "Do it",
      difficulty: "beginner" as const,
    };

    const result = await db.createCustomExercise(input);
    expect(result.id).toBe(MOCK_UUID);
    expect(result.name).toBe("My Exercise");
    expect(result.is_custom).toBe(true);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO exercises"),
      expect.arrayContaining([MOCK_UUID, "My Exercise"])
    );
  });

  it("softDeleteCustomExercise removes from templates and soft-deletes", async () => {
    await initDb();
    await db.softDeleteCustomExercise("ex1");
    expect(mockDb.withTransactionAsync).toHaveBeenCalled();
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM template_exercises"),
      ["ex1"]
    );
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE exercises SET deleted_at"),
      expect.arrayContaining(["ex1"])
    );
  });

  it("getExerciseById returns soft-deleted exercise for historical lookup", async () => {
    await initDb();
    mockDb.getFirstAsync.mockResolvedValueOnce({
      id: "ex-old",
      name: "Old Bench Press",
      category: "chest",
      primary_muscles: '["chest"]',
      secondary_muscles: '[]',
      equipment: "barbell",
      instructions: null,
      difficulty: "intermediate",
      is_custom: 0,
      deleted_at: 1700000000,
      mount_position: null,
      attachment: null,
      training_modes: null,
      is_voltra: 0,
    });

    const exercise = await db.getExerciseById("ex-old");
    expect(exercise).not.toBeNull();
    expect(exercise!.deleted_at).toBe(1700000000);
    expect(exercise!.name).toBe("Old Bench Press");
    expect(exercise!.mount_position).toBeUndefined();
    expect(exercise!.is_voltra).toBeUndefined();
  });
});

describe("templates CRUD", () => {
  it("createTemplate inserts and returns template", async () => {
    await initDb();
    jest.spyOn(Date, "now").mockReturnValue(1000);
    const result = await db.createTemplate("Push Day");
    expect(result.id).toBe(MOCK_UUID);
    expect(result.name).toBe("Push Day");
    expect(result.created_at).toBe(1000);
    jest.restoreAllMocks();
  });

  it("getTemplates returns all templates", async () => {
    await initDb();
    const templates = [
      { id: "t1", name: "Push", created_at: 100, updated_at: 200, is_starter: 0 },
    ];
    mockDb.getAllAsync.mockResolvedValueOnce(templates);

    const result = await db.getTemplates();
    expect(result).toEqual([
      { id: "t1", name: "Push", created_at: 100, updated_at: 200, is_starter: false },
    ]);
  });

  it("deleteTemplate removes template and related data", async () => {
    await initDb();
    await db.deleteTemplate("t1");
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM template_exercises"),
      ["t1"]
    );
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE program_days SET template_id = NULL"),
      ["t1"]
    );
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM workout_templates"),
      ["t1"]
    );
  });
});

describe("sessions CRUD", () => {
  it("startSession creates a session", async () => {
    await initDb();
    jest.spyOn(Date, "now").mockReturnValue(5000);
    const result = await db.startSession("t1", "Push Day");
    expect(result.id).toBe(MOCK_UUID);
    expect(result.name).toBe("Push Day");
    expect(result.template_id).toBe("t1");
    expect(result.started_at).toBe(5000);
    expect(result.completed_at).toBeNull();
    jest.restoreAllMocks();
  });

  it("startSession with null template and programDayId", async () => {
    await initDb();
    const result = await db.startSession(null, "Quick Workout", "day1");
    expect(result.template_id).toBeNull();
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO workout_sessions"),
      expect.arrayContaining([null, "Quick Workout"])
    );
  });

  it("completeSession sets completed_at and duration", async () => {
    await initDb();
    jest.spyOn(Date, "now").mockReturnValue(10000);
    mockDb.getFirstAsync.mockResolvedValueOnce({ started_at: 5000 });

    await db.completeSession("s1", "Great workout");
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE workout_sessions SET completed_at"),
      [10000, 5, "Great workout", "s1"]
    );
    jest.restoreAllMocks();
  });

  it("cancelSession deletes sets and session", async () => {
    await initDb();
    await db.cancelSession("s1");
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM workout_sets"),
      ["s1"]
    );
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM workout_sessions"),
      ["s1"]
    );
  });

  it("getRecentSessions queries completed sessions", async () => {
    await initDb();
    const sessions = [{ id: "s1", name: "Push", started_at: 1000 }];
    mockDb.getAllAsync.mockResolvedValueOnce(sessions);

    const result = await db.getRecentSessions(10);
    expect(result).toEqual(sessions);
  });

  it("getSessionById returns session or null", async () => {
    await initDb();
    mockDb.getFirstAsync.mockResolvedValueOnce(null);

    const result = await db.getSessionById("nonexistent");
    expect(result).toBeNull();
  });
});

describe("sets CRUD", () => {
  it("addSet creates a new set", async () => {
    await initDb();
    const result = await db.addSet("s1", "ex1", 1);
    expect(result.id).toBe(MOCK_UUID);
    expect(result.session_id).toBe("s1");
    expect(result.exercise_id).toBe("ex1");
    expect(result.set_number).toBe(1);
    expect(result.weight).toBeNull();
    expect(result.reps).toBeNull();
    expect(result.completed).toBe(false);
  });

  it("addSet with link_id and round", async () => {
    await initDb();
    const result = await db.addSet("s1", "ex1", 2, "link1", 3);
    expect(result.link_id).toBe("link1");
    expect(result.round).toBe(3);
  });

  it("updateSet updates weight and reps", async () => {
    await initDb();
    await db.updateSet("set1", 100, 8);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE workout_sets SET weight"),
      [100, 8, "set1"]
    );
  });

  it("completeSet marks set completed", async () => {
    await initDb();
    jest.spyOn(Date, "now").mockReturnValue(9000);
    await db.completeSet("set1");
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("SET completed = 1"),
      [9000, "set1"]
    );
    jest.restoreAllMocks();
  });

  it("deleteSet removes the set", async () => {
    await initDb();
    await db.deleteSet("set1");
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM workout_sets"),
      ["set1"]
    );
  });

  it("updateSetRPE updates RPE value", async () => {
    await initDb();
    await db.updateSetRPE("set1", 8.5);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("SET rpe"),
      [8.5, "set1"]
    );
  });

  it("updateSetNotes updates notes", async () => {
    await initDb();
    await db.updateSetNotes("set1", "felt strong");
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("SET notes"),
      ["felt strong", "set1"]
    );
  });
});

describe("nutrition CRUD", () => {
  it("addFoodEntry creates food entry", async () => {
    await initDb();
    jest.spyOn(Date, "now").mockReturnValue(2000);
    const result = await db.addFoodEntry("Chicken", 165, 31, 0, 3.6, "100g", false);
    expect(result.id).toBe(MOCK_UUID);
    expect(result.name).toBe("Chicken");
    expect(result.calories).toBe(165);
    expect(result.protein).toBe(31);
    expect(result.is_favorite).toBe(false);
    jest.restoreAllMocks();
  });

  it("getFoodEntries returns mapped food entries", async () => {
    await initDb();
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: "f1", name: "Rice", calories: 130, protein: 2.7, carbs: 28, fat: 0.3, serving_size: "100g", is_favorite: 1, created_at: 100 },
    ]);

    const result = await db.getFoodEntries();
    expect(result).toHaveLength(1);
    expect(result[0].is_favorite).toBe(true);
  });

  it("toggleFavorite toggles the flag", async () => {
    await initDb();
    await db.toggleFavorite("f1");
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("is_favorite = CASE"),
      ["f1"]
    );
  });

  it("addDailyLog creates a log entry", async () => {
    await initDb();
    jest.spyOn(Date, "now").mockReturnValue(3000);
    const result = await db.addDailyLog("f1", "2024-01-15", "lunch", 1.5);
    expect(result.food_entry_id).toBe("f1");
    expect(result.date).toBe("2024-01-15");
    expect(result.meal).toBe("lunch");
    expect(result.servings).toBe(1.5);
    jest.restoreAllMocks();
  });

  it("deleteDailyLog removes the log", async () => {
    await initDb();
    await db.deleteDailyLog("log1");
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM daily_log"),
      ["log1"]
    );
  });

  it("getMacroTargets returns defaults when no row exists", async () => {
    await initDb();
    mockDb.getFirstAsync.mockResolvedValueOnce(null);

    jest.spyOn(Date, "now").mockReturnValue(4000);
    const result = await db.getMacroTargets();
    expect(result.calories).toBe(2000);
    expect(result.protein).toBe(150);
    expect(result.carbs).toBe(250);
    expect(result.fat).toBe(65);
    jest.restoreAllMocks();
  });

  it("getMacroTargets returns existing row", async () => {
    await initDb();
    const existing = { id: "mt1", calories: 1800, protein: 180, carbs: 200, fat: 60, updated_at: 100 };
    mockDb.getFirstAsync.mockResolvedValueOnce(existing);

    const result = await db.getMacroTargets();
    expect(result).toEqual(existing);
  });

  it("getDailySummary returns zero totals for empty day", async () => {
    await initDb();
    mockDb.getFirstAsync.mockResolvedValueOnce({ calories: null, protein: null, carbs: null, fat: null });

    const result = await db.getDailySummary("2024-01-15");
    expect(result).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it("getDailySummary returns computed totals", async () => {
    await initDb();
    mockDb.getFirstAsync.mockResolvedValueOnce({ calories: 500, protein: 40, carbs: 60, fat: 15 });

    const result = await db.getDailySummary("2024-01-15");
    expect(result).toEqual({ calories: 500, protein: 40, carbs: 60, fat: 15 });
  });
});

describe("body tracking CRUD", () => {
  it("getBodySettings returns defaults when no row exists", async () => {
    await initDb();
    mockDb.getFirstAsync.mockResolvedValueOnce(null);

    jest.spyOn(Date, "now").mockReturnValue(6000);
    const result = await db.getBodySettings();
    expect(result.weight_unit).toBe("kg");
    expect(result.measurement_unit).toBe("cm");
    expect(result.weight_goal).toBeNull();
    jest.restoreAllMocks();
  });

  it("updateBodySettings updates all fields", async () => {
    await initDb();
    mockDb.getFirstAsync.mockResolvedValueOnce({ id: "default", weight_unit: "kg", measurement_unit: "cm", weight_goal: null, body_fat_goal: null, updated_at: 100 });

    await db.updateBodySettings("lb", "in", 180, 15);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE body_settings"),
      expect.arrayContaining(["lb", "in", 180, 15])
    );
  });

  it("upsertBodyWeight inserts with ON CONFLICT", async () => {
    await initDb();
    const row = { id: "bw1", weight: 80, date: "2024-01-15", notes: "morning", logged_at: 100 };
    mockDb.getFirstAsync.mockResolvedValueOnce(row);

    const result = await db.upsertBodyWeight(80, "2024-01-15", "morning");
    expect(result.weight).toBe(80);
    expect(result.date).toBe("2024-01-15");
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT(date)"),
      expect.any(Array)
    );
  });

  it("getBodyWeightEntries queries with limit and offset", async () => {
    await initDb();
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: "bw1", weight: 80, date: "2024-01-15", notes: "", logged_at: 100 },
    ]);

    const result = await db.getBodyWeightEntries(10, 0);
    expect(result).toHaveLength(1);
  });

  it("deleteBodyWeight removes the entry", async () => {
    await initDb();
    await db.deleteBodyWeight("bw1");
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM body_weight"),
      ["bw1"]
    );
  });

  it("getLatestBodyWeight returns most recent", async () => {
    await initDb();
    const row = { id: "bw1", weight: 82, date: "2024-01-20", notes: "", logged_at: 200 };
    mockDb.getFirstAsync.mockResolvedValueOnce(row);

    const result = await db.getLatestBodyWeight();
    expect(result).toEqual(row);
  });

  it("upsertBodyMeasurements inserts with ON CONFLICT", async () => {
    await initDb();
    const vals = {
      waist: 80, chest: 100, hips: 95,
      left_arm: 35, right_arm: 35.5,
      left_thigh: 55, right_thigh: 55,
      left_calf: 38, right_calf: 38,
      neck: 40, body_fat: 15,
      notes: "post-cut",
    };
    const row = { id: "bm1", date: "2024-01-15", ...vals, logged_at: 100 };
    mockDb.getFirstAsync.mockResolvedValueOnce(row);

    const result = await db.upsertBodyMeasurements("2024-01-15", vals);
    expect(result.waist).toBe(80);
    expect(result.body_fat).toBe(15);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT(date)"),
      expect.any(Array)
    );
  });

  it("getLatestMeasurements returns most recent", async () => {
    await initDb();
    mockDb.getFirstAsync.mockResolvedValueOnce(null);

    const result = await db.getLatestMeasurements();
    expect(result).toBeNull();
  });

  it("deleteBodyMeasurements removes the entry", async () => {
    await initDb();
    await db.deleteBodyMeasurements("bm1");
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM body_measurements"),
      ["bm1"]
    );
  });
});

describe("data validation edge cases", () => {
  it("addSet defaults to null weight, reps, and false completed", async () => {
    await initDb();
    const result = await db.addSet("s1", "ex1", 1);
    expect(result.weight).toBeNull();
    expect(result.reps).toBeNull();
    expect(result.completed).toBe(false);
    expect(result.rpe).toBeNull();
    expect(result.notes).toBe("");
    expect(result.link_id).toBeNull();
    expect(result.round).toBeNull();
  });

  it("addFoodEntry handles zero-calorie food", async () => {
    await initDb();
    jest.spyOn(Date, "now").mockReturnValue(1000);
    const result = await db.addFoodEntry("Water", 0, 0, 0, 0, "1 cup", false);
    expect(result.calories).toBe(0);
    expect(result.protein).toBe(0);
    jest.restoreAllMocks();
  });

  it("startSession with empty name is allowed", async () => {
    await initDb();
    const result = await db.startSession(null, "");
    expect(result.name).toBe("");
  });

  it("completeSession with no notes defaults to empty string", async () => {
    await initDb();
    mockDb.getFirstAsync.mockResolvedValueOnce({ started_at: 1000 });

    await db.completeSession("s1");
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE workout_sessions"),
      expect.arrayContaining(["", "s1"])
    );
  });
});
