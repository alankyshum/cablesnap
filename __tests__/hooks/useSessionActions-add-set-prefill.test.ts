/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Tests for in-session Add Set prefill (BLD-655 / GH #374).
 *
 * AC:
 * - Reps-tracking: copies weight + reps from prior working set
 * - Duration-tracking: copies weight + duration_seconds (reps stays null)
 * - Warmup-only group: stays blank (warmup is NOT a valid prefill source)
 * - Source set fully blank: silent no-op (no DB updateSet)
 * - Bodyweight: prefill coexists with bodyweight_modifier smart-default
 * - DB updateSet throws: row remains visible blank, console.warn breadcrumb
 */

const mockUpdateSet = jest.fn().mockResolvedValue(undefined);
const mockAddSet = jest.fn();
const mockAnnounce = jest.fn();
const mockGetLastBodyweightModifier = jest.fn();
const mockUpdateSetBodyweightModifier = jest.fn();
const mockGetPreviousSetsBatch = jest.fn().mockResolvedValue({});

jest.mock("../../lib/db", () => ({
  addSet: (...args: any[]) => mockAddSet(...args),
  cancelSession: jest.fn(),
  deleteSet: jest.fn(),
  completeSession: jest.fn(),
  completeSet: jest.fn(),
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
  AccessibilityInfo: {
    announceForAccessibility: (...args: any[]) => mockAnnounce(...args),
  },
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
    set_number: 2,
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
    updateGroupSet: jest.fn(),
    startRest: jest.fn(),
    startRestWithDuration: jest.fn(),
    startRestWithBreakdown: jest.fn(),
    session: { started_at: Date.now() - 1000, name: "Test" },
    showToast: jest.fn(),
    showError: jest.fn(),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 50));

describe("useSessionActions — handleAddSet in-session prefill (BLD-655)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddSet.mockResolvedValue(makeNewSet());
    mockGetLastBodyweightModifier.mockResolvedValue(null);
  });

  it("reps-tracking: copies weight + reps from last working set", async () => {
    const group = makeGroup({
      sets: [
        { id: "s1", weight: 100, reps: 8, duration_seconds: null, completed: true, set_type: "normal" },
      ],
    });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledWith("new-set-id", 100, 8, undefined);

    // setGroups update applies prefill values
    const setGroupsCall = (params.setGroups as jest.Mock).mock.calls.slice(-1)[0][0];
    const updated = setGroupsCall([group]);
    const appended = updated[0].sets.slice(-1)[0];
    expect(appended.weight).toBe(100);
    expect(appended.reps).toBe(8);
  });

  it("reps incomplete but typed: copies weight=135, reps=null verbatim", async () => {
    const group = makeGroup({
      sets: [
        { id: "s1", weight: 135, reps: null, duration_seconds: null, completed: false, set_type: "normal" },
      ],
    });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    expect(mockUpdateSet).toHaveBeenCalledWith("new-set-id", 135, null, undefined);
  });

  it("duration-tracking: copies weight + duration_seconds (reps stays null)", async () => {
    const group = makeGroup({
      trackingMode: "duration",
      sets: [
        { id: "s1", weight: 0, reps: null, duration_seconds: 30, completed: true, set_type: "normal" },
      ],
    });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    expect(mockUpdateSet).toHaveBeenCalledWith("new-set-id", 0, null, 30);

    const setGroupsCall = (params.setGroups as jest.Mock).mock.calls.slice(-1)[0][0];
    const appended = setGroupsCall([group])[0].sets.slice(-1)[0];
    expect(appended.weight).toBe(0);
    expect(appended.duration_seconds).toBe(30);
    expect(appended.reps).toBe(null);
  });

  it("warmup-only group: stays blank (warmup is NOT a valid prefill source)", async () => {
    const group = makeGroup({
      sets: [
        { id: "w1", weight: 45, reps: 5, duration_seconds: null, completed: true, set_type: "warmup" },
      ],
    });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    expect(mockUpdateSet).not.toHaveBeenCalled();

    const setGroupsCall = (params.setGroups as jest.Mock).mock.calls.slice(-1)[0][0];
    const appended = setGroupsCall([group])[0].sets.slice(-1)[0];
    expect(appended.weight).toBe(null);
    expect(appended.reps).toBe(null);
  });

  it("warmup + working: skips warmup, uses last working", async () => {
    const group = makeGroup({
      sets: [
        { id: "w1", weight: 45, reps: 5, duration_seconds: null, completed: true, set_type: "warmup" },
        { id: "s1", weight: 135, reps: 8, duration_seconds: null, completed: true, set_type: "normal" },
      ],
    });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    expect(mockUpdateSet).toHaveBeenCalledWith("new-set-id", 135, 8, undefined);
  });

  it("source set fully blank: silent no-op (no DB updateSet)", async () => {
    const group = makeGroup({
      sets: [
        { id: "s1", weight: null, reps: null, duration_seconds: null, completed: false, set_type: "normal" },
      ],
    });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("first set being added (group.sets empty), no prev-workout history: silent no-op (BLD-682)", async () => {
    const group = makeGroup({ sets: [] });
    const params = makeParams([group]);
    mockGetPreviousSetsBatch.mockResolvedValueOnce({});
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("bodyweight: prefill (reps) coexists with bodyweight_modifier smart-default in single setGroups update", async () => {
    mockGetLastBodyweightModifier.mockResolvedValue(10);
    const group = makeGroup({
      is_bodyweight: true,
      sets: [
        { id: "s1", weight: null, reps: 12, duration_seconds: null, completed: true, set_type: "normal" },
      ],
    });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    expect(mockUpdateSet).toHaveBeenCalledWith("new-set-id", null, 12, undefined);
    expect(mockUpdateSetBodyweightModifier).toHaveBeenCalledWith("new-set-id", 10);

    // Single setGroups invocation that contains BOTH prefill values AND modifier
    const setGroupsCalls = (params.setGroups as jest.Mock).mock.calls;
    expect(setGroupsCalls).toHaveLength(1);
    const appended = setGroupsCalls[0][0]([group])[0].sets.slice(-1)[0];
    expect(appended.reps).toBe(12);
    expect(appended.bodyweight_modifier_kg).toBe(10);
  });

  it("DB updateSet throws: row remains visible blank, console.warn breadcrumb (no throw)", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockUpdateSet.mockRejectedValueOnce(new Error("DB locked"));

    const group = makeGroup({
      sets: [
        { id: "s1", weight: 100, reps: 8, duration_seconds: null, completed: true, set_type: "normal" },
      ],
    });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("BLD-682"),
      expect.any(Error)
    );

    // Local state shows blank (not 100/8) since persistence failed
    const setGroupsCall = (params.setGroups as jest.Mock).mock.calls.slice(-1)[0][0];
    const appended = setGroupsCall([group])[0].sets.slice(-1)[0];
    expect(appended.weight).toBe(null);
    expect(appended.reps).toBe(null);

    warnSpy.mockRestore();
  });
});
