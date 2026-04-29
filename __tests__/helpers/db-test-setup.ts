/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared setup for db.*.test.ts split files (BLD-817).
 *
 * The original __tests__/lib/db.test.ts was 47 tests in a single file
 * paying ~80ms per test on jest.resetModules() + require("../../lib/db")
 * (lib/db re-exports 35 modules). Splitting into multiple files lets Jest
 * workers run them in parallel; each file pays the module-init cost once.
 *
 * This module exposes a `installDbMocks()` function that test files call
 * at top-level (BEFORE any imports from lib/db) to register the same
 * jest.mock chain we used to inline. Each test file then has its own
 * lightweight `beforeEach` provided by `makeDbBeforeEach()`.
 *
 * NOTE: This file lives in __tests__/helpers/ which is in
 * jest.config.js testPathIgnorePatterns, so it is never run as a suite.
 */

export const MOCK_UUID = "test-uuid-1234";

// ---- Drizzle ORM mock state (per test-file scope) ----
let drizzleQueryResult: any = [];
let drizzleGetResult: any = undefined;

export function resetDrizzleResults(): void {
  drizzleQueryResult = [];
  drizzleGetResult = undefined;
}

// Chainable query builder mocks
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
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve(drizzleQueryResult).then(resolve, reject);
  return chain;
}

function createChainableInsert() {
  return {
    values: jest.fn().mockReturnThis(),
    then: (resolve: any, reject: any) => Promise.resolve().then(resolve, reject),
  };
}

function createChainableUpdate() {
  return {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    then: (resolve: any, reject: any) => Promise.resolve().then(resolve, reject),
  };
}

function createChainableDelete() {
  return {
    where: jest.fn().mockReturnThis(),
    then: (resolve: any, reject: any) => Promise.resolve().then(resolve, reject),
  };
}

// Shared mock instances. These are module-scoped to the test file that
// imports this helper (Jest module isolation gives each test file its own copy).
export const mockDrizzleDb = {
  select: jest.fn(() => createChainableSelect()),
  insert: jest.fn(() => createChainableInsert()),
  update: jest.fn(() => createChainableUpdate()),
  delete: jest.fn(() => createChainableDelete()),
  // BLD-630: completeSet anchors workout_sessions.clock_started_at via raw run().
  run: jest.fn(() => Promise.resolve()),
};

export const mockDb = {
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

/** Set the value the next Drizzle `select().from()...get()` call returns. */
export function mockDrizzleGet(value: any): void {
  drizzleGetResult = value;
}

/** Set the value the next Drizzle `await select().from()...` resolves to. */
export function mockDrizzleAll(value: any[]): void {
  drizzleQueryResult = value;
}

/** Direct setter for the array result (used by a few tests that mutate it). */
export function setDrizzleQueryResult(value: any[]): void {
  drizzleQueryResult = value;
}

/** Direct setter for the get result. */
export function setDrizzleGetResult(value: any): void {
  drizzleGetResult = value;
}

export type DbModule = typeof import("../../lib/db");

export interface DbTestContext {
  db: DbModule;
  /** Initialise the database (consumes migration mocks), then clear mocks. */
  initDb: () => Promise<void>;
}

/**
 * Shared beforeEach setup. Returns a context whose `db` field is repopulated
 * before each test (the original test file required `lib/db` fresh per test).
 */
export function setupDbTestContext(): DbTestContext {
  const ctx: DbTestContext = {
    // Will be assigned in beforeEach.
    db: undefined as unknown as DbModule,
    initDb: async () => {
      await ctx.db.getDatabase();
      jest.clearAllMocks();
      resetDrizzleResults();
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetDrizzleResults();
    mockDb.execAsync.mockResolvedValue(undefined);
    mockDb.getAllAsync.mockResolvedValue([]);
    mockDb.getFirstAsync.mockResolvedValue({ count: 10 });
    mockDb.runAsync.mockResolvedValue({ changes: 1 });

    // Clear globalThis singleton so each test starts fresh.
    const g = globalThis as any;
    delete g.__cablesnap_db;
    delete g.__cablesnap_drizzle;
    delete g.__cablesnap_init;
    delete g.__cablesnap_memfb;

    // Reset the cached db module to clear singleton state.
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ctx.db = require("../../lib/db");
  });

  return ctx;
}
