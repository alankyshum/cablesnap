/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BLD-1176 / AC #257 + AC #260: DB-layer CSV export+import tests.
 *
 * BLOCKER 1 (export): verifies getWorkoutCSVData() propagates mini_set_*
 * columns when the drizzle query returns segment-aggregated data.
 *
 * BLOCKER 2 (import): verifies importCsvSessions() binds the parsed
 * set_type (not hardcoded 'normal') and inserts workout_set_segments rows.
 *
 * Both test layers use mocked expo-sqlite / drizzle-orm so no real SQLite
 * engine is required — the goal is to pin the DB-level contracts that the
 * format-layer unit tests cannot reach.
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

  it("inserts set_segments rows for each parsed mini-set", async () => {
    const sessions = [makeRestPauseSession()];
    const matchResults = makeMatchResults("Cable Row", EXERCISE_ID);

    await importCsvSessions(sessions, matchResults);

    // Find all INSERT INTO set_segments calls
    const segInserts = mockRunAsync.mock.calls.filter(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT INTO workout_set_segments")
    );
    // rest_pause "8;3;2" → 3 segments
    expect(segInserts).toHaveLength(3);

    // Verify segment_number, reps, weight, rest values
    const seg1 = segInserts[0][1] as unknown[];
    expect(seg1[2]).toBe(1);     // segment_number
    expect(seg1[3]).toBe(8);     // reps
    expect(seg1[4]).toBeNull();  // weight = null (inherit parent)
    expect(seg1[5]).toBe(15);    // rest_after_seconds

    const seg2 = segInserts[1][1] as unknown[];
    expect(seg2[2]).toBe(2);
    expect(seg2[3]).toBe(3);
    expect(seg2[4]).toBeNull();
    expect(seg2[5]).toBe(15);

    const seg3 = segInserts[2][1] as unknown[];
    expect(seg3[2]).toBe(3);
    expect(seg3[3]).toBe(2);
    expect(seg3[4]).toBeNull();
    expect(seg3[5]).toBeNull();  // trailing empty rest → null
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

    const segInserts = mockRunAsync.mock.calls.filter(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT INTO workout_set_segments")
    );
    expect(segInserts).toHaveLength(0);

    // set_type should still be 'normal'
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

    const segInserts = mockRunAsync.mock.calls.filter(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT INTO workout_set_segments")
    );
    expect(segInserts.length).toBeLessThanOrEqual(8);
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

    const segInserts = mockRunAsync.mock.calls.filter(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("INSERT INTO workout_set_segments")
    );
    expect(segInserts).toHaveLength(3);

    // Third segment should have weight=95
    const seg3 = segInserts[2][1] as unknown[];
    expect(seg3[4]).toBe(95); // weight
  });
});
