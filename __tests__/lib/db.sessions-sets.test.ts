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
    // BLD-1094: cancelSession cascades strava_sync_log (Drizzle) before deleting
    // workout_sets and the session row. So 3 Drizzle deletes per target session
    // (strava + sets + session).
    expect(mockDrizzleDb.delete).toHaveBeenCalledTimes(3);
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
  it("addSet creates a new set, with optional link_id and round", async () => {
    await ctx.initDb();
    const result = await ctx.db.addSet("s1", "ex1", 1);
    expect(result.id).toBe(MOCK_UUID);
    expect(result.session_id).toBe("s1");
    expect(result.exercise_id).toBe("ex1");
    expect(result.set_number).toBe(1);
    expect(result.weight).toBeNull();
    expect(result.reps).toBeNull();
    expect(result.completed).toBe(false);

    const linked = await ctx.db.addSet("s1", "ex1", 2, "link1", 3);
    expect(linked.link_id).toBe("link1");
    expect(linked.round).toBe(3);
  });

  // BLD-630 note: completeSet must also fire the session-anchor UPDATE.
  it.each([
    { name: "updateSet", run: () => ctx.db.updateSet("set1", 100, 8), expectMethod: "update" as const },
    { name: "completeSet (also fires session-anchor run)", run: () => ctx.db.completeSet("set1"), expectMethod: "update" as const, alsoRun: true },
    { name: "updateSetRPE", run: () => ctx.db.updateSetRPE("set1", 8.5), expectMethod: "update" as const },
    { name: "updateSetNotes", run: () => ctx.db.updateSetNotes("set1", "felt strong"), expectMethod: "update" as const },
  ])("$name fires the expected Drizzle call", async ({ run, expectMethod, alsoRun }) => {
    await ctx.initDb();
    if (alsoRun) jest.spyOn(Date, "now").mockReturnValue(9000);
    await run();
    expect(mockDrizzleDb[expectMethod]).toHaveBeenCalled();
    if (alsoRun) {
      expect(mockDrizzleDb.run).toHaveBeenCalled();
      jest.restoreAllMocks();
    }
  });

  // BLD-1044: deleteSet now uses raw SQL via withTransaction (not Drizzle delete).
  it("deleteSet fires a raw SQL DELETE inside a transaction", async () => {
    await ctx.initDb();
    await ctx.db.deleteSet("set1");
    expect(mockDb.withTransactionAsync).toHaveBeenCalled();
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^DELETE FROM workout_sets/i),
      expect.arrayContaining(["set1"])
    );
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

// BLD-1126 AC5: updateSetManualWeight must clear all four stack_* columns
// in the same UPDATE as weight + reps (single-write atomicity).
describe("updateSetManualWeight — AC5 stack column clearance", () => {
  it("clears stack_marker, stack_id, stack_name_at_log, stack_unit_at_log in one UPDATE", async () => {
    await ctx.initDb();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { updateSetManualWeight } = require("../../lib/db/session-sets");
    await updateSetManualWeight("set1", { weight: 40, reps: 8 });

    // Verify drizzle's update().set() was called with null stack columns
    const setMock = mockDrizzleDb.update.mock.results.at(-1)?.value.set;
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        weight: 40,
        reps: 8,
        stack_id: null,
        stack_marker: null,
        stack_name_at_log: null,
        stack_unit_at_log: null,
      })
    );
  });
});

// BLD-1126 reviewer blocker (round 2): marker-autofill + reps-carry coexistence.
// updateSetRepsAndDuration writes reps + optional duration WITHOUT touching
// weight or stack columns, enabling the add-set prefill chain (BLD-655/BLD-682)
// to carry reps even when marker autofill has already resolved the weight.
describe("updateSetRepsAndDuration — reps-only write (no weight / stack column touch)", () => {
  it("calls update().set() with reps but NOT weight or stack columns", async () => {
    await ctx.initDb();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { updateSetRepsAndDuration } = require("../../lib/db/session-sets");
    await updateSetRepsAndDuration("set1", 8, undefined);

    const setMock = mockDrizzleDb.update.mock.results.at(-1)?.value.set;
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ reps: 8 })
    );
    // weight and stack columns must NOT be present — they belong to the
    // marker-autofill write that already ran.
    const setCallArg = setMock.mock.calls.at(-1)?.[0];
    expect(setCallArg).not.toHaveProperty("weight");
    expect(setCallArg).not.toHaveProperty("stack_marker");
    expect(setCallArg).not.toHaveProperty("stack_id");
  });

  it("includes duration_seconds when isDuration=true", async () => {
    await ctx.initDb();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { updateSetRepsAndDuration } = require("../../lib/db/session-sets");
    await updateSetRepsAndDuration("set1", null, 30);

    const setMock = mockDrizzleDb.update.mock.results.at(-1)?.value.set;
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ reps: null, duration_seconds: 30 })
    );
  });
});
