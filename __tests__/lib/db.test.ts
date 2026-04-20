/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines */
const MOCK_UUID = "test-uuid-1234";
jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "test-uuid-1234"),
}));

// ---- Mock Drizzle ORM ----
// Instead of trying to mock the low-level SQLite sync API that Drizzle uses internally,
// we mock drizzle-orm/expo-sqlite so that `drizzle()` returns a controllable fake ORM.

let drizzleQueryResult: any = [];
let drizzleGetResult: any = undefined;

function resetDrizzleResults() {
  drizzleQueryResult = [];
  drizzleGetResult = undefined;
}

// Chainable query builder mock
function createChainableSelect() {
  const chain: any = {
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    get: jest.fn(() => drizzleGetResult),
    then: undefined as any,
  };
  // Make it thenable so `await db.select()...` resolves to drizzleQueryResult
  chain.then = (resolve: any, reject: any) => Promise.resolve(drizzleQueryResult).then(resolve, reject);
  return chain;
}

function createChainableInsert() {
  const chain: any = {
    values: jest.fn().mockReturnThis(),
    then: (resolve: any, reject: any) => Promise.resolve().then(resolve, reject),
  };
  return chain;
}

function createChainableUpdate() {
  const chain: any = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    then: (resolve: any, reject: any) => Promise.resolve().then(resolve, reject),
  };
  return chain;
}

function createChainableDelete() {
  const chain: any = {
    where: jest.fn().mockReturnThis(),
    then: (resolve: any, reject: any) => Promise.resolve().then(resolve, reject),
  };
  return chain;
}

const mockDrizzleDb = {
  select: jest.fn(() => createChainableSelect()),
  insert: jest.fn(() => createChainableInsert()),
  update: jest.fn(() => createChainableUpdate()),
  delete: jest.fn(() => createChainableDelete()),
};

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => mockDrizzleDb),
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
  prepareSync: jest.fn(() => ({})),
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
  resetDrizzleResults();
}

/** Set up the mock so the next Drizzle select().from()...get() returns this value */
function mockDrizzleGet(value: any) {
  drizzleGetResult = value;
}

/** Set up the mock so the next Drizzle select().from()... (awaited as array) returns this value */
function mockDrizzleAll(value: any[]) {
  drizzleQueryResult = value;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetDrizzleResults();
  mockDb.execAsync.mockResolvedValue(undefined);
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.getFirstAsync.mockResolvedValue({ count: 10 });
  mockDb.runAsync.mockResolvedValue({ changes: 1 });

  // Clear globalThis singleton so each test starts fresh
  const g = globalThis as any;
  delete g.__cablesnap_db;
  delete g.__cablesnap_drizzle;
  delete g.__cablesnap_init;
  delete g.__cablesnap_memfb;

  // Reset the cached db module to clear singleton
  jest.resetModules();
  jest.doMock("expo-sqlite", () => ({
    openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
  }));
  jest.doMock("drizzle-orm/expo-sqlite", () => ({
    drizzle: jest.fn(() => mockDrizzleDb),
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
    jest.doMock("drizzle-orm/expo-sqlite", () => ({
      drizzle: jest.fn(() => mockDrizzleDb),
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
    expect(failOnce).toHaveBeenNthCalledWith(1, "cablesnap.db");
    expect(failOnce).toHaveBeenNthCalledWith(2, ":memory:");
    expect(dbMod.isMemoryFallback()).toBe(true);
  });

  it("throws on non-web platform when open fails", async () => {
    jest.resetModules();

    const fail = jest.fn().mockRejectedValue(new Error("native crash"));

    jest.doMock("expo-sqlite", () => ({
      openDatabaseAsync: fail,
    }));
    jest.doMock("drizzle-orm/expo-sqlite", () => ({
      drizzle: jest.fn(() => mockDrizzleDb),
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
    mockDrizzleGet(null);

    const result = await db.getExerciseById("nonexistent");
    expect(result).toBeNull();
  });

  it("getExerciseById returns mapped exercise", async () => {
    await initDb();
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
    expect(mockDrizzleDb.insert).toHaveBeenCalled();
  });

  it("softDeleteCustomExercise removes from templates and soft-deletes", async () => {
    await initDb();
    await db.softDeleteCustomExercise("ex1");
    expect(mockDb.withTransactionAsync).toHaveBeenCalled();
    // Now uses Drizzle delete + update inside the transaction
    expect(mockDrizzleDb.delete).toHaveBeenCalled();
    expect(mockDrizzleDb.update).toHaveBeenCalled();
  });

  it("getExerciseById returns soft-deleted exercise for historical lookup", async () => {
    await initDb();
    mockDrizzleGet({
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
    // getTemplates now uses Drizzle select().from().orderBy()
    drizzleQueryResult = [
      { id: "t1", name: "Push", created_at: 100, updated_at: 200, is_starter: 0 },
    ];

    const result = await db.getTemplates();
    expect(result).toEqual([
      { id: "t1", name: "Push", created_at: 100, updated_at: 200, is_starter: false },
    ]);
    resetDrizzleResults();
  });

  it("deleteTemplate removes template and related data", async () => {
    await initDb();
    // deleteTemplate now uses Drizzle select().get() to check is_starter
    drizzleGetResult = { is_starter: 0 };
    await db.deleteTemplate("t1");
    // Drizzle delete/update calls go through mockDrizzleDb
    expect(mockDrizzleDb.delete).toHaveBeenCalled();
    expect(mockDrizzleDb.update).toHaveBeenCalled();
    resetDrizzleResults();
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
    expect(mockDrizzleDb.insert).toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it("startSession with null template and programDayId", async () => {
    await initDb();
    const result = await db.startSession(null, "Quick Workout", "day1");
    expect(result.template_id).toBeNull();
    expect(mockDrizzleDb.insert).toHaveBeenCalled();
  });

  it("completeSession sets completed_at and duration", async () => {
    await initDb();
    jest.spyOn(Date, "now").mockReturnValue(10000);
    // completeSession: Drizzle .get() for started_at, then Drizzle .update()
    mockDrizzleGet({ started_at: 5000 });

    await db.completeSession("s1", "Great workout");
    expect(mockDrizzleDb.select).toHaveBeenCalled();
    expect(mockDrizzleDb.update).toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it("cancelSession deletes sets and session", async () => {
    await initDb();
    await db.cancelSession("s1");
    // Drizzle delete called twice (sets + session)
    expect(mockDrizzleDb.delete).toHaveBeenCalledTimes(2);
  });

  it("getRecentSessions queries completed sessions", async () => {
    await initDb();
    const sessions = [{ id: "s1", name: "Push", started_at: 1000 }];
    mockDrizzleAll(sessions);

    const result = await db.getRecentSessions(10);
    expect(result).toEqual(sessions);
  });

  it("getSessionById returns session or null", async () => {
    await initDb();
    mockDrizzleGet(null);

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
    expect(mockDrizzleDb.update).toHaveBeenCalled();
  });

  it("completeSet marks set completed", async () => {
    await initDb();
    jest.spyOn(Date, "now").mockReturnValue(9000);
    await db.completeSet("set1");
    expect(mockDrizzleDb.update).toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it("deleteSet removes the set", async () => {
    await initDb();
    await db.deleteSet("set1");
    expect(mockDrizzleDb.delete).toHaveBeenCalled();
  });

  it("updateSetRPE updates RPE value", async () => {
    await initDb();
    await db.updateSetRPE("set1", 8.5);
    expect(mockDrizzleDb.update).toHaveBeenCalled();
  });

  it("updateSetNotes updates notes", async () => {
    await initDb();
    await db.updateSetNotes("set1", "felt strong");
    expect(mockDrizzleDb.update).toHaveBeenCalled();
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
    mockDrizzleAll([
      { id: "f1", name: "Rice", calories: 130, protein: 2.7, carbs: 28, fat: 0.3, serving_size: "100g", is_favorite: 1, created_at: 100 },
    ]);

    const result = await db.getFoodEntries();
    expect(result).toHaveLength(1);
    expect(result[0].is_favorite).toBe(true);
  });

  it("toggleFavorite toggles the flag", async () => {
    await initDb();
    await db.toggleFavorite("f1");
    expect(mockDrizzleDb.update).toHaveBeenCalled();
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
    expect(mockDrizzleDb.delete).toHaveBeenCalled();
  });

  it("getMacroTargets returns defaults when no row exists", async () => {
    await initDb();
    mockDrizzleGet(null);

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
    mockDrizzleGet(existing);

    const result = await db.getMacroTargets();
    expect(result).toEqual(existing);
  });

  it("getDailySummary returns zero totals for empty day", async () => {
    await initDb();
    // getDailySummary now uses Drizzle with .get()
    mockDrizzleGet({ calories: null, protein: null, carbs: null, fat: null });

    const result = await db.getDailySummary("2024-01-15");
    expect(result).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it("getDailySummary returns computed totals", async () => {
    await initDb();
    mockDrizzleGet({ calories: 500, protein: 40, carbs: 60, fat: 15 });

    const result = await db.getDailySummary("2024-01-15");
    expect(result).toEqual({ calories: 500, protein: 40, carbs: 60, fat: 15 });
  });
});

describe("body tracking CRUD", () => {
  it("getBodySettings returns defaults when no row exists", async () => {
    await initDb();
    mockDrizzleGet(null);

    jest.spyOn(Date, "now").mockReturnValue(6000);
    const result = await db.getBodySettings();
    expect(result.weight_unit).toBe("kg");
    expect(result.measurement_unit).toBe("cm");
    expect(result.weight_goal).toBeNull();
    jest.restoreAllMocks();
  });

  it("updateBodySettings updates all fields", async () => {
    await initDb();
    // getBodySettings (Drizzle .get()) then updateBodySettings (Drizzle .update())
    mockDrizzleGet({ id: "default", weight_unit: "kg", measurement_unit: "cm", weight_goal: null, body_fat_goal: null, updated_at: 100 });

    await db.updateBodySettings("lb", "in", 180, 15);
    expect(mockDrizzleDb.update).toHaveBeenCalled();
  });

  it("upsertBodyWeight inserts with ON CONFLICT", async () => {
    await initDb();
    const row = { id: "bw1", weight: 80, date: "2024-01-15", notes: "morning", logged_at: 100 };
    // upsertBodyWeight: Drizzle insert().values().onConflictDoUpdate(), then Drizzle .get()
    mockDrizzleGet(row);

    // Need to add onConflictDoUpdate to the insert chain
    const insertChain: any = {
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockReturnThis(),
      then: (r: any) => Promise.resolve().then(r),
    };
    mockDrizzleDb.insert.mockReturnValueOnce(insertChain);

    const result = await db.upsertBodyWeight(80, "2024-01-15", "morning");
    expect(result.weight).toBe(80);
    expect(result.date).toBe("2024-01-15");
    expect(mockDrizzleDb.insert).toHaveBeenCalled();
  });

  it("getBodyWeightEntries queries with limit and offset", async () => {
    await initDb();
    mockDrizzleAll([
      { id: "bw1", weight: 80, date: "2024-01-15", notes: "", logged_at: 100 },
    ]);

    const result = await db.getBodyWeightEntries(10, 0);
    expect(result).toHaveLength(1);
  });

  it("deleteBodyWeight removes the entry", async () => {
    await initDb();
    await db.deleteBodyWeight("bw1");
    expect(mockDrizzleDb.delete).toHaveBeenCalled();
  });

  it("getLatestBodyWeight returns most recent", async () => {
    await initDb();
    const row = { id: "bw1", weight: 82, date: "2024-01-20", notes: "", logged_at: 200 };
    mockDrizzleGet(row);

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
    // upsertBodyMeasurements: Drizzle insert().values().onConflictDoUpdate(), then Drizzle .get()
    mockDrizzleGet(row);

    const insertChain: any = {
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockReturnThis(),
      then: (r: any) => Promise.resolve().then(r),
    };
    mockDrizzleDb.insert.mockReturnValueOnce(insertChain);

    const result = await db.upsertBodyMeasurements("2024-01-15", vals);
    expect(result.waist).toBe(80);
    expect(result.body_fat).toBe(15);
    expect(mockDrizzleDb.insert).toHaveBeenCalled();
  });

  it("getLatestMeasurements returns most recent", async () => {
    await initDb();
    mockDrizzleGet(null);

    const result = await db.getLatestMeasurements();
    expect(result).toBeNull();
  });

  it("deleteBodyMeasurements removes the entry", async () => {
    await initDb();
    await db.deleteBodyMeasurements("bm1");
    expect(mockDrizzleDb.delete).toHaveBeenCalled();
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
    mockDrizzleGet({ started_at: 1000 });

    await db.completeSession("s1");
    expect(mockDrizzleDb.update).toHaveBeenCalled();
  });
});
