/**
 * BLD-1257: regression tests for the one-shot init failure semantics that
 * tame the Sentry REACT-NATIVE-7 burst (NPE in NativeDatabase.execAsync on
 * Android 16 / Galaxy Z Fold 6).
 *
 * Invariants under test:
 *   1. When SQLite.openDatabaseAsync rejects, getDatabase() throws a
 *      DatabaseUnavailableError with phase=open.
 *   2. A second getDatabase() call in the same JS session does NOT invoke
 *      SQLite.openDatabaseAsync again — the cached failure short-circuits.
 *   3. Sentry.captureException is invoked exactly ONCE per failed session
 *      even with many downstream callers.
 *   4. The probe step (SELECT 1) catches a broken native handle as
 *      phase=probe, so call sites can distinguish open-failed from
 *      handle-returns-but-rejects-everything.
 *   5. resetDatabaseInit() clears the cached failure AND the Sentry
 *      one-shot guard, so a user-initiated Retry CAN emit a fresh
 *      captureException on the next attempt (treated as a separate
 *      session attempt per the spec edge case).
 *
 * The manual mock at __mocks__/expo-sqlite.ts is re-evaluated on every
 * jest.resetModules(), which creates fresh jest.fn() instances. So every
 * test re-requires both modules INSIDE the test body to grab the
 * current-generation references — otherwise we'd be poking the previous
 * generation's mock while helpers.ts sees the new one.
 */

// Reset the global singleton between tests — the helpers module caches
// state on globalThis so a second test would otherwise see the first
// test's cached failure / db handle.
function resetGlobals() {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__cablesnap_db;
  delete g.__cablesnap_drizzle;
  delete g.__cablesnap_init;
  delete g.__cablesnap_db_failure;
  delete g.__cablesnap_db_failure_captured;
}

describe("BLD-1257 — DatabaseUnavailable one-shot init failure", () => {
  beforeEach(() => {
    jest.resetModules();
    resetGlobals();
  });

  it("rejects with DatabaseUnavailableError (phase=open) when openDatabaseAsync rejects with the NPE message", async () => {
    const SQLite = require("expo-sqlite") as { openDatabaseAsync: jest.Mock };
    SQLite.openDatabaseAsync.mockRejectedValue(
      new Error(
        "Call to function 'NativeDatabase.execAsync' has been rejected. Caused by java.lang.NullPointerException",
      ),
    );

    const { getDatabase, isDatabaseUnavailableError } = require("@/lib/db");

    await expect(getDatabase()).rejects.toMatchObject({
      name: "DatabaseUnavailableError",
      phase: "open",
    });

    let captured: unknown;
    try {
      await getDatabase();
    } catch (err) {
      captured = err;
    }
    expect(isDatabaseUnavailableError(captured)).toBe(true);
  });

  it("does NOT re-invoke openDatabaseAsync on the second call in the same session", async () => {
    const SQLite = require("expo-sqlite") as { openDatabaseAsync: jest.Mock };
    SQLite.openDatabaseAsync.mockRejectedValue(new Error("NPE"));

    const { getDatabase } = require("@/lib/db");

    await expect(getDatabase()).rejects.toBeDefined();
    await expect(getDatabase()).rejects.toBeDefined();
    await expect(getDatabase()).rejects.toBeDefined();

    expect(SQLite.openDatabaseAsync.mock.calls.length).toBe(1);
  });

  it("records exactly one Sentry.captureException across many failed callers in the same session", async () => {
    const SQLite = require("expo-sqlite") as { openDatabaseAsync: jest.Mock };
    SQLite.openDatabaseAsync.mockRejectedValue(new Error("NPE"));
    const Sentry = require("@sentry/react-native") as { captureException: jest.Mock };

    const { getDatabase } = require("@/lib/db");

    // Simulate the burst: many downstream call sites all hit getDatabase().
    await Promise.all(
      Array.from({ length: 20 }, () => getDatabase().catch(() => undefined)),
    );

    expect(Sentry.captureException.mock.calls.length).toBe(1);
  });

  it("tags phase=probe when openDatabaseAsync resolves but SELECT 1 rejects", async () => {
    const SQLite = require("expo-sqlite") as { openDatabaseAsync: jest.Mock };
    const brokenInstance = {
      execAsync: jest.fn(async (sql: string) => {
        if (sql === "SELECT 1") {
          throw new Error(
            "Call to function 'NativeDatabase.execAsync' has been rejected. NPE",
          );
        }
      }),
      getAllAsync: jest.fn(),
      getFirstAsync: jest.fn(),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(),
    };
    SQLite.openDatabaseAsync.mockResolvedValue(brokenInstance);

    const { getDatabase } = require("@/lib/db");

    await expect(getDatabase()).rejects.toMatchObject({
      name: "DatabaseUnavailableError",
      phase: "probe",
    });
    // PRAGMA / migrate / seed must NOT have been attempted past the probe.
    const calls = brokenInstance.execAsync.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(["SELECT 1"]);
  });

  it("resetDatabaseInit() clears the cached failure AND the Sentry guard so a fresh Retry re-attempts open and CAN emit a new captureException", async () => {
    const SQLite = require("expo-sqlite") as { openDatabaseAsync: jest.Mock };
    SQLite.openDatabaseAsync.mockRejectedValue(new Error("NPE"));
    const Sentry = require("@sentry/react-native") as { captureException: jest.Mock };

    const { getDatabase, resetDatabaseInit } = require("@/lib/db");

    await expect(getDatabase()).rejects.toBeDefined();
    expect(SQLite.openDatabaseAsync.mock.calls.length).toBe(1);
    expect(Sentry.captureException.mock.calls.length).toBe(1);

    // User taps Retry.
    resetDatabaseInit();

    await expect(getDatabase()).rejects.toBeDefined();
    expect(SQLite.openDatabaseAsync.mock.calls.length).toBe(2);
    // A new "session attempt" — guard reset means a second captureException
    // is allowed.
    expect(Sentry.captureException.mock.calls.length).toBe(2);
  });

  it("getDatabaseFailure() returns the cached error after a failed init and null after Retry", async () => {
    const SQLite = require("expo-sqlite") as { openDatabaseAsync: jest.Mock };
    SQLite.openDatabaseAsync.mockRejectedValue(new Error("NPE"));

    const { getDatabase, getDatabaseFailure, resetDatabaseInit } = require("@/lib/db");

    await expect(getDatabase()).rejects.toBeDefined();
    const failure = getDatabaseFailure();
    expect(failure).not.toBeNull();
    expect(failure?.error.phase).toBe("open");

    resetDatabaseInit();
    expect(getDatabaseFailure()).toBeNull();
  });
});
