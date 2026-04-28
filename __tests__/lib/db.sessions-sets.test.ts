/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BLD-817: split from db.test.ts for worker parallelism.
 * Covers sessions CRUD + sets CRUD + data validation edge cases.
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

describe("sessions CRUD", () => {
  it("startSession creates a session", async () => {
    await ctx.initDb();
    jest.spyOn(Date, "now").mockReturnValue(5000);
    const result = await ctx.db.startSession("t1", "Push Day");
    expect(result.id).toBe(MOCK_UUID);
    expect(result.name).toBe("Push Day");
    expect(result.template_id).toBe("t1");
    expect(result.started_at).toBe(5000);
    expect(result.completed_at).toBeNull();
    expect(mockDrizzleDb.insert).toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it("startSession with null template and programDayId", async () => {
    await ctx.initDb();
    const result = await ctx.db.startSession(null, "Quick Workout", "day1");
    expect(result.template_id).toBeNull();
    expect(mockDrizzleDb.insert).toHaveBeenCalled();
  });

  it("completeSession sets completed_at and duration", async () => {
    await ctx.initDb();
    jest.spyOn(Date, "now").mockReturnValue(10000);
    mockDrizzleGet({ started_at: 5000 });

    await ctx.db.completeSession("s1", "Great workout");
    expect(mockDrizzleDb.select).toHaveBeenCalled();
    expect(mockDrizzleDb.update).toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it("cancelSession deletes sets and session", async () => {
    await ctx.initDb();
    await ctx.db.cancelSession("s1");
    expect(mockDrizzleDb.delete).toHaveBeenCalledTimes(2);
  });

  it("getRecentSessions queries completed sessions", async () => {
    await ctx.initDb();
    const sessions = [{ id: "s1", name: "Push", started_at: 1000 }];
    mockDrizzleAll(sessions);

    const result = await ctx.db.getRecentSessions(10);
    expect(result).toEqual(sessions);
  });

  it("getSessionById returns session or null", async () => {
    await ctx.initDb();
    mockDrizzleGet(null);

    const result = await ctx.db.getSessionById("nonexistent");
    expect(result).toBeNull();
  });
});

describe("sets CRUD", () => {
  it("addSet creates a new set", async () => {
    await ctx.initDb();
    const result = await ctx.db.addSet("s1", "ex1", 1);
    expect(result.id).toBe(MOCK_UUID);
    expect(result.session_id).toBe("s1");
    expect(result.exercise_id).toBe("ex1");
    expect(result.set_number).toBe(1);
    expect(result.weight).toBeNull();
    expect(result.reps).toBeNull();
    expect(result.completed).toBe(false);
  });

  it("addSet with link_id and round", async () => {
    await ctx.initDb();
    const result = await ctx.db.addSet("s1", "ex1", 2, "link1", 3);
    expect(result.link_id).toBe("link1");
    expect(result.round).toBe(3);
  });

  it("updateSet updates weight and reps", async () => {
    await ctx.initDb();
    await ctx.db.updateSet("set1", 100, 8);
    expect(mockDrizzleDb.update).toHaveBeenCalled();
  });

  it("completeSet marks set completed", async () => {
    await ctx.initDb();
    jest.spyOn(Date, "now").mockReturnValue(9000);
    await ctx.db.completeSet("set1");
    expect(mockDrizzleDb.update).toHaveBeenCalled();
    // BLD-630: completeSet must also fire the session-anchor UPDATE so the
    // elapsed clock starts on first set completion.
    expect(mockDrizzleDb.run).toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it("deleteSet removes the set", async () => {
    await ctx.initDb();
    await ctx.db.deleteSet("set1");
    expect(mockDrizzleDb.delete).toHaveBeenCalled();
  });

  it("updateSetRPE updates RPE value", async () => {
    await ctx.initDb();
    await ctx.db.updateSetRPE("set1", 8.5);
    expect(mockDrizzleDb.update).toHaveBeenCalled();
  });

  it("updateSetNotes updates notes", async () => {
    await ctx.initDb();
    await ctx.db.updateSetNotes("set1", "felt strong");
    expect(mockDrizzleDb.update).toHaveBeenCalled();
  });
});

describe("data validation edge cases", () => {
  it("addSet defaults to null weight, reps, and false completed", async () => {
    await ctx.initDb();
    const result = await ctx.db.addSet("s1", "ex1", 1);
    expect(result.weight).toBeNull();
    expect(result.reps).toBeNull();
    expect(result.completed).toBe(false);
    expect(result.rpe).toBeNull();
    expect(result.notes).toBe("");
    expect(result.link_id).toBeNull();
    expect(result.round).toBeNull();
  });

  it("addFoodEntry handles zero-calorie food", async () => {
    await ctx.initDb();
    jest.spyOn(Date, "now").mockReturnValue(1000);
    const result = await ctx.db.addFoodEntry("Water", 0, 0, 0, 0, "1 cup", false);
    expect(result.calories).toBe(0);
    expect(result.protein).toBe(0);
    jest.restoreAllMocks();
  });

  it("startSession with empty name is allowed", async () => {
    await ctx.initDb();
    const result = await ctx.db.startSession(null, "");
    expect(result.name).toBe("");
  });

  it("completeSession with no notes defaults to empty string", async () => {
    await ctx.initDb();
    mockDrizzleGet({ started_at: 1000 });

    await ctx.db.completeSession("s1");
    expect(mockDrizzleDb.update).toHaveBeenCalled();
  });
});
