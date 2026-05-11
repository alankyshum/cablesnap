/**
 * BLD-1158 AC1.1 / AC1.3 / AC1.4 / AC1.6: Tempo inheritance per-path tests.
 *
 * Tests that the correct tempo is resolved when sets are created via:
 *  - addSet() with exerciseDefaultTempo (AC1.1) — verified via return value
 *  - addSetsBatch() with per-seed exerciseDefaultTempo (AC1.3) — verified via prepareAsync call values
 *  - explicit tempo wins over exerciseDefaultTempo (AC1.1 tie-break)
 *  - null is used for duration-mode paths (AC1.6)
 *
 * Strategy: mock lib/db/helpers directly (getDrizzle + withTransaction) to bypass
 * DB initialization (migrate/seed) entirely — same pattern as all other db unit tests.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// --- addSet mocks (getDrizzle() → drizzle object with insert().values()) ---
const mockInsertValues = jest.fn().mockResolvedValue(undefined);
const mockInsert = jest.fn().mockReturnValue({ values: mockInsertValues });
const mockDrizzle = { insert: mockInsert };

// --- addSetsBatch mocks (withTransaction → raw SQLite db.prepareAsync()) ---
const mockExecuteAsync = jest.fn();
const mockFinalizeAsync = jest.fn().mockResolvedValue(undefined);
const mockPrepareAsync = jest.fn().mockResolvedValue({
  executeAsync: mockExecuteAsync,
  finalizeAsync: mockFinalizeAsync,
});
const mockRawDb = { prepareAsync: mockPrepareAsync };

// Mock lib/db/helpers to bypass all DB initialization (migrate, seed, etc.)
jest.mock("../../../lib/db/helpers", () => ({
  getDrizzle: jest.fn(),
  withTransaction: jest.fn(),
  getDatabase: jest.fn(),
  query: jest.fn(),
  queryOne: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();

  // Restore mock implementations after clearAllMocks
  mockInsertValues.mockResolvedValue(undefined);
  mockInsert.mockReturnValue({ values: mockInsertValues });

  mockFinalizeAsync.mockResolvedValue(undefined);
  mockExecuteAsync.mockImplementation(async (values: any[]) => ({ changes: 1, values }));
  mockPrepareAsync.mockResolvedValue({
    executeAsync: mockExecuteAsync,
    finalizeAsync: mockFinalizeAsync,
  });

  const helpers = jest.requireMock("../../../lib/db/helpers");
  helpers.getDrizzle.mockResolvedValue(mockDrizzle);
  helpers.withTransaction.mockImplementation(
    async (fn: (db: any) => Promise<void>) => fn(mockRawDb)
  );
});

import { addSet, addSetsBatch } from "../../../lib/db/session-sets";

// AC1.1 tests check the return value of addSet — tempo is resolved locally and
// included in the returned WorkoutSet object before any DB read.
describe("AC1.1: addSet() — exerciseDefaultTempo inheritance", () => {
  it("uses exerciseDefaultTempo when no explicit tempo is set", async () => {
    const result = await addSet(
      "session-1", "exercise-1", 1,
      null, null,
      null, // explicit tempo = null → fallback to exerciseDefaultTempo
      false, undefined, undefined,
      undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined,
      undefined,
      "3-1-2-0", // exerciseDefaultTempo
    );
    expect(result.tempo).toBe("3-1-2-0");
    // Also verify drizzle insert was called with the resolved tempo
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ tempo: "3-1-2-0" })
    );
  });

  it("uses explicit tempo over exerciseDefaultTempo when both are set", async () => {
    const result = await addSet(
      "session-1", "exercise-1", 1,
      null, null,
      "4-0-2-1", // explicit tempo wins
      false, undefined, undefined,
      undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined,
      undefined,
      "3-1-2-0", // exerciseDefaultTempo (should be ignored)
    );
    expect(result.tempo).toBe("4-0-2-1");
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ tempo: "4-0-2-1" })
    );
  });

  it("inserts null tempo when no tempo and no exerciseDefaultTempo", async () => {
    const result = await addSet("session-1", "exercise-1", 1);
    expect(result.tempo).toBeNull();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ tempo: null })
    );
  });

  it("AC1.6: inserts null tempo for duration-mode path (exerciseDefaultTempo = null)", async () => {
    const result = await addSet(
      "session-1", "exercise-1", 1,
      null, null,
      null, // no explicit tempo
      false, undefined, undefined,
      undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined,
      undefined,
      null, // duration-mode: exerciseDefaultTempo is null
    );
    expect(result.tempo).toBeNull();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ tempo: null })
    );
  });
});

describe("AC1.3: addSetsBatch() — per-seed exerciseDefaultTempo inheritance", () => {
  it("applies exerciseDefaultTempo to each seed that has no explicit tempo", async () => {
    await addSetsBatch([
      {
        sessionId: "s1",
        exerciseId: "e1",
        setNumber: 1,
        exercisePosition: 0,
        exerciseDefaultTempo: "3-1-2-0",
      },
      {
        sessionId: "s1",
        exerciseId: "e1",
        setNumber: 2,
        exercisePosition: 0,
        tempo: "4-0-2-0", // explicit takes precedence
        exerciseDefaultTempo: "3-1-2-0",
      },
      {
        sessionId: "s1",
        exerciseId: "e2",
        setNumber: 1,
        exercisePosition: 1,
        exerciseDefaultTempo: null, // duration-mode: null default
      },
    ]);

    // All three sets should have been inserted via prepareAsync
    expect(mockPrepareAsync).toHaveBeenCalledTimes(1);
    expect(mockExecuteAsync).toHaveBeenCalledTimes(3);

    // Verify per-call values:
    const calls = mockExecuteAsync.mock.calls;
    // Seed 1: no explicit tempo, default "3-1-2-0" → inserted as "3-1-2-0"
    expect(calls[0][0]).toContain("3-1-2-0");
    // Seed 2: explicit "4-0-2-0" wins
    expect(calls[1][0]).toContain("4-0-2-0");
    expect(calls[1][0]).not.toContain("3-1-2-0");
    // Seed 3: null default → null tempo (not "3-1-2-0")
    expect(calls[2][0]).not.toContain("3-1-2-0");
  });
});
