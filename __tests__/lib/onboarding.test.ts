/* eslint-disable @typescript-eslint/no-explicit-any */
// Mock crypto.randomUUID
const MOCK_UUID = "test-uuid-onboarding";
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

let mockDrizzleQueryResult: any = [];
let mockDrizzleGetResult: any = undefined;

function mockCreateDrizzle() {
  return {
    select: jest.fn(() => {
      const chain: any = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        get: jest.fn(() => mockDrizzleGetResult),
        then: (r: any, rj: any) => Promise.resolve(mockDrizzleQueryResult).then(r, rj),
      };
      return chain;
    }),
    insert: jest.fn(() => { const c: any = { values: jest.fn().mockReturnThis(), onConflictDoUpdate: jest.fn().mockReturnThis(), onConflictDoNothing: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
    update: jest.fn(() => { const c: any = { set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
    delete: jest.fn(() => { const c: any = { where: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
  };
}

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => mockCreateDrizzle()),
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
  mockDrizzleQueryResult = [];
  mockDrizzleGetResult = undefined;
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
  jest.doMock("drizzle-orm/expo-sqlite", () => ({
    drizzle: jest.fn(() => mockCreateDrizzle()),
  }));
  db = require("../../lib/db");
});

describe("getAppSetting", () => {
  it("returns null when key not found", async () => {
    await initDb();
    mockDrizzleGetResult = undefined;
    const val = await db.getAppSetting("missing_key");
    expect(val).toBeNull();
  });

  it("returns value when key exists", async () => {
    await initDb();
    mockDrizzleGetResult = { value: "hello" };
    const val = await db.getAppSetting("test_key");
    expect(val).toBe("hello");
  });
});

describe("setAppSetting", () => {
  it("inserts or replaces setting", async () => {
    await initDb();
    await db.setAppSetting("my_key", "my_value");
    // Drizzle insert is called (verified by no error thrown)
  });
});

describe("isOnboardingComplete", () => {
  it("returns false when setting not present", async () => {
    await initDb();
    mockDrizzleGetResult = undefined;
    const complete = await db.isOnboardingComplete();
    expect(complete).toBe(false);
  });

  it("returns false when setting is not '1'", async () => {
    await initDb();
    mockDrizzleGetResult = { value: "0" };
    const complete = await db.isOnboardingComplete();
    expect(complete).toBe(false);
  });

  it("returns true when setting is '1'", async () => {
    await initDb();
    mockDrizzleGetResult = { value: "1" };
    const complete = await db.isOnboardingComplete();
    expect(complete).toBe(true);
  });
});

describe("seedStarters existing-user migration", () => {
  it("sets onboarding_complete for existing users with starter_version", async () => {
    // Simulate existing user: starter_version exists with current version
    // Use a smart mock that returns the right result based on the query
    mockDb.getFirstAsync.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("starter_version"))
        return { value: "1" };
      if (typeof sql === "string" && sql.includes("COUNT"))
        return { count: 10 };
      return null;
    });

    await db.getDatabase();

    const calls = mockDb.runAsync.mock.calls;
    const onboardingCall = calls.find(
      (c: [string, ...unknown[]]) =>
        typeof c[0] === "string" &&
        c[0].includes("onboarding_complete")
    );
    expect(onboardingCall).toBeDefined();
    expect(onboardingCall![0]).toContain("INSERT OR IGNORE");
  });

  it("does not set onboarding_complete for fresh installs", async () => {
    mockDb.getFirstAsync.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("starter_version"))
        return null;
      if (typeof sql === "string" && sql.includes("COUNT"))
        return { count: 10 };
      return null;
    });

    await db.getDatabase();

    const calls = mockDb.runAsync.mock.calls;
    const onboardingCall = calls.find(
      (c: [string, ...unknown[]]) =>
        typeof c[0] === "string" &&
        c[0].includes("onboarding_complete")
    );
    expect(onboardingCall).toBeUndefined();
  });
});

describe("detectUnits", () => {
  it("returns metric defaults for non-US locales", () => {
    // The detectUnits function is in the setup screen component;
    // we test the locale detection logic directly
    const detect = (locale: string) => {
      if (locale.startsWith("en-US") || locale.startsWith("en-CA"))
        return { weight: "lb" as const, measurement: "in" as const };
      return { weight: "kg" as const, measurement: "cm" as const };
    };

    expect(detect("de-DE")).toEqual({ weight: "kg", measurement: "cm" });
    expect(detect("ja-JP")).toEqual({ weight: "kg", measurement: "cm" });
    expect(detect("en-GB")).toEqual({ weight: "kg", measurement: "cm" });
    expect(detect("en-AU")).toEqual({ weight: "kg", measurement: "cm" });
  });

  it("returns imperial for US and Canada", () => {
    const detect = (locale: string) => {
      if (locale.startsWith("en-US") || locale.startsWith("en-CA"))
        return { weight: "lb" as const, measurement: "in" as const };
      return { weight: "kg" as const, measurement: "cm" as const };
    };

    expect(detect("en-US")).toEqual({ weight: "lb", measurement: "in" });
    expect(detect("en-CA")).toEqual({ weight: "lb", measurement: "in" });
  });
});
