/* eslint-disable @typescript-eslint/no-explicit-any */
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

let mockDrizzleGetResult: any = undefined;
let mockDrizzleQueryResult: any = [];
let mockDrizzleQueryResults: any[] = [];
let mockDrizzleQueryCallCount = 0;

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => ({
    select: jest.fn(() => {
      const chain: any = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        get: jest.fn(() => mockDrizzleGetResult),
        then: undefined as any,
      };
      chain.then = (r: any, rj: any) => {
        const result = mockDrizzleQueryResults.length > 0
          ? mockDrizzleQueryResults[mockDrizzleQueryCallCount++] ?? []
          : mockDrizzleQueryResult;
        return Promise.resolve(result).then(r, rj);
      };
      return chain;
    }),
    insert: jest.fn(() => { const c: any = { values: jest.fn().mockReturnThis(), onConflictDoUpdate: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
    update: jest.fn(() => { const c: any = { set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
    delete: jest.fn(() => { const c: any = { where: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
  })),
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
  mockDrizzleGetResult = undefined;
  mockDrizzleQueryResult = [];
  mockDrizzleQueryResults = [];
  mockDrizzleQueryCallCount = 0;
  mockDb.execAsync.mockResolvedValue(undefined);
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.getFirstAsync.mockResolvedValue({ count: 10 });
  mockDb.runAsync.mockResolvedValue({ changes: 1 });

  // Clear globalThis singleton so each test starts fresh
  const g = globalThis as any;
  delete g.__fitforge_db;
  delete g.__fitforge_drizzle;
  delete g.__fitforge_init;
  delete g.__fitforge_memfb;

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
  it("returns all schedule entries from program_schedule joined with templates", async () => {
    await initDb();
    mockDrizzleQueryResult = [
      { id: "p1", day_of_week: 0, template_id: "t1", template_name: "Push", exercise_count: 5, created_at: 0 },
      { id: "p1", day_of_week: 2, template_id: "t2", template_name: "Pull", exercise_count: 4, created_at: 0 },
    ];

    const result = await db.getSchedule();
    expect(result).toHaveLength(2);
    expect(result[0].template_name).toBe("Push");
    expect(result[1].day_of_week).toBe(2);
  });

  it("returns empty array when no schedule exists", async () => {
    await initDb();
    mockDrizzleQueryResult = [];

    const result = await db.getSchedule();
    expect(result).toHaveLength(0);
  });
});

describe("getTodaySchedule", () => {
  it("returns today's schedule entry when one exists", async () => {
    await initDb();
    const entry = {
      id: "p1",
      day_of_week: 0,
      template_id: "t1",
      template_name: "Push",
      exercise_count: 5,
      created_at: 0,
    };
    mockDrizzleGetResult = entry;

    const result = await db.getTodaySchedule();
    expect(result).toEqual(entry);
  });

  it("returns null when no schedule entry for today", async () => {
    await initDb();
    mockDrizzleGetResult = undefined;

    const result = await db.getTodaySchedule();
    expect(result).toBeNull();
  });
});

describe("isTodayCompleted", () => {
  it("returns true when a session was completed today", async () => {
    await initDb();
    mockDrizzleGetResult = { count: 1 };

    const result = await db.isTodayCompleted();
    expect(result).toBe(true);
  });

  it("returns false when no session was completed today", async () => {
    await initDb();
    mockDrizzleGetResult = { count: 0 };

    const result = await db.isTodayCompleted();
    expect(result).toBe(false);
  });

  it("returns false when query returns null", async () => {
    await initDb();
    mockDrizzleGetResult = null;

    const result = await db.isTodayCompleted();
    expect(result).toBe(false);
  });
});

describe("getWeekAdherence", () => {
  it("returns 7 days with schedule and completion status", async () => {
    await initDb();
    mockDrizzleQueryResults = [
      [{ day_of_week: 0 }, { day_of_week: 2 }, { day_of_week: 4 }],
      [
        { started_at: mondayTimestamp() },
        { started_at: mondayTimestamp() + 2 * 24 * 60 * 60 * 1000 },
      ],
    ];
    mockDrizzleQueryCallCount = 0;

    const result = await db.getWeekAdherence();
    expect(result).toHaveLength(7);
    expect(result[0]).toEqual({ day: 0, scheduled: true, completed: true });
    expect(result[1]).toEqual({ day: 1, scheduled: false, completed: false });
    expect(result[2]).toEqual({ day: 2, scheduled: true, completed: true });
    expect(result[4]).toEqual({ day: 4, scheduled: true, completed: false });
  });

  it("returns all unscheduled when no schedule exists", async () => {
    await initDb();
    mockDrizzleQueryResults = [[], []];
    mockDrizzleQueryCallCount = 0;

    const result = await db.getWeekAdherence();
    expect(result).toHaveLength(7);
    expect(result.every((d) => !d.scheduled && !d.completed)).toBe(true);
  });
});

describe("deleteTemplate cascade", () => {
  it("deletes program_schedule entries before deleting template", async () => {
    await initDb();
    // deleteTemplate uses Drizzle .get() to check is_starter
    mockDrizzleGetResult = { is_starter: 0 };

    await db.deleteTemplate("t1");

    // Transaction was called (deleteTemplate uses withTransactionAsync)
    expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(1);
  });

  it("skips deletion for starter templates", async () => {
    await initDb();
    mockDrizzleGetResult = { is_starter: 1 };

    await db.deleteTemplate("t1");
    expect(mockDb.withTransactionAsync).not.toHaveBeenCalled();
  });
});

describe("schedule migration", () => {
  it("creates program_schedule table during migration", async () => {
    db = require("../../lib/db");
    await db.getDatabase();
    const calls = mockDb.execAsync.mock.calls.map((c: string[]) => c[0]);
    const migration = calls.find((sql: string) =>
      sql.includes("CREATE TABLE IF NOT EXISTS program_schedule")
    );
    expect(migration).toBeDefined();
    expect(migration).toContain("day_of_week INTEGER NOT NULL");
    expect(migration).toContain("template_id TEXT NOT NULL");
    expect(migration).toContain("UNIQUE(program_id, day_of_week)");
  });
});

function mondayTimestamp(): number {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d.getTime();
}
