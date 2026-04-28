/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * BLD-682 — Add-set + completion-time prefill behavior:
 *   - AC1: handleAddSet pulls from previous workout when no in-session set
 *   - AC3: silent no-op when no prev-workout history
 *   - AC4: duration mode prefills weight + duration_seconds
 *   - AC6: updateSet failure → row insert succeeds, single console.warn
 *   - AC13: warmup-only prev session → no prefill (filter happens in helper)
 *   - AC15: bodyweight modifier from prev set is NOT carried over (BLD-541 default unchanged)
 *   - AC16: previous-workout getPreviousSetsBatch is NOT consulted when in-session lastWorking exists
 *   - AC18: pristine-row completion writes prefillCandidate before completion mutation
 */

const mockUpdateSet = jest.fn().mockResolvedValue(undefined);
const mockAddSet = jest.fn();
const mockCompleteSet = jest.fn().mockResolvedValue(undefined);
const mockGetLastBodyweightModifier = jest.fn().mockResolvedValue(null);
const mockUpdateSetBodyweightModifier = jest.fn();
const mockGetPreviousSetsBatch = jest.fn().mockResolvedValue({});

jest.mock("../../lib/db", () => ({
  addSet: (...args: any[]) => mockAddSet(...args),
  cancelSession: jest.fn(),
  deleteSet: jest.fn(),
  completeSession: jest.fn(),
  completeSet: (...args: any[]) => mockCompleteSet(...args),
  getRestSecondsForLink: jest.fn(),
  getRestContext: jest.fn(),
  getAppSetting: jest.fn().mockResolvedValue(null),
  uncompleteSet: jest.fn(),
  updateSet: (...args: any[]) => mockUpdateSet(...args),
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
}));

jest.mock("../../lib/db/session-sets", () => ({
  getLastBodyweightModifier: (...args: any[]) => mockGetLastBodyweightModifier(...args),
  updateSetBodyweightModifier: (...args: any[]) => mockUpdateSetBodyweightModifier(...args),
  getPreviousSetsBatch: (...args: any[]) => mockGetPreviousSetsBatch(...args),
}));

jest.mock("../../lib/query", () => ({
  bumpQueryVersion: jest.fn(),
  queryClient: {
    removeQueries: jest.fn(),
    fetchQuery: jest.fn(({ queryFn }: any) => queryFn()),
    invalidateQueries: jest.fn(),
  },
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
  confirmAction: jest.fn(),
}));

jest.mock("../../lib/rest", () => ({
  resolveRestSeconds: jest.fn(),
}));

jest.mock("../../lib/format", () => ({
  formatTime: jest.fn(() => "0:30"),
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

function makeNewSet(overrides: any = {}) {
  return {
    id: "new-set-id",
    session_id: "session-1",
    exercise_id: "ex-1",
    set_number: 1,
    weight: null,
    reps: null,
    completed: false,
    completed_at: null,
    rpe: null,
    notes: "",
    link_id: null,
    round: null,
    tempo: null,
    swapped_from_exercise_id: null,
    set_type: "normal",
    duration_seconds: null,
    exercise_position: 0,
    ...overrides,
  };
}

function makeGroup(overrides: any = {}) {
  return {
    exercise_id: "ex-1",
    name: "Bench",
    link_id: null,
    is_voltra: false,
    is_bodyweight: false,
    trackingMode: "reps" as const,
    equipment: "barbell",
    exercise_position: 0,
    sets: [],
    previousSets: [],
    progressionSuggested: false,
    ...overrides,
  };
}

function makeParams(groups: any[] = []) {
  return {
    id: "session-1",
    groups: groups as any,
    setGroups: jest.fn(),
    modes: {},
    setModes: jest.fn(),
    updateGroupSet: jest.fn(),
    startRest: jest.fn(),
    startRestWithDuration: jest.fn(),
    startRestWithBreakdown: jest.fn(),
    session: { started_at: Date.now() - 1000, name: "Test" },
    showToast: jest.fn(),
    showError: jest.fn(),
    unit: "kg" as const,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 50));

describe("useSessionActions — handleAddSet prev-workout fallback (BLD-682)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddSet.mockResolvedValue(makeNewSet());
    mockGetPreviousSetsBatch.mockResolvedValue({});
    mockGetLastBodyweightModifier.mockResolvedValue(null);
  });

  it("AC1: prefills weight + reps from previous workout when group has no in-session sets", async () => {
    mockGetPreviousSetsBatch.mockResolvedValueOnce({
      "ex-1": [
        { set_number: 1, weight: 100, reps: 8, duration_seconds: null, set_type: "normal", completed: true, rpe: null },
      ],
    });
    const params = makeParams([makeGroup()]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => { await result.current.handleAddSet("ex-1"); });

    expect(mockGetPreviousSetsBatch).toHaveBeenCalledWith(["ex-1"], "session-1");
    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledWith("new-set-id", 100, 8, undefined);
  });

  it("AC3: silent no-op when no in-session AND no prev-workout history", async () => {
    mockGetPreviousSetsBatch.mockResolvedValueOnce({});
    const params = makeParams([makeGroup()]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => { await result.current.handleAddSet("ex-1"); });

    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("AC4: duration mode prefills weight + duration_seconds from prev workout", async () => {
    mockGetPreviousSetsBatch.mockResolvedValueOnce({
      "ex-1": [
        { set_number: 1, weight: 0, reps: null, duration_seconds: 60, set_type: "normal", completed: true, rpe: null },
      ],
    });
    const params = makeParams([makeGroup({ trackingMode: "duration" })]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => { await result.current.handleAddSet("ex-1"); });

    expect(mockUpdateSet).toHaveBeenCalledWith("new-set-id", 0, null, 60);
  });

  it("AC6: updateSet failure during prev-workout prefill → single console.warn, row insert succeeds", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockUpdateSet.mockRejectedValueOnce(new Error("DB locked"));
    mockGetPreviousSetsBatch.mockResolvedValueOnce({
      "ex-1": [
        { set_number: 1, weight: 100, reps: 8, duration_seconds: null, set_type: "normal", completed: true, rpe: null },
      ],
    });
    const params = makeParams([makeGroup()]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => { await result.current.handleAddSet("ex-1"); });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("BLD-682"),
      expect.any(Error),
    );
    // setGroups still appended a blank row
    const setGroupsCall = (params.setGroups as jest.Mock).mock.calls.slice(-1)[0][0];
    const appended = setGroupsCall([makeGroup()])[0].sets.slice(-1)[0];
    expect(appended.weight).toBe(null);
    warnSpy.mockRestore();
  });

  it("AC13: warmup-only prev session → no prefill (warmup filtered by helper, not SQL)", async () => {
    mockGetPreviousSetsBatch.mockResolvedValueOnce({
      "ex-1": [
        { set_number: 1, weight: 45, reps: 5, duration_seconds: null, set_type: "warmup", completed: true, rpe: null },
      ],
    });
    const params = makeParams([makeGroup()]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => { await result.current.handleAddSet("ex-1"); });

    // SQL was queried with the working set_number (=1, the new set's number)
    expect(mockGetPreviousSetsBatch).toHaveBeenCalledTimes(1);
    // … but warmup row is rejected at the helper layer
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("BLOCKER 2026-04-27 (reviewer/techlead/QD): un-completed prior row → no prefill, no updateSet write", async () => {
    // Regression lock: getPreviousSetsBatch returns ALL prior rows
    // including completed=false. handleAddSet MUST filter them out at
    // the consumer layer (lib/db/session-sets.ts:469 stays unchanged so
    // progression detection at useSessionData.ts:200 keeps working).
    mockGetPreviousSetsBatch.mockResolvedValueOnce({
      "ex-1": [
        { set_number: 1, weight: 100, reps: 8, duration_seconds: null, set_type: "normal", completed: false, rpe: null },
      ],
    });
    const params = makeParams([makeGroup()]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => { await result.current.handleAddSet("ex-1"); });

    expect(mockGetPreviousSetsBatch).toHaveBeenCalledTimes(1);
    // Un-completed prior row is rejected: no candidate persistence.
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("AC15: bodyweight modifier prev-set is NOT carried over (BLD-541 default unchanged)", async () => {
    mockAddSet.mockResolvedValueOnce(makeNewSet());
    mockGetLastBodyweightModifier.mockResolvedValueOnce(null);
    mockGetPreviousSetsBatch.mockResolvedValueOnce({
      "ex-1": [
        { set_number: 1, weight: null, reps: 10, duration_seconds: null, set_type: "normal", completed: true, rpe: null },
      ],
    });
    const params = makeParams([makeGroup({ is_bodyweight: true })]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => { await result.current.handleAddSet("ex-1"); });

    expect(mockUpdateSet).toHaveBeenCalledWith("new-set-id", null, 10, undefined);
    // BLD-682 path MUST NOT call updateSetBodyweightModifier itself.
    // (BLD-541 path may call it with the smart-default; here it's null
    // so it should never be called.)
    expect(mockUpdateSetBodyweightModifier).not.toHaveBeenCalled();
  });

  it("AC16: in-session lastWorking present → getPreviousSetsBatch is NEVER called", async () => {
    const group = makeGroup({
      sets: [
        { id: "s1", weight: 80, reps: 5, duration_seconds: null, completed: true, set_type: "normal" },
      ],
    });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => { await result.current.handleAddSet("ex-1"); });

    expect(mockGetPreviousSetsBatch).not.toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith("new-set-id", 80, 5, undefined);
  });
});

describe("useSessionActions — pristine-completion persistence (BLD-682 AC18)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddSet.mockResolvedValue(makeNewSet());
    mockGetPreviousSetsBatch.mockResolvedValue({});
  });

  it("AC18: completing a pristine row with prefillCandidate writes the candidate BEFORE the completion mutation", async () => {
    const params = makeParams([makeGroup({
      sets: [
        {
          id: "s1",
          weight: null,
          reps: null,
          duration_seconds: null,
          completed: false,
          notes: "",
          bodyweight_modifier_kg: null,
          set_type: "normal",
          set_number: 1,
          exercise_id: "ex-1",
          prefillCandidate: { weight: 100, reps: 8, duration_seconds: null },
        },
      ],
    })]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    const setArg = params.groups[0].sets[0];
    await act(async () => { await result.current.handleCheck(setArg); });

    // updateSet called once with the candidate values, BEFORE completeSet
    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledWith("s1", 100, 8, undefined);
    expect(mockCompleteSet).toHaveBeenCalledTimes(1);
    expect(mockCompleteSet).toHaveBeenCalledWith("s1");

    // Mock-call timeline: updateSet must precede completeSet
    const updateOrder = mockUpdateSet.mock.invocationCallOrder[0];
    const completeOrder = mockCompleteSet.mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(completeOrder);
  });

  it("AC18 negative: a row with persisted weight/reps does NOT receive a redundant updateSet on completion", async () => {
    const params = makeParams([makeGroup({
      sets: [
        {
          id: "s2",
          weight: 100,
          reps: 8,
          duration_seconds: null,
          completed: false,
          notes: "",
          bodyweight_modifier_kg: null,
          set_type: "normal",
          set_number: 1,
          exercise_id: "ex-1",
          // No prefillCandidate — row already persisted.
        },
      ],
    })]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    const setArg = params.groups[0].sets[0];
    await act(async () => { await result.current.handleCheck(setArg); });

    // No pre-completion updateSet write.
    expect(mockUpdateSet).not.toHaveBeenCalled();
    expect(mockCompleteSet).toHaveBeenCalledWith("s2");
  });

  it("AC18: pristine row WITHOUT prefillCandidate completes normally (no updateSet)", async () => {
    const params = makeParams([makeGroup({
      sets: [
        {
          id: "s3",
          weight: null,
          reps: null,
          duration_seconds: null,
          completed: false,
          notes: "",
          bodyweight_modifier_kg: null,
          set_type: "normal",
          set_number: 1,
          exercise_id: "ex-1",
          prefillCandidate: null,
        },
      ],
    })]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    const setArg = params.groups[0].sets[0];
    await act(async () => { await result.current.handleCheck(setArg); });

    expect(mockUpdateSet).not.toHaveBeenCalled();
    expect(mockCompleteSet).toHaveBeenCalledWith("s3");
  });
});

describe("useSessionActions — no auto-prefill on session open (BLD-682 AC5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddSet.mockResolvedValue(makeNewSet());
    mockGetPreviousSetsBatch.mockResolvedValue({});
  });

  it("AC5: zero updateSet calls fire on session-open hydration of pristine rows (auto-prefill effect removed)", async () => {
    const params = makeParams([makeGroup({
      previousSets: [
        { weight: 100, reps: 5, duration_seconds: null },
      ],
      sets: [
        { id: "s1", weight: null, reps: null, duration_seconds: null, completed: false, set_type: "normal", notes: "", bodyweight_modifier_kg: null, prefillCandidate: { weight: 100, reps: 5, duration_seconds: null } },
      ],
    })]);
    renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    expect(mockUpdateSet).not.toHaveBeenCalled();
  });
});
