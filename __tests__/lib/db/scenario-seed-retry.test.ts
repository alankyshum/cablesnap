/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BLD-1796 — bounded scenario-seed retry gate.
 *
 * Under high Playwright worker counts (BLD-1791 gives each worker its OWN cold
 * WASM-SQLite DB on a SHARED `npx serve` static origin), the scenario seed that
 * `hooks/useAppInit.ts` runs after DB init flakes transiently while N workers
 * cold-boot at once: the lazy `test-seed` chunk is dropped ("Failed to fetch")
 * and/or the seed's drizzle writes hit the BLD-1636 sync busy-wait budget
 * ("Sync operation timeout"). Either leaves `data-test-ready` unset, timing out
 * every seed-dependent scenario spec.
 *
 * The fix retries the import+seed a bounded number of times — but ONLY under a
 * WebDriver-controlled browser (`navigator.webdriver === true`), so production
 * and manual dev-web are byte-for-byte unchanged. These tests pin both halves:
 *   1. PRODUCTION/native SAFETY — without webdriver the retry is inert (exactly
 *      one attempt), mirroring the `resolveDbName()` test-gate convention.
 *   2. Under webdriver — bounded retry fires only on the transient signatures,
 *      surfaces non-transient errors immediately, and surfaces the original
 *      error after the budget is exhausted (no new permanent hang / no swallow).
 *
 * `react-native` is mocked to web so importing `test-seed` (which pulls
 * `./helpers` → `./sets`) does not drag in the native SQLite stack.
 */

import { mockDb, mockDrizzleDb } from "../../helpers/db-test-setup";

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

describe("scenario-seed retry gate (BLD-1796)", () => {
  const g = globalThis as any;
  const originalNavigator = g.navigator;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    installDbMocks();
    // Default: NOT under webdriver (production-like).
    g.navigator = { webdriver: false };
  });

  afterEach(() => {
    g.navigator = originalNavigator;
    jest.useRealTimers();
  });

  function load() {
    return require("../../../lib/db/test-seed") as typeof import("../../../lib/db/test-seed");
  }

  // ---- scenarioSeedRetryEnabled(): the production/native safety gate ----

  describe("scenarioSeedRetryEnabled()", () => {
    it("is false when navigator.webdriver is false (production safety)", () => {
      g.navigator = { webdriver: false };
      expect(load().scenarioSeedRetryEnabled()).toBe(false);
    });

    it("is false when navigator.webdriver is undefined", () => {
      g.navigator = {};
      expect(load().scenarioSeedRetryEnabled()).toBe(false);
    });

    it("is false when navigator is undefined (native / SSR)", () => {
      g.navigator = undefined;
      expect(load().scenarioSeedRetryEnabled()).toBe(false);
    });

    it("is true only under a WebDriver-controlled browser", () => {
      g.navigator = { webdriver: true };
      expect(load().scenarioSeedRetryEnabled()).toBe(true);
    });
  });

  // ---- isTransientScenarioSeedError(): signature classification ----

  describe("isTransientScenarioSeedError()", () => {
    it.each([
      ["Sync operation timeout message", new Error("Sync operation timeout after 5000ms")],
      ["Failed to fetch (dropped lazy chunk)", new Error("Failed to fetch")],
      ["Load failed (WebKit fetch wording)", new Error("Load failed")],
      ["NetworkError", new Error("NetworkError when attempting to fetch resource")],
    ])("classifies %s as transient", (_label, err) => {
      expect(load().isTransientScenarioSeedError(err)).toBe(true);
    });

    it("classifies an error tagged SyncOperationTimeoutError by name", () => {
      const err = new Error("anything");
      err.name = "SyncOperationTimeoutError";
      expect(load().isTransientScenarioSeedError(err)).toBe(true);
    });

    it("does NOT classify a genuine programming error as transient", () => {
      expect(load().isTransientScenarioSeedError(new Error("no such table: workout_sets"))).toBe(
        false,
      );
      expect(load().isTransientScenarioSeedError(new TypeError("x is not a function"))).toBe(false);
    });

    it("does NOT classify non-Error throwables as transient", () => {
      expect(load().isTransientScenarioSeedError("Failed to fetch")).toBe(false);
      expect(load().isTransientScenarioSeedError(undefined)).toBe(false);
      expect(load().isTransientScenarioSeedError(null)).toBe(false);
    });
  });

  // ---- runScenarioSeedWithRetry(): bounded retry behavior ----

  describe("runScenarioSeedWithRetry()", () => {
    it("runs the thunk exactly once on success", async () => {
      const thunk = jest.fn().mockResolvedValue(undefined);
      await load().runScenarioSeedWithRetry(thunk);
      expect(thunk).toHaveBeenCalledTimes(1);
    });

    it("runs exactly ONE attempt outside webdriver, even on a transient error (production safety)", async () => {
      g.navigator = { webdriver: false };
      const thunk = jest.fn().mockRejectedValue(new Error("Failed to fetch"));
      await expect(load().runScenarioSeedWithRetry(thunk)).rejects.toThrow("Failed to fetch");
      expect(thunk).toHaveBeenCalledTimes(1);
    });

    it("retries a transient failure then succeeds under webdriver", async () => {
      g.navigator = { webdriver: true };
      const thunk = jest
        .fn()
        .mockRejectedValueOnce(new Error("Failed to fetch"))
        .mockRejectedValueOnce(new Error("Sync operation timeout"))
        .mockResolvedValueOnce(undefined);
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      await load().runScenarioSeedWithRetry(thunk);
      expect(thunk).toHaveBeenCalledTimes(3);
      warn.mockRestore();
    });

    it("surfaces a NON-transient error immediately without retrying", async () => {
      g.navigator = { webdriver: true };
      const thunk = jest.fn().mockRejectedValue(new Error("no such table: workout_sets"));
      await expect(load().runScenarioSeedWithRetry(thunk)).rejects.toThrow(
        "no such table: workout_sets",
      );
      expect(thunk).toHaveBeenCalledTimes(1);
    });

    it("surfaces the original error after the retry budget is exhausted (no hang, no swallow)", async () => {
      g.navigator = { webdriver: true };
      const thunk = jest.fn().mockRejectedValue(new Error("Sync operation timeout"));
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      await expect(load().runScenarioSeedWithRetry(thunk)).rejects.toThrow(
        "Sync operation timeout",
      );
      // Bounded: 5 attempts max (the SCENARIO_SEED_MAX_ATTEMPTS budget).
      expect(thunk).toHaveBeenCalledTimes(5);
      warn.mockRestore();
    });
  });
});
