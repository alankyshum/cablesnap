/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * BLD-2760 regression: in-session weight/reps edits must persist on keyboard
 * dismiss and never "snap back" to the old value.
 *
 * Root cause: handleUpdate used to resolve the edited set by reading component
 * state through a `setGroups(prev => { ...capture...; return prev; })` updater.
 * React only invokes that updater eagerly (synchronously) when NO other update
 * to the `groups` hook is pending; when anything else was churning `groups`
 * (e.g. the live rest timer), the updater was deferred, `resolvedSet` stayed
 * undefined, and handleUpdate returned early WITHOUT persisting — so the value
 * reverted. The fix reads the latest sets from a synchronous `groupsRef`.
 *
 * These tests pin the behaviour by giving `setGroups` a no-op mock (it never
 * invokes its updater — exactly the failing condition). The OLD code would call
 * updateSet 0 times; the fixed code resolves from the `groups` param and persists.
 */

const mockUpdateSet = jest.fn().mockResolvedValue(undefined);
const mockUpdateSetDuration = jest.fn().mockResolvedValue(undefined);

jest.mock("../../lib/db", () => ({
  addSet: jest.fn(),
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
  updateSetDuration: (...args: any[]) => mockUpdateSetDuration(...args),
  checkSetPR: jest.fn().mockResolvedValue(null),
  checkSetBodyweightModifierPR: jest.fn().mockResolvedValue(null),
  updateExercisePositions: jest.fn(),
  getGoalForExercise: jest.fn().mockResolvedValue(null),
  achieveGoal: jest.fn(),
  getCurrentBestWeight: jest.fn(),
}));

jest.mock("../../lib/db/session-sets", () => ({
  getLastBodyweightModifier: jest.fn(),
  updateSetBodyweightModifier: jest.fn(),
  getPreviousSetsBatch: jest.fn().mockResolvedValue({}),
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

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light" },
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../lib/confirm", () => ({ confirmAction: jest.fn() }));
jest.mock("../../lib/rest", () => ({ resolveRestSeconds: jest.fn() }));
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

jest.mock("@/components/ui/bna-toast", () => ({
  useToast: () => ({ warning: jest.fn(), success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

import { renderHook, act } from "@testing-library/react-native";
import { useSessionActions } from "../../hooks/useSessionActions";

function makeGroup(sets: any[]) {
  return {
    exercise_id: "ex-1",
    name: "Bench",
    link_id: null,
    is_voltra: false,
    is_bodyweight: false,
    trackingMode: "reps" as const,
    equipment: "barbell",
    exercise_position: 0,
    sets,
    previousSets: [],
    progressionSuggested: false,
  };
}

function makeParams(groups: any[]) {
  return {
    id: "session-1",
    groups: groups as any,
    // No-op setGroups: never invokes its updater — the exact condition under
    // which the old setGroups-updater read failed to resolve the set.
    setGroups: jest.fn(),
    updateGroupSet: jest.fn(),
    startRest: jest.fn(),
    startRestWithDuration: jest.fn(),
    startRestWithBreakdown: jest.fn(),
    dismissRest: jest.fn(),
    session: { started_at: Date.now() - 1000, name: "Test" },
    showToast: jest.fn(),
    showError: jest.fn(),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 20));

describe("useSessionActions — handleUpdate persistence (BLD-2760)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("weight edit persists and carries the latest reps (regression: not via setGroups updater)", async () => {
    const group = makeGroup([{ id: "s1", weight: 100, reps: 8, duration_seconds: null, completed: false, set_type: "normal" }]);
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => { await result.current.handleUpdate("s1", "weight", "150"); });

    expect(params.updateGroupSet).toHaveBeenCalledWith("s1", { weight: 150 });
    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledWith("s1", 150, 8);
  });

  it("reps edit persists and carries the latest weight", async () => {
    const group = makeGroup([{ id: "s1", weight: 100, reps: 8, duration_seconds: null, completed: false, set_type: "normal" }]);
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => { await result.current.handleUpdate("s1", "reps", "12"); });

    expect(params.updateGroupSet).toHaveBeenCalledWith("s1", { reps: 12 });
    expect(mockUpdateSet).toHaveBeenCalledWith("s1", 100, 12);
  });

  it("empty string clears the field to null", async () => {
    const group = makeGroup([{ id: "s1", weight: 100, reps: 8, duration_seconds: null, completed: false, set_type: "normal" }]);
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => { await result.current.handleUpdate("s1", "weight", ""); });

    expect(params.updateGroupSet).toHaveBeenCalledWith("s1", { weight: null });
    expect(mockUpdateSet).toHaveBeenCalledWith("s1", null, 8);
  });

  it("reps are rounded to the nearest integer", async () => {
    const group = makeGroup([{ id: "s1", weight: 100, reps: 8, duration_seconds: null, completed: false, set_type: "normal" }]);
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => { await result.current.handleUpdate("s1", "reps", "9.7"); });

    expect(mockUpdateSet).toHaveBeenCalledWith("s1", 100, 10);
  });

  it("duration edit persists via updateSetDuration", async () => {
    const group = makeGroup([{ id: "s1", weight: 0, reps: null, duration_seconds: 30, completed: false, set_type: "normal" }]);
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => { await result.current.handleUpdate("s1", "duration_seconds", "45.4"); });

    expect(params.updateGroupSet).toHaveBeenCalledWith("s1", { duration_seconds: 45 });
    expect(mockUpdateSetDuration).toHaveBeenCalledWith("s1", 45);
  });

  it("unknown setId is a silent no-op", async () => {
    const group = makeGroup([{ id: "s1", weight: 100, reps: 8, duration_seconds: null, completed: false, set_type: "normal" }]);
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    await act(async () => { await result.current.handleUpdate("does-not-exist", "weight", "150"); });

    expect(mockUpdateSet).not.toHaveBeenCalled();
    expect(params.updateGroupSet).not.toHaveBeenCalled();
  });
});
