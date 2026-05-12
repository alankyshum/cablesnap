/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BLD-1176 / AC #257 + AC #260: DB-layer CSV export+import tests.
 *
 * BLOCKER 1 (export): verifies getWorkoutCSVData() propagates mini_set_*
 * columns when the drizzle query returns segment-aggregated data.
 *
 * BLOCKER 2 (import): verifies importCsvSessions() binds the parsed
 * set_type (not hardcoded 'normal') and routes segment inserts through
 * bulkInsertSegments() in lib/db/sets.ts (so recomputeSetCaches() runs
 * and cached_volume_kg / cached_e1rm_kg are kept in sync).
 *
 * BLOCKER 3 (cache invariant): verifies importCsvSessions() calls
 * bulkInsertSegments() (not raw SQL) so the architecture invariant holds,
 * and verifies computeSetCacheValues() produces the correct cached column
 * values for the cluster 5+5+4 at 100/100/95 fixture.
 */

// ─── Mock Setup ───────────────────────────────────────────────────────────────

const mockRunAsync = jest.fn().mockResolvedValue({ changes: 1 });
const mockGetFirstAsync = jest.fn().mockResolvedValue(null);
const mockGetAllAsync = jest.fn().mockResolvedValue([]);
const mockWithTransactionAsync = jest.fn(async (cb: () => Promise<void>) => cb());

const mockStmt = {
  executeAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  finalizeAsync: jest.fn().mockResolvedValue(undefined),
};

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: mockGetAllAsync,
  getFirstAsync: mockGetFirstAsync,
  runAsync: mockRunAsync,
  withTransactionAsync: mockWithTransactionAsync,
  prepareAsync: jest.fn().mockResolvedValue(mockStmt),
};

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

// Drizzle mock: select chain is configurable per test via mockSelectResult.
let mockSelectResult: unknown[] = [];

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => ({
    select: jest.fn(() => {
      const chain: any = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        then: (r: any) => Promise.resolve(mockSelectResult).then(r),
      };
      return chain;
    }),
  })),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { getWorkoutCSVData } from "../lib/db/csv";
import { importCsvSessions } from "../lib/db/csv-import";
import * as setsModule from "../lib/db/sets";
import type { ImportedSession } from "../lib/csv-import";
import type { MatchResult } from "../lib/exercise-matcher";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMatchResults(exerciseName: string, exerciseId: string): Map<string, MatchResult> {
  return new Map([
    [
      exerciseName.toLowerCase(),
      {
        rawName: exerciseName,
        bestMatch: { exercise: { id: exerciseId } as any, confidence: "high" as const, score: 1, matchReason: "exact" },
        candidates: [],
        nlpResult: {} as any,
      },
    ],
  ]);
}

// ─── BLOCKER 1: getWorkoutCSVData propagates mini_set_* ──────────────────────

describe("BLOCKER 1 — getWorkoutCSVData propagates mini_set_* columns (AC #257)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWithTransactionAsync.mockImplementation(async (cb: () => Promise<void>) => cb());
  });

  it("passes through mini_set_reps/weights/rests for a rest_pause row", async () => {
    mockSelectResult = [
      {
        date: "2026-01-15",
        exercise: "Cable Row",
        set_number: 1,
        weight: 100,
        reps: 13,
        duration_seconds: null,
        notes: "",
        set_rpe: null,
        set_notes: "",
        link_id: null,
        tempo: null,
        bodyweight_modifier_kg: null,
        pulley_pin: null,
        kind: "workout",
        day_session_exercise_id: null,
        day_session_date: null,
        stack_marker: null,
        stack_name_at_log: null,
        set_type: "rest_pause",
        mini_set_reps: "8;3;2",
        mini_set_weights: ";;",
        mini_set_rests: "15;15;",
      },
    ];

    const rows = await getWorkoutCSVData(0);

    expect(rows).toHaveLength(1);
    expect(rows[0].set_type).toBe("rest_pause");
    expect(rows[0].mini_set_reps).toBe("8;3;2");
    expect(rows[0].mini_set_weights).toBe(";;");
    expect(rows[0].mini_set_rests).toBe("15;15;");
  });

  it("passes through null mini_set_* for a normal set (no segments)", async () => {
    mockSelectResult = [
      {
        date: "2026-01-15",
        exercise: "Bench Press",
        set_number: 1,
        weight: 80,
        reps: 8,
        duration_seconds: null,
        notes: "",
        set_rpe: null,
        set_notes: "",
        link_id: null,
        tempo: null,
        bodyweight_modifier_kg: null,
        pulley_pin: null,
        kind: "workout",
        day_session_exercise_id: null,
        day_session_date: null,
        stack_marker: null,
        stack_name_at_log: null,
        set_type: "normal",
        mini_set_reps: null,
        mini_set_weights: null,
        mini_set_rests: null,
      },
    ];

    const rows = await getWorkoutCSVData(0);

    expect(rows[0].set_type).toBe("normal");
    expect(rows[0].mini_set_reps).toBeNull();
    expect(rows[0].mini_set_weights).toBeNull();
    expect(rows[0].mini_set_rests).toBeNull();
  });

  it("passes through cluster segment data with weight override", async () => {
    mockSelectResult = [
      {
        date: "2026-01-20",
        exercise: "Leg Press",
        set_number: 1,
        weight: 100,
        reps: 14,
        duration_seconds: null,
        notes: "",
        set_rpe: null,
        set_notes: "",
        link_id: null,
        tempo: null,
        bodyweight_modifier_kg: null,
        pulley_pin: null,
        kind: "workout",
        day_session_exercise_id: null,
        day_session_date: null,
        stack_marker: null,
        stack_name_at_log: null,
        set_type: "cluster",
        mini_set_reps: "5;5;4",
        mini_set_weights: ";;95",
        mini_set_rests: "45;45;",
      },
    ];

    const rows = await getWorkoutCSVData(0);

    expect(rows[0].set_type).toBe("cluster");
    expect(rows[0].mini_set_reps).toBe("5;5;4");
    expect(rows[0].mini_set_weights).toBe(";;95");
    expect(rows[0].mini_set_rests).toBe("45;45;");
  });
});

// ─── BLOCKER 2: importCsvSessions persists set_type and set_segments ─────────

describe("BLOCKER 2 — importCsvSessions persists set_type and set_segments (AC #257 + #260)", () => {
  const EXERCISE_ID = "ex-cable-row";

  function makeRestPauseSession(): ImportedSession {
    return {
      date: Date.now(),
      name: "Test Session",
      durationSeconds: 3600,
      sets: [
        {
          exerciseRawName: "Cable Row",
          matchedExerciseId: EXERCISE_ID,
          matchConfidence: "high",
          weight: 100,
          reps: 13,
          setNumber: 1,
          rpe: null,
          durationSeconds: null,
          notes: "",
          set_type: "rest_pause",
          mini_set_reps: "8;3;2",
          mini_set_weights: ";;",
          mini_set_rests: "15;15;",
        },
      ],
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockRunAsync.mockResolvedValue({ changes: 1 });
    mockGetFirstAsync.mockResolvedValue(null); // hasActiveWorkout → no active workout
    mockGetAllAsync.mockResolvedValue([]);
    mockWithTransactionAsync.mockImplementation(async (cb: () => Promise<void>) => cb());
    jest.spyOn(setsModule, "bulkInsertSegments").mockResolvedValue(undefined);
  });

  it("binds parsed set_type (not hardcoded normal) in workout_sets INSERT", async () => {
    const sessions = [makeRestPauseSession()];
    const matchResults = makeMatchResults("Cable Row", EXERCISE_ID);

    await importCsvSessions(sessions, matchResults);

    // Find the INSERT INTO workout_sets call
    const setInsertCall = mockRunAsync.mock.calls.find(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT INTO workout_sets")
    );
    expect(setInsertCall).toBeDefined();

    // The set_type parameter should be 'rest_pause', not 'normal'
    const params = setInsertCall![1] as unknown[];
    const setTypeParam = params[params.length - 1];
    expect(setTypeParam).toBe("rest_pause");
  });

  it("inserts set_segments rows for each parsed mini-set via bulkInsertSegments (BLOCKER 3)", async () => {
    const sessions = [makeRestPauseSession()];
    const matchResults = makeMatchResults("Cable Row", EXERCISE_ID);

    await importCsvSessions(sessions, matchResults);

    // bulkInsertSegments must be called exactly once (one advanced set in the session)
    expect(jest.mocked(setsModule.bulkInsertSegments)).toHaveBeenCalledTimes(1);

    // The second argument is the segments array; rest_pause "8;3;2" → 3 segments
    const [calledSetId, calledSegments] = jest.mocked(setsModule.bulkInsertSegments).mock.calls[0] as [string, any[]];
    expect(typeof calledSetId).toBe("string"); // setId is a UUID string
    expect(calledSegments).toHaveLength(3);

    // Verify segment 1: reps=8, weight=null (inherit parent), rest=15
    expect(calledSegments[0]).toMatchObject({ segmentNumber: 1, reps: 8, weight: null, restAfterSeconds: 15 });
    // Verify segment 2: reps=3, weight=null, rest=15
    expect(calledSegments[1]).toMatchObject({ segmentNumber: 2, reps: 3, weight: null, restAfterSeconds: 15 });
    // Verify segment 3: reps=2, weight=null, rest=null (trailing empty)
    expect(calledSegments[2]).toMatchObject({ segmentNumber: 3, reps: 2, weight: null, restAfterSeconds: null });
  });

  it("inserts no set_segments rows for normal sets", async () => {
    const sessions: ImportedSession[] = [
      {
        date: Date.now(),
        name: "Normal Session",
        durationSeconds: 3600,
        sets: [
          {
            exerciseRawName: "Bench Press",
            matchedExerciseId: "ex-bench",
            matchConfidence: "high",
            weight: 80,
            reps: 8,
            setNumber: 1,
            rpe: null,
            durationSeconds: null,
            notes: "",
            set_type: "normal",
            mini_set_reps: null,
            mini_set_weights: null,
            mini_set_rests: null,
          },
        ],
      },
    ];
    const matchResults = makeMatchResults("Bench Press", "ex-bench");

    await importCsvSessions(sessions, matchResults);

    // bulkInsertSegments must NOT be called for normal sets (no mini_set_reps)
    expect(jest.mocked(setsModule.bulkInsertSegments)).not.toHaveBeenCalled();

    // set_type should still be 'normal' in the workout_sets INSERT
    const setInsertCall = mockRunAsync.mock.calls.find(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT INTO workout_sets")
    );
    const params = setInsertCall![1] as unknown[];
    expect(params[params.length - 1]).toBe("normal");
  });

  it("clamps segments to 8 on import (AC #260)", async () => {
    const sessions: ImportedSession[] = [
      {
        date: Date.now(),
        name: "Over-segment session",
        durationSeconds: 3600,
        sets: [
          {
            exerciseRawName: "Cable Row",
            matchedExerciseId: EXERCISE_ID,
            matchConfidence: "high",
            weight: 100,
            reps: 50,
            setNumber: 1,
            rpe: null,
            durationSeconds: null,
            notes: "",
            set_type: "rest_pause",
            mini_set_reps: "5;5;5;5;5;5;5;5;5;5", // 10 segments — should be clamped to 8
            mini_set_weights: ";;;;;;;;;;",
            mini_set_rests: ";;;;;;;;;;",
          },
        ],
      },
    ];
    const matchResults = makeMatchResults("Cable Row", EXERCISE_ID);

    await importCsvSessions(sessions, matchResults);

    expect(jest.mocked(setsModule.bulkInsertSegments)).toHaveBeenCalledTimes(1);
    const [, calledSegments] = jest.mocked(setsModule.bulkInsertSegments).mock.calls[0] as [string, any[]];
    expect(calledSegments.length).toBeLessThanOrEqual(8);
  });

  it("preserves segment-level weight override (non-null weight on specific segment)", async () => {
    const sessions: ImportedSession[] = [
      {
        date: Date.now(),
        name: "Cluster Session",
        durationSeconds: 3600,
        sets: [
          {
            exerciseRawName: "Leg Press",
            matchedExerciseId: "ex-legpress",
            matchConfidence: "high",
            weight: 100,
            reps: 14,
            setNumber: 1,
            rpe: null,
            durationSeconds: null,
            notes: "",
            set_type: "cluster",
            mini_set_reps: "5;5;4",
            mini_set_weights: ";;95",  // only third segment has weight override
            mini_set_rests: "45;45;",
          },
        ],
      },
    ];
    const matchResults = makeMatchResults("Leg Press", "ex-legpress");

    await importCsvSessions(sessions, matchResults);

    expect(jest.mocked(setsModule.bulkInsertSegments)).toHaveBeenCalledTimes(1);
    const [, calledSegments] = jest.mocked(setsModule.bulkInsertSegments).mock.calls[0] as [string, any[]];
    expect(calledSegments).toHaveLength(3);

    // Third segment should have weight=95
    expect(calledSegments[2]).toMatchObject({ segmentNumber: 3, reps: 4, weight: 95 });
    // First and second segments have no weight override (null = inherit parent)
    expect(calledSegments[0].weight).toBeNull();
    expect(calledSegments[1].weight).toBeNull();
  });
});

// ─── BLOCKER 3: computeSetCacheValues math verification ──────────────────────
//
// Proves that the values recomputeSetCaches() would write to the DB are correct.
// The routing test above (bulkInsertSegments spy) verifies the function IS called;
// this test verifies the MATH is correct so the cached columns will be non-zero
// and accurate after import.

describe("BLOCKER 3 — computeSetCacheValues: cached columns are correct after import (AC #257)", () => {
  it("cluster 5+5+4 at 100/100/95 kg → cachedVolumeKg=1380, cachedE1rmKg≈116.67", () => {
    // Fixture mirrors techlead example: cluster set 5+5+4 at 100/100/95 kg
    // Parent weight=100, segment 3 overrides to 95.
    const result = setsModule.computeSetCacheValues(
      { weight: 100, reps: 14 },
      [
        { reps: 5, weight: null },   // inherits 100 → 5×100 = 500
        { reps: 5, weight: null },   // inherits 100 → 5×100 = 500
        { reps: 4, weight: 95 },     // override 95 → 4×95  = 380
      ]
    );

    // Total volume: 500 + 500 + 380 = 1380
    expect(result.cachedVolumeKg).toBe(1380);
    // e1RM = max(100*(1+5/30), 100*(1+5/30), 95*(1+4/30)) = max(116.67, 116.67, 107.67) ≈ 116.67
    expect(result.cachedE1rmKg).toBeCloseTo(100 * (1 + 5 / 30), 5);
    expect(result.cachedE1rmKg).toBeGreaterThan(0);
    expect(result.totalReps).toBe(14);
  });

  it("rest_pause 8+3+2 at 100 kg (null weights inherit) → cachedVolumeKg=1300", () => {
    const result = setsModule.computeSetCacheValues(
      { weight: 100, reps: 13 },
      [
        { reps: 8, weight: null },  // 8×100 = 800
        { reps: 3, weight: null },  // 3×100 = 300
        { reps: 2, weight: null },  // 2×100 = 200
      ]
    );
    expect(result.cachedVolumeKg).toBe(1300);
    // e1RM = max from reps=8 segment: 100*(1+8/30) ≈ 126.67
    expect(result.cachedE1rmKg).toBeCloseTo(100 * (1 + 8 / 30), 5);
    expect(result.totalReps).toBe(13);
  });

  it("normal set with no segments falls back to parent weight×reps", () => {
    const result = setsModule.computeSetCacheValues({ weight: 80, reps: 8 }, []);
    expect(result.cachedVolumeKg).toBe(640); // 80×8
    expect(result.cachedE1rmKg).toBeCloseTo(80 * (1 + 8 / 30), 5);
    expect(result.totalReps).toBe(8);
  });
});
