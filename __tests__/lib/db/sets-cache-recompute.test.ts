/**
 * BLD-1170 regression tests: recomputeSetCaches() must update cached_volume_kg
 * and cached_e1rm_kg for ALL set types (including normal/legacy sets with no segments).
 *
 * Prior to this fix, recomputeSetCaches() returned early for non-advanced sets
 * with no segments, leaving cached columns stale after weight/reps edits.
 *
 * Tests:
 *   1. Editing weight/reps on a normal set updates both cached columns.
 *   2. Changing set_type advanced → normal clears cached values to legacy formula.
 */
import {
  MOCK_UUID,
  mockDb,
  mockDrizzleDb,
  mockDrizzleAll,
  mockDrizzleGet,
  setupDbTestContext,
} from "../../helpers/db-test-setup";

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => MOCK_UUID),
}));

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => mockDrizzleDb),
}));

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

jest.mock("../../../lib/seed", () => ({
  seedExercises: jest.fn(() => []),
}));

const ctx = setupDbTestContext();

describe("recomputeSetCaches — normal (non-advanced) set cache update (BLD-1170)", () => {
  it("updates cached_volume_kg and cached_e1rm_kg when weight/reps change on a normal set", async () => {
    await ctx.initDb();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { recomputeSetCaches } = require("../../../lib/db/sets");

    const weight = 100;
    const reps = 5;
    // Parent set: normal type, no segments.
    mockDrizzleGet({ id: "set1", weight, reps, set_type: "normal" });
    // No segments.
    mockDrizzleAll([]);

    await recomputeSetCaches("set1");

    // Verify db.update was called (recompute must not return early).
    expect(mockDrizzleDb.update).toHaveBeenCalled();

    const setMock = mockDrizzleDb.update.mock.results.at(-1)?.value.set;
    const callArg = setMock?.mock.calls.at(-1)?.[0];

    // Both cache columns must be written with the legacy formula values.
    const expectedVolume = weight * reps;           // 500
    const expectedE1rm = weight * (1 + reps / 30); // ≈ 116.67
    expect(callArg?.cached_volume_kg).toBeCloseTo(expectedVolume, 4);
    expect(callArg?.cached_e1rm_kg).toBeCloseTo(expectedE1rm, 4);

    // reps column must NOT be overwritten for a legacy set
    // (totalReps = parent.reps ?? 0 could coerce null→0 for incomplete sets).
    expect(callArg).not.toHaveProperty("reps");
  });

  it("updates cached_volume_kg = 0 / cached_e1rm_kg = 0 when reps is null on a normal set", async () => {
    await ctx.initDb();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { recomputeSetCaches } = require("../../../lib/db/sets");

    mockDrizzleGet({ id: "set2", weight: 80, reps: null, set_type: "normal" });
    mockDrizzleAll([]);

    await recomputeSetCaches("set2");

    const setMock = mockDrizzleDb.update.mock.results.at(-1)?.value.set;
    const callArg = setMock?.mock.calls.at(-1)?.[0];

    // weight×null = 0 volume, 0 e1rm (reps === 0 → no e1rm).
    expect(callArg?.cached_volume_kg).toBe(0);
    expect(callArg?.cached_e1rm_kg).toBe(0);
    expect(callArg).not.toHaveProperty("reps");
  });
});

describe("recomputeSetCaches — advanced → normal type change (BLD-1170)", () => {
  it("writes legacy-formula cache values after advanced set reverts to normal (no stale advanced caches)", async () => {
    await ctx.initDb();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { recomputeSetCaches } = require("../../../lib/db/sets");

    // After updateSetTypeAndRecompute deletes segments and updates set_type,
    // the parent row now has set_type='normal' and no segments.
    const weight = 120;
    const reps = 3;
    mockDrizzleGet({ id: "set3", weight, reps, set_type: "normal" });
    mockDrizzleAll([]); // segments deleted by updateSetTypeAndRecompute

    await recomputeSetCaches("set3");

    const setMock = mockDrizzleDb.update.mock.results.at(-1)?.value.set;
    const callArg = setMock?.mock.calls.at(-1)?.[0];

    // Must recompute from parent weight×reps, not retain stale advanced-segment values.
    const expectedVolume = weight * reps;           // 360
    const expectedE1rm = weight * (1 + reps / 30); // ≈ 132
    expect(callArg?.cached_volume_kg).toBeCloseTo(expectedVolume, 4);
    expect(callArg?.cached_e1rm_kg).toBeCloseTo(expectedE1rm, 4);
    expect(callArg).not.toHaveProperty("reps");
  });

  it("writes zero caches after advanced set reverts to warmup and has null reps", async () => {
    await ctx.initDb();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { recomputeSetCaches } = require("../../../lib/db/sets");

    mockDrizzleGet({ id: "set4", weight: 60, reps: null, set_type: "warmup" });
    mockDrizzleAll([]);

    await recomputeSetCaches("set4");

    const setMock = mockDrizzleDb.update.mock.results.at(-1)?.value.set;
    const callArg = setMock?.mock.calls.at(-1)?.[0];

    expect(callArg?.cached_volume_kg).toBe(0);
    expect(callArg?.cached_e1rm_kg).toBe(0);
    expect(callArg).not.toHaveProperty("reps");
  });
});
