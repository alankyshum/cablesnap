/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BLD-1791 — per-worker IndexedDB name resolution (`resolveDbName`).
 *
 * Playwright runs every project/worker against the same web origin
 * (http://localhost:8081), and IndexedDB is keyed by origin — so a fixed DB
 * name means all workers share ONE persistent SQLite DB. The scenario seed
 * (`lib/db/test-seed.ts`) clears `workout_sessions`/`workout_sets` at the start
 * of every load, so a concurrent worker can wipe another worker's seeded rows
 * mid-test, flaking the AC #265 kill+relaunch persistence assertion.
 *
 * The fix lets the Playwright harness inject `window.__E2E_DB_NAME__`, but ONLY
 * when `navigator.webdriver === true` — the same hardening as the
 * `__E2E_EXERCISE_FIXTURE__` escape hatch. These tests pin both halves:
 *   1. Production routing is UNCHANGED — without webdriver (or without the flag)
 *      the name is always the `cablesnap.db` constant, even if a (malicious)
 *      `__E2E_DB_NAME__` is set on `window`.
 *   2. Under webdriver + a valid flag, each worker gets its injected name.
 *
 * Verified both directly (pure `resolveDbName()`) and observably through
 * `getDatabase()` → the name passed to `openDatabaseAsync`.
 */

import { mockDb, mockDrizzleDb } from "../../helpers/db-test-setup";

const PROD_DB_NAME = "cablesnap.db";

function installDbMocks(): void {
  jest.doMock("expo-sqlite", () => ({
    openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
  }));
  jest.doMock("drizzle-orm/expo-sqlite", () => ({
    drizzle: jest.fn(() => mockDrizzleDb),
  }));
  jest.doMock("react-native", () => ({ Platform: { OS: "web" } }));
  jest.doMock("../../../lib/seed", () => ({ seedExercises: jest.fn(() => []) }));
  jest.doMock("expo-crypto", () => ({ randomUUID: jest.fn(() => "test-uuid-1234") }));
}

describe("resolveDbName (BLD-1791)", () => {
  const g = globalThis as any;
  const originalNavigator = g.navigator;
  const originalWindow = g.window;

  beforeEach(() => {
    jest.clearAllMocks();
    delete g.__cablesnap_db;
    delete g.__cablesnap_drizzle;
    delete g.__cablesnap_init;
    delete g.__cablesnap_memfb;
    delete g.__cablesnap_db_failure;
    delete g.__cablesnap_db_failure_captured;
    jest.resetModules();
    installDbMocks();
  });

  afterEach(() => {
    g.navigator = originalNavigator;
    g.window = originalWindow;
  });

  function setEnv(opts: { webdriver?: boolean; dbName?: unknown }): void {
    g.navigator = { webdriver: opts.webdriver };
    g.window = opts.dbName === undefined ? {} : { __E2E_DB_NAME__: opts.dbName };
  }

  // ---- Pure-function assertions ----

  it("returns the prod constant when navigator.webdriver is false", () => {
    setEnv({ webdriver: false, dbName: "cablesnap-e2e-w3.db" });
    const { resolveDbName } = require("../../../lib/db/helpers");
    expect(resolveDbName()).toBe(PROD_DB_NAME);
  });

  it("returns the prod constant when navigator.webdriver is undefined", () => {
    g.navigator = {};
    g.window = { __E2E_DB_NAME__: "cablesnap-e2e-w3.db" };
    const { resolveDbName } = require("../../../lib/db/helpers");
    expect(resolveDbName()).toBe(PROD_DB_NAME);
  });

  it("honors __E2E_DB_NAME__ only under webdriver", () => {
    setEnv({ webdriver: true, dbName: "cablesnap-e2e-w2.db" });
    const { resolveDbName } = require("../../../lib/db/helpers");
    expect(resolveDbName()).toBe("cablesnap-e2e-w2.db");
  });

  it("falls back to the prod constant when the flag is absent under webdriver", () => {
    setEnv({ webdriver: true });
    const { resolveDbName } = require("../../../lib/db/helpers");
    expect(resolveDbName()).toBe(PROD_DB_NAME);
  });

  it("ignores a non-string / empty flag value", () => {
    const { resolveDbName } = require("../../../lib/db/helpers");

    setEnv({ webdriver: true, dbName: "" });
    expect(resolveDbName()).toBe(PROD_DB_NAME);

    setEnv({ webdriver: true, dbName: 42 });
    expect(resolveDbName()).toBe(PROD_DB_NAME);

    setEnv({ webdriver: true, dbName: { malicious: true } });
    expect(resolveDbName()).toBe(PROD_DB_NAME);
  });

  // ---- Observable wiring through getDatabase() ----

  it("opens the per-worker DB under webdriver + valid flag", async () => {
    setEnv({ webdriver: true, dbName: "cablesnap-e2e-w5.db" });
    const sqlite = require("expo-sqlite");
    const dbMod = require("../../../lib/db");
    await dbMod.getDatabase();
    expect(sqlite.openDatabaseAsync).toHaveBeenCalledWith("cablesnap-e2e-w5.db");
  });

  it("opens the prod DB when a flag is set WITHOUT webdriver (production safety)", async () => {
    // Simulates a real user with a console-injected flag: must be ignored.
    setEnv({ webdriver: false, dbName: "attacker-controlled.db" });
    const sqlite = require("expo-sqlite");
    const dbMod = require("../../../lib/db");
    await dbMod.getDatabase();
    expect(sqlite.openDatabaseAsync).toHaveBeenCalledWith(PROD_DB_NAME);
    expect(sqlite.openDatabaseAsync).not.toHaveBeenCalledWith("attacker-controlled.db");
  });
});
