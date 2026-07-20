/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Tests for unilateral Add Set prefill parity (BLD-3445 / gap #1).
 */

const mockUpdateSet = jest.fn().mockResolvedValue(undefined);
const mockAddSet = jest.fn();
const mockAnnounce = jest.fn();
const mockGetLastBodyweightModifier = jest.fn();
const mockUpdateSetBodyweightModifier = jest.fn();
const mockGetPreviousSetsBatch = jest.fn().mockResolvedValue({});
const mockUpdateSetStackMarker = jest.fn().mockResolvedValue(undefined);
const mockGetRecentStackHistory = jest.fn();
const mockFetchStacks = jest.fn();
const mockFetchQuery = jest.fn();
const mockUpdateSetRepsAndDuration = jest.fn().mockResolvedValue(undefined);
const mockGetRecentVariantHistory = jest.fn();
const mockUpdateSetVariant = jest.fn();
const mockGetRecentBodyweightGripHistory = jest.fn();
const mockUpdateSetBodyweightVariant = jest.fn();

jest.mock("../../hooks/useActiveCalibration", () => ({
  fetchStacksWithCalibrations: (...args: any[]) => mockFetchStacks(...args),
  useActiveCalibration: jest.fn(() => []),
}));

jest.mock("@/hooks/useActiveCalibration", () => ({
  fetchStacksWithCalibrations: (...args: any[]) => mockFetchStacks(...args),
  useActiveCalibration: jest.fn(() => []),
}));

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
  getRecentVariantHistory: (...args: any[]) => mockGetRecentVariantHistory(...args),
  updateSetVariant: (...args: any[]) => mockUpdateSetVariant(...args),
  getRecentBodyweightGripHistory: (...args: any[]) => mockGetRecentBodyweightGripHistory(...args),
  updateSetBodyweightVariant: (...args: any[]) => mockUpdateSetBodyweightVariant(...args),
  updateSetStackMarker: (...args: any[]) => mockUpdateSetStackMarker(...args),
  getRecentStackHistory: (...args: any[]) => mockGetRecentStackHistory(...args),
  updateSetRepsAndDuration: (...args: any[]) => mockUpdateSetRepsAndDuration(...args),
}));

jest.mock("../../lib/query", () => ({
  bumpQueryVersion: jest.fn(),
  queryClient: {
    removeQueries: jest.fn(),
    fetchQuery: (...args: any[]) => mockFetchQuery(...args),
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

jest.mock("@/components/ui/bna-toast", () => ({
  useToast: () => ({
    warning: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }),
}));

import { renderHook, act } from "@testing-library/react-native";
import { useSessionActions } from "../../hooks/useSessionActions";

function makeNewSet(overrides: any = {}) {
  return {
    id: "new-left-set-id",
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
    side: "left",
    ...overrides,
  };
}

function makeGroup(overrides: any = {}) {
  return {
    exercise_id: "ex-1",
    name: "Unilateral Dumbbell Row",
    link_id: null,
    is_voltra: false,
    is_bodyweight: false,
    track_unilateral: true,
    trackingMode: "reps" as const,
    equipment: "dumbbell",
    exercise_position: 0,
    sets: [],
    previousSets: [],
    progressionSuggested: false,
    ...overrides,
  };
}

function makeParams(groups: any[] = [], overrides: any = {}) {
  return {
    id: "session-1",
    groups: groups as any,
    setGroups: jest.fn(),
    updateGroupSet: jest.fn(),
    startRest: jest.fn(),
    startRestWithDuration: jest.fn(),
    startRestWithBreakdown: jest.fn(),
    dismissRest: jest.fn(),
    session: { started_at: Date.now() - 1000, name: "Test", gym_id: "gym-1" },
    showToast: jest.fn(),
    showError: jest.fn(),
    ...overrides,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 50));

describe("useSessionActions — unilateral handleAddSet prefill parity (BLD-3445)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddSet.mockResolvedValue(makeNewSet());
    mockGetLastBodyweightModifier.mockResolvedValue(null);
    mockGetPreviousSetsBatch.mockResolvedValue({});
    mockFetchQuery.mockImplementation(async ({ queryFn }: any) => queryFn());
    mockGetRecentVariantHistory.mockResolvedValue([]);
    mockGetRecentBodyweightGripHistory.mockResolvedValue([]);
    mockUpdateSetVariant.mockResolvedValue(undefined);
    mockUpdateSetBodyweightVariant.mockResolvedValue(undefined);
  });

  it("unilateral reps-tracking: copies weight + reps from last in-session working left set", async () => {
    const group = makeGroup({
      sets: [
        {
          id: "s1",
          set_number: 1,
          set_type: "normal",
          left: { id: "s1-l", weight: 40, reps: 10, duration_seconds: null, completed: true, set_type: "normal" },
          right: { id: "s1-r", weight: 40, reps: 10, duration_seconds: null, completed: true, set_type: "normal" },
        },
      ],
    });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledWith("new-left-set-id", 40, 10, undefined);

    const setGroupsCall = (params.setGroups as jest.Mock).mock.calls.slice(-1)[0][0];
    const updated = setGroupsCall([group]);
    const appended = updated[0].sets.slice(-1)[0];
    expect(appended.weight).toBe(40);
    expect(appended.reps).toBe(10);
  });

  it("unilateral previous-workout fallback: copies from matching left set of previous workout when no in-session working exists", async () => {
    const group = makeGroup({
      sets: [],
    });
    const params = makeParams([group]);

    mockGetPreviousSetsBatch.mockResolvedValueOnce({
      "ex-1": [
        { set_number: 1, weight: 45, reps: 8, duration_seconds: null, set_type: "normal", completed: true, side: "left" },
        { set_number: 1, weight: 45, reps: 8, duration_seconds: null, set_type: "normal", completed: true, side: "right" },
      ],
    });

    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    expect(mockGetPreviousSetsBatch).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledWith("new-left-set-id", 45, 8, undefined);

    const setGroupsCall = (params.setGroups as jest.Mock).mock.calls.slice(-1)[0][0];
    const updated = setGroupsCall([group]);
    const appended = updated[0].sets.slice(-1)[0];
    expect(appended.weight).toBe(45);
    expect(appended.reps).toBe(8);
  });

  it("unilateral warmup-only: silent no-op (no prefill)", async () => {
    const group = makeGroup({
      sets: [
        {
          id: "s1",
          set_number: 1,
          set_type: "warmup",
          left: { id: "s1-l", weight: 20, reps: 10, duration_seconds: null, completed: true, set_type: "warmup" },
        },
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

  it("unilateral AC16 parity short-circuit: getPreviousSetsBatch is NOT invoked when in-session non-warmup working left set exists", async () => {
    const group = makeGroup({
      sets: [
        {
          id: "s1",
          set_number: 1,
          set_type: "normal",
          left: { id: "s1-l", weight: 50, reps: 10, completed: true, set_type: "normal" },
        },
      ],
    });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    expect(mockGetPreviousSetsBatch).not.toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith("new-left-set-id", 50, 10, undefined);
  });

  it("unilateral marker/stack-weight ownership: uses updateSetRepsAndDuration path (reps/duration only) when autofilledStackWeight is non-null", async () => {
    mockFetchStacks.mockResolvedValue([
      {
        id: "stack-1",
        name: "Stack",
        unit: "lbs",
        calibrations: [{ marker: 4, true_weight: 40 }],
      },
    ]);
    mockGetRecentStackHistory.mockResolvedValue({ stack_id: "stack-1", stack_marker: 4 });

    const group = makeGroup({
      equipment: "cable",
      sets: [
        {
          id: "s1",
          set_number: 1,
          set_type: "normal",
          left: { id: "s1-l", weight: 30, reps: 12, completed: true, set_type: "normal" },
        },
      ],
    });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    // Verify stack marker was registered on the new left set
    expect(mockUpdateSetStackMarker).toHaveBeenCalledWith("new-left-set-id", {
      weight: 40,
      marker: 4,
      stackId: "stack-1",
      stackName: "Stack",
      stackUnit: "lbs",
    });

    // Verification of reps/duration-only write path (since marker autofill owns weight)
    expect(mockUpdateSetRepsAndDuration).toHaveBeenCalledWith("new-left-set-id", 12, undefined);
    expect(mockUpdateSet).not.toHaveBeenCalled();

    const setGroupsCall = (params.setGroups as jest.Mock).mock.calls.slice(-1)[0][0];
    const updated = setGroupsCall([group]);
    const appended = updated[0].sets.slice(-1)[0];
    expect(appended.weight).toBe(40); // Populated with stack weight
    expect(appended.reps).toBe(12); // Populated with prefill reps
  });

  it("unilateral BW-modifier non-copy: bodyweight_modifier_kg is NOT copied from prefill source", async () => {
    const group = makeGroup({
      is_bodyweight: true,
      sets: [
        {
          id: "s1",
          set_number: 1,
          set_type: "normal",
          left: { id: "s1-l", weight: null, reps: 8, bodyweight_modifier_kg: 10, completed: true, set_type: "normal" },
        },
      ],
    });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    expect(mockUpdateSet).toHaveBeenCalledWith("new-left-set-id", null, 8, undefined);

    const setGroupsCall = (params.setGroups as jest.Mock).mock.calls.slice(-1)[0][0];
    const updated = setGroupsCall([group]);
    const appended = updated[0].sets.slice(-1)[0];
    expect(appended.bodyweight_modifier_kg).toBeNull(); // Or null, not 10
  });

  it("unilateral duration-mode: copies duration_seconds instead of reps", async () => {
    const group = makeGroup({
      trackingMode: "duration",
      sets: [
        {
          id: "s1",
          set_number: 1,
          set_type: "normal",
          left: { id: "s1-l", weight: 15, reps: null, duration_seconds: 45, completed: true, set_type: "normal" },
        },
      ],
    });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    expect(mockUpdateSet).toHaveBeenCalledWith("new-left-set-id", 15, null, 45);

    const setGroupsCall = (params.setGroups as jest.Mock).mock.calls.slice(-1)[0][0];
    const updated = setGroupsCall([group]);
    const appended = updated[0].sets.slice(-1)[0];
    expect(appended.weight).toBe(15);
    expect(appended.duration_seconds).toBe(45);
    expect(appended.reps).toBeNull();
  });

  it("unilateral BW-modifier smart-default: resolves default modifier and applies to new left set", async () => {
    mockGetLastBodyweightModifier.mockResolvedValue(15);

    const group = makeGroup({
      is_bodyweight: true,
      sets: [],
    });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    expect(mockGetLastBodyweightModifier).toHaveBeenCalledWith("ex-1");
    expect(mockUpdateSetBodyweightModifier).toHaveBeenCalledWith("new-left-set-id", 15);

    const setGroupsCall = (params.setGroups as jest.Mock).mock.calls.slice(-1)[0][0];
    const updated = setGroupsCall([group]);
    const appended = updated[0].sets.slice(-1)[0];
    expect(appended.bodyweight_modifier_kg).toBe(15);
  });

  it("unilateral cable-variant: autofills cable variant and updates left set", async () => {
    mockGetRecentVariantHistory.mockResolvedValue([
      { attachment: "rope", mount_position: "high" },
    ]);

    const group = makeGroup({
      equipment: "cable",
      sets: [],
    });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    expect(mockGetRecentVariantHistory).toHaveBeenCalledWith("ex-1");
    expect(mockUpdateSetVariant).toHaveBeenCalledWith("new-left-set-id", "rope", "high");

    const setGroupsCall = (params.setGroups as jest.Mock).mock.calls.slice(-1)[0][0];
    const updated = setGroupsCall([group]);
    const appended = updated[0].sets.slice(-1)[0];
    expect(appended.attachment).toBe("rope");
    expect(appended.mount_position).toBe("high");
  });

  it("unilateral bodyweight grip-variant: autofills grip variant and updates left set", async () => {
    mockGetRecentBodyweightGripHistory.mockResolvedValue([
      { grip_type: "underhand", grip_width: "wide" },
    ]);

    const group = makeGroup({
      equipment: "bodyweight",
      name: "Pullup",
      sets: [],
    });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    expect(mockGetRecentBodyweightGripHistory).toHaveBeenCalledWith("ex-1");
    expect(mockUpdateSetBodyweightVariant).toHaveBeenCalledWith("new-left-set-id", "underhand", "wide");

    const setGroupsCall = (params.setGroups as jest.Mock).mock.calls.slice(-1)[0][0];
    const updated = setGroupsCall([group]);
    const appended = updated[0].sets.slice(-1)[0];
    expect(appended.grip_type).toBe("underhand");
    expect(appended.grip_width).toBe("wide");
  });
});
