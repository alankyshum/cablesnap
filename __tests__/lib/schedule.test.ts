// Mock crypto.randomUUID
const MOCK_UUID = "sched-uuid-1234";
Object.defineProperty(global, "crypto", {
  value: { randomUUID: jest.fn(() => MOCK_UUID) },
});

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

let db: typeof import("../../lib/db");

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

  jest.resetModules();
  jest.doMock("expo-sqlite", () => ({
    openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
  }));
  jest.doMock("../../lib/seed", () => ({
    seedExercises: jest.fn(() => []),
  }));
  db = require("../../lib/db");
});

describe("getSchedule", () => {
  it("returns all schedule entries joined with templates", async () => {
    await initDb();
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: "s1", day_of_week: 0, template_id: "t1", template_name: "Push", exercise_count: 5, created_at: 1000 },
      { id: "s2", day_of_week: 2, template_id: "t2", template_name: "Pull", exercise_count: 4, created_at: 1001 },
    ]);

    const result = await db.getSchedule();
    expect(result).toHaveLength(2);
    expect(result[0].template_name).toBe("Push");
    expect(result[1].day_of_week).toBe(2);
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("weekly_schedule")
    );
  });

  it("returns empty array when no schedule exists", async () => {
    await initDb();
    mockDb.getAllAsync.mockResolvedValueOnce([]);

    const result = await db.getSchedule();
    expect(result).toHaveLength(0);
  });
});

describe("setScheduleDay", () => {
  it("inserts a schedule entry for a day", async () => {
    await initDb();
    jest.spyOn(Date, "now").mockReturnValue(5000);

    await db.setScheduleDay(0, "t1");
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT OR REPLACE INTO weekly_schedule"),
      [MOCK_UUID, 0, "t1", 5000]
    );
    jest.restoreAllMocks();
  });

  it("deletes schedule entry when templateId is null", async () => {
    await initDb();

    await db.setScheduleDay(3, null);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM weekly_schedule WHERE day_of_week"),
      [3]
    );
  });
});

describe("clearSchedule", () => {
  it("deletes all schedule entries", async () => {
    await initDb();

    await db.clearSchedule();
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      "DELETE FROM weekly_schedule"
    );
  });
});

describe("getTodaySchedule", () => {
  it("returns today's schedule entry when one exists", async () => {
    await initDb();
    const entry = {
      id: "s1",
      day_of_week: 0,
      template_id: "t1",
      template_name: "Push",
      exercise_count: 5,
      created_at: 1000,
    };
    mockDb.getFirstAsync.mockResolvedValueOnce(entry);

    const result = await db.getTodaySchedule();
    expect(result).toEqual(entry);
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining("weekly_schedule"),
      expect.arrayContaining([expect.any(Number)])
    );
  });

  it("returns null when no schedule entry for today", async () => {
    await initDb();
    mockDb.getFirstAsync.mockResolvedValueOnce(null);

    const result = await db.getTodaySchedule();
    expect(result).toBeNull();
  });
});

describe("isTodayCompleted", () => {
  it("returns true when a session was completed today", async () => {
    await initDb();
    mockDb.getFirstAsync.mockResolvedValueOnce({ count: 1 });

    const result = await db.isTodayCompleted();
    expect(result).toBe(true);
  });

  it("returns false when no session was completed today", async () => {
    await initDb();
    mockDb.getFirstAsync.mockResolvedValueOnce({ count: 0 });

    const result = await db.isTodayCompleted();
    expect(result).toBe(false);
  });

  it("returns false when query returns null", async () => {
    await initDb();
    mockDb.getFirstAsync.mockResolvedValueOnce(null);

    const result = await db.isTodayCompleted();
    expect(result).toBe(false);
  });
});

describe("getWeekAdherence", () => {
  it("returns 7 days with schedule and completion status", async () => {
    await initDb();
    // First call: scheduled days
    mockDb.getAllAsync
      .mockResolvedValueOnce([{ day_of_week: 0 }, { day_of_week: 2 }, { day_of_week: 4 }])
      // Second call: completed sessions this week
      .mockResolvedValueOnce([
        { started_at: mondayTimestamp() },
        { started_at: mondayTimestamp() + 2 * 24 * 60 * 60 * 1000 },
      ]);

    const result = await db.getWeekAdherence();
    expect(result).toHaveLength(7);
    // Mon (0): scheduled + completed
    expect(result[0]).toEqual({ day: 0, scheduled: true, completed: true });
    // Tue (1): not scheduled, not completed
    expect(result[1]).toEqual({ day: 1, scheduled: false, completed: false });
    // Wed (2): scheduled + completed
    expect(result[2]).toEqual({ day: 2, scheduled: true, completed: true });
    // Fri (4): scheduled but not completed
    expect(result[4]).toEqual({ day: 4, scheduled: true, completed: false });
  });

  it("returns all unscheduled when no schedule exists", async () => {
    await initDb();
    mockDb.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await db.getWeekAdherence();
    expect(result).toHaveLength(7);
    expect(result.every((d) => !d.scheduled && !d.completed)).toBe(true);
  });
});

describe("deleteTemplate cascade", () => {
  it("deletes schedule entries before deleting template", async () => {
    await initDb();
    mockDb.getFirstAsync.mockResolvedValueOnce({ is_starter: 0 });

    await db.deleteTemplate("t1");

    // Verify the order of runAsync calls
    expect(mockDb.runAsync).toHaveBeenCalledTimes(4);
    // First call: delete from weekly_schedule
    expect(mockDb.runAsync.mock.calls[0][0]).toContain("DELETE FROM weekly_schedule WHERE template_id");
    // Second call: delete template_exercises
    expect(mockDb.runAsync.mock.calls[1][0]).toContain("DELETE FROM template_exercises");
    // Third call: update program_days
    expect(mockDb.runAsync.mock.calls[2][0]).toContain("UPDATE program_days");
    // Fourth call: delete from workout_templates
    expect(mockDb.runAsync.mock.calls[3][0]).toContain("DELETE FROM workout_templates");
  });

  it("skips deletion for starter templates", async () => {
    await initDb();
    mockDb.getFirstAsync.mockResolvedValueOnce({ is_starter: 1 });

    await db.deleteTemplate("t1");
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });
});

// Helper: get timestamp for current week's Monday
function mondayTimestamp(): number {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d.getTime();
}
