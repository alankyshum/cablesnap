/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * BLD-1128 — Stack marker optimistic save paths: rollback completeness tests.
 *
 * Tests two defects fixed in hooks/useSessionActions.ts:
 * 1. handleMarkerConfirm: failure path must restore ALL six fields
 *    (weight, reps, stack_id, stack_marker, stack_name_at_log, stack_unit_at_log).
 * 2. handleManualWeightSave: failure path had NO rollback — must restore ALL six fields.
 *
 * [test: __tests__/hooks/useSessionActions-stackmarker-rollback.test.ts]
 */

const mockUpdateSetStackMarker = jest.fn();
const mockUpdateSetManualWeight = jest.fn();

jest.mock("../../lib/db", () => ({
  addSet: jest.fn(),
  cancelSession: jest.fn(),
  deleteSet: jest.fn(),
  completeSession: jest.fn().mockResolvedValue(undefined),
  completeSet: jest.fn(),
  getRestSecondsForLink: jest.fn(),
  getRestContext: jest.fn(),
  getAppSetting: jest.fn().mockResolvedValue(null),
  uncompleteSet: jest.fn(),
  updateSet: jest.fn(),
  updateSetRPE: jest.fn(),
  updateSetNotes: jest.fn(),
  getSessionSets: jest.fn().mockResolvedValue([]),
  updateSetDuration: jest.fn(),
  checkSetPR: jest.fn().mockResolvedValue(null),
  checkSetBodyweightModifierPR: jest.fn().mockResolvedValue(null),
  updateExercisePositions: jest.fn(),
  getGoalForExercise: jest.fn().mockResolvedValue(null),
  achieveGoal: jest.fn(),
  getCurrentBestWeight: jest.fn(),
  updateExerciseNote: jest.fn().mockResolvedValue(undefined),
  dismissExerciseBackfill: jest.fn().mockResolvedValue(undefined),
  getExerciseBackfillCandidate: jest.fn().mockResolvedValue(null),
}));

jest.mock("../../lib/db/session-sets", () => ({
  getLastBodyweightModifier: jest.fn().mockResolvedValue(null),
  updateSetBodyweightModifier: jest.fn(),
  getPreviousSetsBatch: jest.fn().mockResolvedValue({}),
  getRecentVariantHistory: jest.fn().mockResolvedValue([]),
  updateSetVariant: jest.fn(),
  getRecentBodyweightGripHistory: jest.fn().mockResolvedValue([]),
  updateSetBodyweightVariant: jest.fn(),
  updateSetsBatch: jest.fn(),
  updateSetStackMarker: (...args: any[]) => mockUpdateSetStackMarker(...args),
  updateSetManualWeight: (...args: any[]) => mockUpdateSetManualWeight(...args),
  getRecentStackHistory: jest.fn().mockResolvedValue([]),
  updateSetRepsAndDuration: jest.fn(),
}));

jest.mock("../../lib/query", () => ({
  bumpQueryVersion: jest.fn(),
  queryClient: { removeQueries: jest.fn(), invalidateQueries: jest.fn() },
}));

jest.mock("../../lib/programs", () => ({
  getSessionProgramDayId: jest.fn().mockResolvedValue(null),
  getProgramDayById: jest.fn(),
  advanceProgram: jest.fn(),
}));

jest.mock("../../lib/strava", () => ({
  syncSessionToStrava: jest.fn().mockResolvedValue(false),
}));

jest.mock("../../lib/health-connect", () => ({
  syncToHealthConnect: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light" },
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../lib/confirm", () => ({
  confirmAction: jest.fn((_title: string, _msg: string, cb: () => Promise<void>) => cb()),
}));

jest.mock("../../lib/rest", () => ({
  resolveRestSeconds: jest.fn(),
}));

jest.mock("../../lib/format", () => ({
  formatTime: jest.fn(() => "0:00"),
  computePrefillSets: jest.fn(() => []),
}));

jest.mock("react-native", () => ({
  AccessibilityInfo: { announceForAccessibility: jest.fn() },
  Keyboard: { dismiss: jest.fn() },
  Platform: { OS: "ios" },
  AppState: {
    currentState: "active",
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

import { renderHook, act } from "@testing-library/react-native";
import { useSessionActions } from "../../hooks/useSessionActions";

/** Minimal set row with all six fields that BLD-1128 rollback must cover. */
function makeSet(overrides: any = {}): any {
  return {
    id: "set-1",
    weight: null,
    reps: null,
    stack_id: null,
    stack_marker: null,
    stack_name_at_log: null,
    stack_unit_at_log: null,
    completed: false,
    completed_at: null,
    set_number: 1,
    exercise_id: "ex-1",
    session_id: "session-1",
    rpe: null,
    notes: null,
    duration_seconds: null,
    ...overrides,
  };
}

function makeGroup(sets: any[] = [], overrides: any = {}): any {
  return {
    exercise_id: "ex-1",
    name: "Cable Row",
    link_id: null,
    is_voltra: true,
    is_bodyweight: false,
    trackingMode: "reps" as const,
    equipment: "cable",
    exercise_position: 0,
    exerciseCategory: null,
    sets,
    previousSets: [],
    progressionSuggested: false,
    pinnedNote: null,
    pinnedNoteBackfill: null,
    ...overrides,
  };
}

function makeParams(groups: any[], overrides: any = {}): any {
  const updateGroupSet = jest.fn();
  return {
    id: "session-1",
    groups,
    setGroups: jest.fn(),
    updateGroupSet,
    startRest: jest.fn(),
    startRestWithDuration: jest.fn(),
    startRestWithBreakdown: jest.fn(),
    dismissRest: jest.fn(),
    session: { started_at: Date.now(), name: "Cable Session", gym_id: "gym-1" },
    showToast: jest.fn(),
    showError: jest.fn(),
    ...overrides,
  };
}

// ─── Defect 1: handleMarkerConfirm rollback ─────────────────────────────────
describe("BLD-1128 — handleMarkerConfirm: full rollback on persist failure", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("AC1: restores all six fields (including weight) when updateSetStackMarker rejects", async () => {
    // Prior state: pristine row (all null)
    const priorSet = makeSet({
      id: "set-1",
      weight: null,
      reps: null,
      stack_id: null,
      stack_marker: null,
      stack_name_at_log: null,
      stack_unit_at_log: null,
    });
    const groups = [makeGroup([priorSet])];
    const params = makeParams(groups);

    // DB write fails
    mockUpdateSetStackMarker.mockRejectedValueOnce(new Error("DB error"));

    const { result } = renderHook(() => useSessionActions(params));

    await act(async () => {
      await result.current.handleMarkerConfirm("set-1", {
        stackId: "stack-1",
        stackName: "Home Stack",
        marker: 6,
        trueWeight: 60,
        unit: "kg",
      });
    });

    const { updateGroupSet, showError } = params;

    // First call: optimistic write with new marker values
    expect(updateGroupSet).toHaveBeenNthCalledWith(1, "set-1", {
      stack_id: "stack-1",
      stack_name_at_log: "Home Stack",
      stack_marker: 6,
      stack_unit_at_log: "kg",
      weight: 60,
    });

    // Second call: rollback — must restore ALL six fields including weight
    expect(updateGroupSet).toHaveBeenNthCalledWith(2, "set-1", {
      weight: null,
      reps: null,
      stack_id: null,
      stack_name_at_log: null,
      stack_marker: null,
      stack_unit_at_log: null,
    });

    // User-facing toast must still fire
    expect(showError).toHaveBeenCalledWith("Failed to save stack marker");
  });

  it("AC1 (marker row): restores previous marker state when confirm on marker-logged row fails", async () => {
    // Prior state: already marker-logged with different values
    const priorSet = makeSet({
      id: "set-1",
      weight: 40,
      reps: 10,
      stack_id: "old-stack",
      stack_marker: 4,
      stack_name_at_log: "Old Stack",
      stack_unit_at_log: "kg",
    });
    const groups = [makeGroup([priorSet])];
    const params = makeParams(groups);

    mockUpdateSetStackMarker.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useSessionActions(params));

    await act(async () => {
      await result.current.handleMarkerConfirm("set-1", {
        stackId: "new-stack",
        stackName: "New Stack",
        marker: 8,
        trueWeight: 80,
        unit: "kg",
      });
    });

    const { updateGroupSet } = params;

    // Rollback must restore the OLD marker values
    expect(updateGroupSet).toHaveBeenNthCalledWith(2, "set-1", {
      weight: 40,
      reps: 10,
      stack_id: "old-stack",
      stack_name_at_log: "Old Stack",
      stack_marker: 4,
      stack_unit_at_log: "kg",
    });
  });
});

// ─── Defect 2: handleManualWeightSave rollback ──────────────────────────────
describe("BLD-1128 — handleManualWeightSave: rollback added (was missing)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("AC2: restores all six fields when updateSetManualWeight rejects (marker-logged prior row)", async () => {
    // Prior state: marker-logged row
    const priorSet = makeSet({
      id: "set-1",
      weight: 60,
      reps: 8,
      stack_id: "stack-1",
      stack_marker: 6,
      stack_name_at_log: "Home Stack",
      stack_unit_at_log: "kg",
    });
    const groups = [makeGroup([priorSet])];
    const params = makeParams(groups);

    // DB write fails
    mockUpdateSetManualWeight.mockRejectedValueOnce(new Error("DB timeout"));

    const { result } = renderHook(() => useSessionActions(params));

    await act(async () => {
      await result.current.handleManualWeightSave("set-1", 40, 8);
    });

    const { updateGroupSet, showError } = params;

    // First call: optimistic write (clear stack fields, apply manual weight)
    expect(updateGroupSet).toHaveBeenNthCalledWith(1, "set-1", {
      weight: 40,
      reps: 8,
      stack_id: null,
      stack_marker: null,
      stack_name_at_log: null,
      stack_unit_at_log: null,
    });

    // Second call: rollback — must restore ALL six fields (stack_* columns + weight/reps)
    expect(updateGroupSet).toHaveBeenNthCalledWith(2, "set-1", {
      weight: 60,
      reps: 8,
      stack_id: "stack-1",
      stack_name_at_log: "Home Stack",
      stack_marker: 6,
      stack_unit_at_log: "kg",
    });

    // User-facing toast must still fire
    expect(showError).toHaveBeenCalledWith("Failed to save weight");
  });

  it("AC2 (pristine row): restores all-null state when manual save fails on pristine row", async () => {
    // Prior state: pristine row
    const priorSet = makeSet({
      id: "set-1",
      weight: null,
      reps: null,
      stack_id: null,
      stack_marker: null,
      stack_name_at_log: null,
      stack_unit_at_log: null,
    });
    const groups = [makeGroup([priorSet])];
    const params = makeParams(groups);

    mockUpdateSetManualWeight.mockRejectedValueOnce(new Error("write failed"));

    const { result } = renderHook(() => useSessionActions(params));

    await act(async () => {
      await result.current.handleManualWeightSave("set-1", 50, 5);
    });

    const { updateGroupSet } = params;

    // Rollback must restore all-null prior state
    expect(updateGroupSet).toHaveBeenNthCalledWith(2, "set-1", {
      weight: null,
      reps: null,
      stack_id: null,
      stack_name_at_log: null,
      stack_marker: null,
      stack_unit_at_log: null,
    });
  });
});
