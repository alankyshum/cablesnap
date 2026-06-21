/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BLD-1636 — warmSyncWorker() init-time cold-worker warm-up.
 *
 * `drizzle-orm/expo-sqlite` is a synchronous driver: every `.get()/.all()/.run()`
 * routes through expo-sqlite's web `invokeWorkerSync` busy-wait, which throws
 * `Sync operation timeout` (1e6 iterations with Atomics.pause) if the WASM
 * worker is still cold. `getDatabase()`'s async init warms the worker only for
 * *async* messages, so the FIRST drizzle sync `.get()` from a screen (e.g.
 * useSummaryData → getSessionById) could time out and crash the post-workout
 * summary (BLD-1635).
 *
 * `warmSyncWorker(instance)` (lib/db/helpers.ts) closes the gap on web: it issues
 * `getFirstSync("SELECT 1")` — the same sync path drizzle uses — inside a bounded
 * async-retry loop, paying the cold-sync penalty ONCE inside the awaited (splash-
 * gated) init. These tests exercise it through getDatabase()'s observable
 * behavior (how getFirstSync is called) since the helper is intentionally private.
 */

import { mockDb, mockDrizzleDb } from "../../helpers/db-test-setup";

function makeSyncTimeoutError(): Error {
  const e = new Error("Sync operation timeout");
  e.name = "SyncOperationTimeoutError";
  return e;
}

describe("warmSyncWorker (BLD-1636)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const g = globalThis as any;
    delete g.__cablesnap_db;
    delete g.__cablesnap_drizzle;
    delete g.__cablesnap_init;
    delete g.__cablesnap_memfb;
    delete g.__cablesnap_db_failure;
    delete g.__cablesnap_db_failure_captured;
    jest.resetModules();
  });

  function mockEnv(platformOs: string): void {
    jest.doMock("expo-sqlite", () => ({
      openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
    }));
    jest.doMock("drizzle-orm/expo-sqlite", () => ({
      drizzle: jest.fn(() => mockDrizzleDb),
    }));
    jest.doMock("react-native", () => ({ Platform: { OS: platformOs } }));
    jest.doMock("../../../lib/seed", () => ({ seedExercises: jest.fn(() => []) }));
    jest.doMock("expo-crypto", () => ({ randomUUID: jest.fn(() => "test-uuid-1234") }));
  }

  it("on web: probes the sync path once when the worker is already warm", async () => {
    mockEnv("web");
    mockDb.getFirstSync.mockReturnValueOnce({ "1": 1 });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbMod = require("../../../lib/db");
    await dbMod.getDatabase();

    // Exactly one successful sync round-trip during init.
    expect(mockDb.getFirstSync).toHaveBeenCalledTimes(1);
    expect(mockDb.getFirstSync).toHaveBeenCalledWith("SELECT 1");
  });

  it("on web: retries after a Sync operation timeout, then succeeds (cold worker)", async () => {
    mockEnv("web");
    // First two sync probes time out (cold worker), third succeeds.
    mockDb.getFirstSync
      .mockImplementationOnce(() => { throw makeSyncTimeoutError(); })
      .mockImplementationOnce(() => { throw makeSyncTimeoutError(); })
      .mockImplementationOnce(() => ({ "1": 1 }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbMod = require("../../../lib/db");
    const result = await dbMod.getDatabase();

    expect(result).toBe(mockDb);
    // Retried until success — 3 attempts total.
    expect(mockDb.getFirstSync).toHaveBeenCalledTimes(3);
    // The init resolved successfully — drizzle instance is available.
    expect(dbMod.isMemoryFallback()).toBe(false);
  });

  it("on web: a persistent timeout falls through to the :memory: fallback (does not hang)", async () => {
    // Primary db open succeeds, but the sync worker NEVER warms → warmSyncWorker
    // exhausts its budget and throws → getDatabase()'s web catch opens :memory:
    // (whose warm-up succeeds). Proves the bound prevents an infinite spin and
    // degrades via the existing fallback rather than crashing.
    const openMock = jest.fn(() => Promise.resolve(mockDb));
    jest.doMock("expo-sqlite", () => ({ openDatabaseAsync: openMock }));
    jest.doMock("drizzle-orm/expo-sqlite", () => ({ drizzle: jest.fn(() => mockDrizzleDb) }));
    jest.doMock("react-native", () => ({ Platform: { OS: "web" } }));
    jest.doMock("../../../lib/seed", () => ({ seedExercises: jest.fn(() => []) }));
    jest.doMock("expo-crypto", () => ({ randomUUID: jest.fn(() => "test-uuid-1234") }));

    let calls = 0;
    mockDb.getFirstSync.mockImplementation(() => {
      calls++;
      // First 25 probes (primary path) time out; from the 26th (memory path) on, succeed.
      if (calls <= 25) throw makeSyncTimeoutError();
      return { "1": 1 };
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbMod = require("../../../lib/db");
    const result = await dbMod.getDatabase();

    expect(result).toBe(mockDb);
    // Primary db open + :memory: fallback open.
    expect(openMock).toHaveBeenNthCalledWith(1, "cablesnap.db");
    expect(openMock).toHaveBeenNthCalledWith(2, ":memory:");
    expect(dbMod.isMemoryFallback()).toBe(true);
  }, 15000);

  it("on native: skips the sync warm-up entirely (no getFirstSync)", async () => {
    mockEnv("ios");

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbMod = require("../../../lib/db");
    await dbMod.getDatabase();

    // Native sync driver is fine — warmSyncWorker must be a no-op.
    expect(mockDb.getFirstSync).not.toHaveBeenCalled();
  });

  it("on web: a NON-timeout sync error is not retried (propagates to fallback)", async () => {
    const openMock = jest.fn(() => Promise.resolve(mockDb));
    jest.doMock("expo-sqlite", () => ({ openDatabaseAsync: openMock }));
    jest.doMock("drizzle-orm/expo-sqlite", () => ({ drizzle: jest.fn(() => mockDrizzleDb) }));
    jest.doMock("react-native", () => ({ Platform: { OS: "web" } }));
    jest.doMock("../../../lib/seed", () => ({ seedExercises: jest.fn(() => []) }));
    jest.doMock("expo-crypto", () => ({ randomUUID: jest.fn(() => "test-uuid-1234") }));

    let calls = 0;
    mockDb.getFirstSync.mockImplementation(() => {
      calls++;
      // Primary path: a generic (non-timeout) error → must NOT retry.
      if (calls === 1) throw new Error("disk I/O error");
      return { "1": 1 };
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbMod = require("../../../lib/db");
    const result = await dbMod.getDatabase();

    // Non-timeout error short-circuits the primary path after a SINGLE probe,
    // then the :memory: fallback warms successfully.
    expect(result).toBe(mockDb);
    expect(calls).toBe(2); // 1 failed probe (primary) + 1 success (memory)
    expect(dbMod.isMemoryFallback()).toBe(true);
  });
});
