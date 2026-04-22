/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Guard tests for the scenario seed hook (BLD-494, QD#5).
 *
 * `seedScenario()` MUST be a no-op when ANY of the three guards fails:
 *   1. `__DEV__` is false
 *   2. `Platform.OS !== 'web'`
 *   3. `window.__TEST_SCENARIO__` is unset
 *
 * The assertion is that `getDatabase()` is never awaited in any of those
 * states — if it were, production builds could mutate user data.
 */

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
};

const mockGetDatabase = jest.fn().mockResolvedValue(mockDb);

jest.mock("../../../lib/db/helpers", () => ({
  getDatabase: mockGetDatabase,
}));

// Mutable Platform.OS mock; tests flip it between "web" and "ios".
const platformMock = { OS: "web" as string };
jest.mock("react-native", () => ({
  Platform: platformMock,
}));

describe("lib/db/test-seed — guards", () => {
  const realDev = (globalThis as any).__DEV__;
  const originalWindow = (globalThis as any).window;

  beforeEach(() => {
    jest.clearAllMocks();
    platformMock.OS = "web";
    (globalThis as any).__DEV__ = true;
    (globalThis as any).window = { __TEST_SCENARIO__: undefined };
  });

  afterAll(() => {
    (globalThis as any).__DEV__ = realDev;
    (globalThis as any).window = originalWindow;
  });

  test("no-op when __DEV__ is false", async () => {
    (globalThis as any).__DEV__ = false;
    (globalThis as any).window = { __TEST_SCENARIO__: "completed-workout" };
    const { seedScenario } = require("../../../lib/db/test-seed");
    await seedScenario();
    expect(mockGetDatabase).not.toHaveBeenCalled();
  });

  test("no-op when Platform.OS !== 'web'", async () => {
    platformMock.OS = "ios";
    (globalThis as any).window = { __TEST_SCENARIO__: "completed-workout" };
    jest.isolateModules(() => {
      // Re-evaluate module with new Platform.OS
      // (Platform proxy returns current platformMock.OS each call, so a fresh
      // require isn't strictly required — but be explicit for clarity.)
    });
    const { seedScenario } = require("../../../lib/db/test-seed");
    await seedScenario();
    expect(mockGetDatabase).not.toHaveBeenCalled();
  });

  test("no-op when window.__TEST_SCENARIO__ is unset", async () => {
    (globalThis as any).window = {};
    const { seedScenario } = require("../../../lib/db/test-seed");
    await seedScenario();
    expect(mockGetDatabase).not.toHaveBeenCalled();
  });

  test("no-op when window is undefined", async () => {
    (globalThis as any).window = undefined;
    const { seedScenario } = require("../../../lib/db/test-seed");
    await seedScenario();
    expect(mockGetDatabase).not.toHaveBeenCalled();
  });

  test("no-op + warn when scenario is unknown", async () => {
    (globalThis as any).window = { __TEST_SCENARIO__: "bogus-scenario" };
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { seedScenario } = require("../../../lib/db/test-seed");
    await seedScenario();
    expect(mockGetDatabase).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("unknown scenario 'bogus-scenario'"),
    );
    warn.mockRestore();
  });

  test("runs getDatabase when all guards pass (completed-workout)", async () => {
    (globalThis as any).window = { __TEST_SCENARIO__: "completed-workout" };
    // minimal document stub so the test-ready dataset flip doesn't throw
    (globalThis as any).document = { body: { dataset: {} } };
    const { seedScenario } = require("../../../lib/db/test-seed");
    await seedScenario();
    expect(mockGetDatabase).toHaveBeenCalledTimes(1);
    expect(mockDb.execAsync).toHaveBeenCalled();
    expect((globalThis as any).document.body.dataset.testReady).toBe("true");
  });

  test("guardsAllow() returns false on any guard miss", async () => {
    const mod = require("../../../lib/db/test-seed");
    (globalThis as any).window = { __TEST_SCENARIO__: "completed-workout" };
    expect(mod.guardsAllow()).toBe(true);
    platformMock.OS = "android";
    expect(mod.guardsAllow()).toBe(false);
    platformMock.OS = "web";
    (globalThis as any).window = {};
    expect(mod.guardsAllow()).toBe(false);
    (globalThis as any).window = { __TEST_SCENARIO__: "x" };
    (globalThis as any).__DEV__ = false;
    expect(mod.guardsAllow()).toBe(false);
  });
});
