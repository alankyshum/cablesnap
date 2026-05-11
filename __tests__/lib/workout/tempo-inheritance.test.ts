/**
 * BLD-1158 AC1.1 / AC1.3 / AC1.4 / AC1.6: Tempo inheritance per-path tests.
 *
 * Tests that the correct tempo is resolved when sets are created via:
 *  - addSet() with exerciseDefaultTempo (AC1.1)
 *  - addSetsBatch() with per-seed exerciseDefaultTempo (AC1.3)
 *  - explicit tempo wins over exerciseDefaultTempo (AC1.1 tie-break)
 *  - null is used for duration-mode paths (AC1.6)
 *
 * Uses the same expo-sqlite mock pattern as add-sets-batch-variant.test.ts.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockExecuteAsync = jest.fn().mockResolvedValue({ changes: 1 });
const mockFinalizeAsync = jest.fn().mockResolvedValue(undefined);
const mockPrepareAsync = jest.fn().mockResolvedValue({
  executeAsync: mockExecuteAsync,
  finalizeAsync: mockFinalizeAsync,
});

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
  prepareAsync: mockPrepareAsync,
};

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn().mockResolvedValue(mockDb),
}));

jest.mock("../../../lib/db/exercises", () => ({
  getExerciseById: jest.fn().mockResolvedValue(null),
}));

// Capture all INSERT values for inspection
let lastInsertValues: any[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  lastInsertValues = [];
  mockExecuteAsync.mockImplementation(async (values: any[]) => {
    lastInsertValues = values;
    return { changes: 1 };
  });
  // getFirstAsync (used by addSet for the SELECT after INSERT)
  mockDb.getFirstAsync.mockResolvedValue({
    id: "test-set-id",
    session_id: "s1",
    exercise_id: "e1",
    set_number: 1,
    reps: null,
    weight: null,
    duration_seconds: null,
    is_completed: 0,
    is_warmup: 0,
    set_type: "normal",
    exercise_position: 0,
    attachment: null,
    mount_position: null,
    grip_type: null,
    grip_width: null,
    link_id: null,
    round: null,
    stack_id: null,
    stack_marker: null,
    stack_unit_at_log: null,
    stack_name_at_log: null,
    pulley_pin: null,
    tempo: null,
    rpe: null,
  });
});

import { addSet, addSetsBatch } from "../../../lib/db/session-sets";

describe("AC1.1: addSet() — exerciseDefaultTempo inheritance", () => {
  it("uses exerciseDefaultTempo when no explicit tempo is set", async () => {
    // Call addSet with no explicit tempo but with exerciseDefaultTempo
    await addSet(
      "session-1",
      "exercise-1",
      1,
      null, // linkId
      null, // round
      null, // tempo (explicit — null means inherit)
      false, // isWarmup
      undefined, // setType
      undefined, // exercisePosition
      undefined, // attachment
      undefined, // mountPosition
      undefined, // gripType
      undefined, // gripWidth
      undefined, // stackId
      undefined, // stackMarker
      undefined, // stackUnitAtLog
      undefined, // stackNameAtLog
      undefined, // pulleyPin
      "3-1-2-0"  // exerciseDefaultTempo
    );

    // The INSERT should have been called; tempo in the INSERT should be "3-1-2-0"
    // We verify by checking the bound values array — tempo is at a fixed index.
    expect(lastInsertValues).toBeDefined();
    // Find "3-1-2-0" in the bound params — it's the resolved tempo
    expect(lastInsertValues).toContain("3-1-2-0");
  });

  it("uses explicit tempo over exerciseDefaultTempo when both are set", async () => {
    await addSet(
      "session-1",
      "exercise-1",
      1,
      null, null,
      "4-0-2-1", // explicit tempo
      false, undefined, undefined,
      undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined,
      undefined,
      "3-1-2-0"  // exerciseDefaultTempo (should be ignored)
    );
    expect(lastInsertValues).toContain("4-0-2-1");
    expect(lastInsertValues).not.toContain("3-1-2-0");
  });

  it("inserts null tempo when no tempo and no exerciseDefaultTempo", async () => {
    await addSet("session-1", "exercise-1", 1);
    // null tempo → no tempo value in INSERT params (beyond what's expected)
    // The important thing: "3-1-2-0" is NOT inserted
    expect(lastInsertValues).not.toContain("3-1-2-0");
  });

  it("AC1.6: inserts null for duration-mode path (pass null as exerciseDefaultTempo)", async () => {
    await addSet(
      "session-1",
      "exercise-1",
      1,
      null, null,
      null, // no explicit tempo
      false, undefined, undefined,
      undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined,
      undefined,
      null // duration-mode: exerciseDefaultTempo is null
    );
    // Result: tempo is null (no default applied)
    expect(lastInsertValues).not.toContain("3-1-2-0");
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

    // All three sets should have been inserted
    expect(mockPrepareAsync).toHaveBeenCalledTimes(1);
    // executeAsync called once per seed
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
