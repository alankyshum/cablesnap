/**
 * BLD-1111: exerciseHasHistoricalRpe predicate tests.
 *
 * Tests the predicate logic that gates the RPE capture discoverability nudge.
 * Uses mocked getDrizzle to return controlled responses.
 *
 * (a) Returns true with one completed non-warmup set with rpe.
 * (b) Returns false when DB query finds no matching completed set with rpe
 *     (warmup filter removed per AC5 — predicate is completed=1 AND rpe IS NOT NULL).
 * (c) Returns false when only incomplete (completed=0) rows have rpe.
 * (d) Returns false for an exercise with no sets.
 * (e) Returns false when all sets have rpe=null.
 * (f) Returns true for a day_session/GTG row with non-null rpe.
 * (g) DB error → returns false AND attempts error_log insert.
 */

jest.mock("../../../lib/db/helpers", () => ({
  getDrizzle: jest.fn(),
  query: jest.fn(),
  queryOne: jest.fn(),
  getDatabase: jest.fn(),
}));

jest.mock("../../../lib/uuid", () => ({
  uuid: jest.fn(() => "test-error-uuid"),
}));

import { exerciseHasHistoricalRpe } from "../../../lib/db/exercise-history";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const helpers = require("../../../lib/db/helpers") as { getDrizzle: jest.Mock; getDatabase: jest.Mock };

function setupChain(row: Record<string, unknown> | undefined) {
  const mockGet = jest.fn().mockResolvedValue(row);
  const mockLimit = jest.fn().mockReturnValue({ get: mockGet });
  const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = jest.fn().mockReturnValue({ from: mockFrom });
  helpers.getDrizzle.mockResolvedValue({ select: mockSelect });
}

describe("exerciseHasHistoricalRpe", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("(a) returns true when one completed normal set has rpe", async () => {
    setupChain({ one: 1 });
    expect(await exerciseHasHistoricalRpe("ex-1")).toBe(true);
  });

  it("(b) returns false when DB finds no completed set with rpe (warmup filter removed per AC5)", async () => {
    setupChain(undefined);
    expect(await exerciseHasHistoricalRpe("ex-1")).toBe(false);
  });

  it("(c) returns false when only incomplete rows have rpe (no matching row)", async () => {
    setupChain(undefined);
    expect(await exerciseHasHistoricalRpe("ex-1")).toBe(false);
  });

  it("(d) returns false for an exercise with no sets", async () => {
    setupChain(undefined);
    expect(await exerciseHasHistoricalRpe("ex-unknown")).toBe(false);
  });

  it("(e) returns false when all sets have rpe=null", async () => {
    setupChain(undefined);
    expect(await exerciseHasHistoricalRpe("ex-1")).toBe(false);
  });

  it("(f) returns true for a day_session/GTG row with non-null rpe", async () => {
    // GTG sets with rpe DO count — predicate does not filter by session kind
    setupChain({ one: 1 });
    expect(await exerciseHasHistoricalRpe("ex-1")).toBe(true);
  });

  it("(g) returns false and attempts error_log insert when DB throws", async () => {
    const mockRunAsync = jest.fn().mockResolvedValue(undefined);
    helpers.getDrizzle.mockRejectedValue(new Error("DB connection failure"));
    helpers.getDatabase.mockResolvedValue({ runAsync: mockRunAsync });
    const result = await exerciseHasHistoricalRpe("ex-1");
    expect(result).toBe(false);
    expect(helpers.getDatabase).toHaveBeenCalled();
    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO error_log"),
      expect.arrayContaining([
        "test-error-uuid",
        expect.stringContaining("exerciseHasHistoricalRpe failed for ex-1"),
        "exerciseHasHistoricalRpe",
        0,
        expect.any(Number),
      ])
    );
  });
});
