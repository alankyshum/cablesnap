/**
 * BLD-1111: exerciseHasHistoricalRpe predicate tests.
 *
 * Tests the predicate logic that gates the RPE capture discoverability nudge.
 * Uses mocked getDrizzle to return controlled responses.
 *
 * (a) Returns true with one completed non-warmup set with rpe.
 * (b) Returns false when only warmup rows have rpe.
 * (c) Returns false when only incomplete (completed=0) rows have rpe.
 * (d) Returns false for an exercise with no sets.
 * (e) Returns false when all sets have rpe=null.
 * (f) Returns true for a day_session/GTG row with non-null rpe.
 * (g) DB error → returns false AND logs to console.error.
 */

jest.mock("../../../lib/db/helpers", () => ({
  getDrizzle: jest.fn(),
  query: jest.fn(),
  queryOne: jest.fn(),
  getDatabase: jest.fn(),
}));

import { exerciseHasHistoricalRpe } from "../../../lib/db/exercise-history";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const helpers = require("../../../lib/db/helpers") as { getDrizzle: jest.Mock };

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

  it("(b) returns false when only warmup rows have rpe (no matching row)", async () => {
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

  it("(g) returns false and logs to console.error when DB throws", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    helpers.getDrizzle.mockRejectedValue(new Error("DB connection failure"));
    const result = await exerciseHasHistoricalRpe("ex-1");
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[exerciseHasHistoricalRpe]",
      expect.stringContaining("failed for ex-1")
    );
    consoleSpy.mockRestore();
  });
});
