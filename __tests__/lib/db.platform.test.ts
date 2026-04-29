/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BLD-817: split from db.test.ts (47 tests, 9.7s) for worker parallelism.
 * This file covers getDatabase initialisation + web fallback paths.
 * Other splits: db.exercises-templates.test.ts, db.sessions-sets.test.ts,
 * db.nutrition-body.test.ts. See __tests__/helpers/db-test-setup.ts.
 */
import {
  mockDb,
  mockDrizzleDb,
  setupDbTestContext,
} from "../helpers/db-test-setup";

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "test-uuid-1234"),
}));

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => mockDrizzleDb),
}));

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

jest.mock("../../lib/seed", () => ({
  seedExercises: jest.fn(() => []),
}));

const ctx = setupDbTestContext();

describe("getDatabase", () => {
  it("initializes database and runs migrations", async () => {
    const result = await ctx.db.getDatabase();
    expect(result).toBeDefined();
    expect(mockDb.execAsync).toHaveBeenCalled();
  });
});

describe("getDatabase web fallback", () => {
  it("falls back to :memory: on web when OPFS fails", async () => {
    jest.resetModules();

    const failOnce = jest
      .fn()
      .mockRejectedValueOnce(new Error("cannot create file"))
      .mockResolvedValue(mockDb);

    jest.doMock("expo-sqlite", () => ({
      openDatabaseAsync: failOnce,
    }));
    jest.doMock("drizzle-orm/expo-sqlite", () => ({
      drizzle: jest.fn(() => mockDrizzleDb),
    }));
    jest.doMock("react-native", () => ({
      Platform: { OS: "web" },
    }));
    jest.doMock("../../lib/seed", () => ({
      seedExercises: jest.fn(() => []),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbMod = require("../../lib/db");
    const result = await dbMod.getDatabase();

    expect(result).toBe(mockDb);
    expect(failOnce).toHaveBeenCalledTimes(2);
    expect(failOnce).toHaveBeenNthCalledWith(1, "cablesnap.db");
    expect(failOnce).toHaveBeenNthCalledWith(2, ":memory:");
    expect(dbMod.isMemoryFallback()).toBe(true);
  });

  it("throws on non-web platform when open fails", async () => {
    jest.resetModules();

    const fail = jest.fn().mockRejectedValue(new Error("native crash"));

    jest.doMock("expo-sqlite", () => ({
      openDatabaseAsync: fail,
    }));
    jest.doMock("drizzle-orm/expo-sqlite", () => ({
      drizzle: jest.fn(() => mockDrizzleDb),
    }));
    jest.doMock("react-native", () => ({
      Platform: { OS: "android" },
    }));
    jest.doMock("../../lib/seed", () => ({
      seedExercises: jest.fn(() => []),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbMod = require("../../lib/db");
    await expect(dbMod.getDatabase()).rejects.toThrow("native crash");
    expect(fail).toHaveBeenCalledTimes(1);
    expect(dbMod.isMemoryFallback()).toBe(false);
  });
});
