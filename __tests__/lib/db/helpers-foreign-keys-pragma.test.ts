/**
 * BLD-1094: PRAGMA foreign_keys = ON enforcement on every getDatabase()
 * connection (regular expo-sqlite path AND web in-memory fallback).
 *
 * The migration tables in lib/db/tables.ts declare FK constraints
 * (strava_sync_log, strength_goals, cable_stacks,
 * stack_calibrations, program_schedule). Until BLD-1094 those constraints
 * were silent runtime no-ops because foreign_keys was only enabled inside
 * lib/db/import-export.ts:530 (CSV import). This test pins the pragma to
 * the main DB-open path so future regressions on helpers.ts surface here.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const execCalls: string[] = [];

const mockDb: any = {
  execAsync: jest.fn(async (sql: string) => { execCalls.push(sql); }),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  // BLD-1636: warmSyncWorker() probes the sync path with getFirstSync on web.
  getFirstSync: jest.fn(() => ({ "1": 1 })),
  runAsync: jest.fn().mockResolvedValue({ changes: 0 }),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
  prepareAsync: jest.fn().mockResolvedValue({
    executeAsync: jest.fn().mockResolvedValue({ getAllAsync: () => [] }),
    finalizeAsync: jest.fn().mockResolvedValue(undefined),
  }),
};

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

jest.mock("../../../lib/db/migrations", () => ({
  migrate: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../../lib/db/seed", () => ({
  seed: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => ({})),
}));

describe("BLD-1094 — getDatabase() enables PRAGMA foreign_keys = ON", () => {
  beforeEach(() => {
    execCalls.length = 0;
    jest.resetModules();
    jest.clearAllMocks();
    // clearAllMocks wipes implementations; re-attach the recording impl.
    mockDb.execAsync.mockImplementation(async (sql: string) => { execCalls.push(sql); });
    mockDb.withTransactionAsync.mockImplementation(async (cb: () => Promise<void>) => cb());
    // Reset helpers.ts module-level singletons by re-requiring after reset.
    (globalThis as any).__cablesnap_db = undefined;
    (globalThis as any).__cablesnap_drizzle = undefined;
    (globalThis as any).__cablesnap_init = undefined;
  });

  it("issues PRAGMA foreign_keys = ON immediately after journal_mode on the main path", async () => {
    const helpers = require("../../../lib/db/helpers");
    await helpers.getDatabase();

    const journalIdx = execCalls.findIndex((s) => s.includes("journal_mode"));
    const fkIdx = execCalls.findIndex((s) => /PRAGMA\s+foreign_keys\s*=\s*ON/i.test(s));
    expect(journalIdx).toBeGreaterThanOrEqual(0);
    expect(fkIdx).toBeGreaterThan(journalIdx);
  });

  it("the web in-memory fallback also enables PRAGMA foreign_keys = ON", async () => {
    // Make the primary openDatabaseAsync throw to force the fallback path on web.
    const expoSqlite = require("expo-sqlite") as { openDatabaseAsync: jest.Mock };
    expoSqlite.openDatabaseAsync.mockReset();
    expoSqlite.openDatabaseAsync
      .mockImplementationOnce(() => Promise.reject(new Error("simulated open failure")))
      .mockImplementationOnce(() => Promise.resolve(mockDb));

    // Force Platform.OS = 'web' so the fallback branch is taken.
    jest.doMock("react-native", () => ({ Platform: { OS: "web" } }));
    const helpers = require("../../../lib/db/helpers");

    await helpers.getDatabase();

    expect(execCalls.some((s) => /PRAGMA\s+foreign_keys\s*=\s*ON/i.test(s))).toBe(true);
  });
});
