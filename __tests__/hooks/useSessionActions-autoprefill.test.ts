/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Tests for auto-prefill useEffect in useSessionActions (BLD-542).
 *
 * AC:
 * - Runs once per session open for groups with previousSets + no touched working sets
 * - Silent: no toast/haptic, but still announces for a11y
 * - Idempotent: ref-guarded against re-render
 * - Skipped for groups with any touched working set (completed or has values)
 * - Manual tap still goes through the normal (toasting) path
 */

const mockUpdateSet = jest.fn().mockResolvedValue(undefined);
const mockAnnounce = jest.fn();

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
  updateSetTrainingMode: jest.fn(),
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
  getLastBodyweightModifier: jest.fn(),
  updateSetBodyweightModifier: jest.fn(),
}));

jest.mock("../../lib/query", () => ({
  bumpQueryVersion: jest.fn(),
  queryClient: { removeQueries: jest.fn() },
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
  computePrefillSets: jest.fn((currentSets: any[], previousSets: any[]) => {
    // Stub: return a fill for each working current set that has a matching prev
    const working = currentSets.filter((s) => s.set_type !== "warmup");
    const out: any[] = [];
    for (let i = 0; i < working.length && i < previousSets.length; i++) {
      const cur = working[i];
      if (cur.completed) continue;
      if (cur.weight != null || cur.reps != null || cur.duration_seconds != null) continue;
      const p = previousSets[i];
      out.push({ setId: cur.id, weight: p.weight, reps: p.reps, duration_seconds: p.duration_seconds });
    }
    return out;
  }),
}));

jest.mock("react-native", () => ({
  AccessibilityInfo: {
    announceForAccessibility: (...args: any[]) => mockAnnounce(...args),
  },
  Keyboard: { dismiss: jest.fn() },
  Platform: { OS: "ios" },
}));

import { renderHook, act } from "@testing-library/react-native";
import { useSessionActions } from "../../hooks/useSessionActions";

function makeGroup(overrides: any = {}) {
  return {
    exercise_id: "ex-1",
    name: "Bench",
    previousSets: [
      { weight: 100, reps: 5, duration_seconds: null },
      { weight: 100, reps: 5, duration_seconds: null },
    ],
    progressionSuggested: false,
    trackingMode: "reps" as const,
    is_bodyweight: false,
    sets: [
      { id: "s1", weight: null, reps: null, duration_seconds: null, completed: false, set_type: "working" },
      { id: "s2", weight: null, reps: null, duration_seconds: null, completed: false, set_type: "working" },
    ],
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
  };
}

const flush = () => new Promise((r) => setTimeout(r, 50));

describe("useSessionActions — auto-prefill (BLD-542)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("auto-prefills eligible groups silently on session open (no toast, no haptic, a11y announce only)", async () => {
    const params = makeParams([makeGroup()]);
    renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    expect(mockUpdateSet).toHaveBeenCalledTimes(2);
    expect(params.showToast).not.toHaveBeenCalled();
    // Haptics.impactAsync not called (silent path)
    const haptics = jest.requireMock("expo-haptics");
    expect(haptics.impactAsync).not.toHaveBeenCalled();
    expect(mockAnnounce).toHaveBeenCalledWith(expect.stringContaining("Prefilled 2 sets"));
  });

  it.each([
    ["has completed working set", { sets: [
      { id: "s1", weight: null, reps: null, duration_seconds: null, completed: true, set_type: "working" },
      { id: "s2", weight: null, reps: null, duration_seconds: null, completed: false, set_type: "working" },
    ] }],
    ["has user-entered weight", { sets: [
      { id: "s1", weight: 50, reps: null, duration_seconds: null, completed: false, set_type: "working" },
      { id: "s2", weight: null, reps: null, duration_seconds: null, completed: false, set_type: "working" },
    ] }],
    ["has user-entered reps", { sets: [
      { id: "s1", weight: null, reps: 3, duration_seconds: null, completed: false, set_type: "working" },
    ] }],
    ["has no previousSets", { previousSets: null }],
    ["has empty previousSets", { previousSets: [] }],
  ])("skips group when %s", async (_label, override) => {
    const params = makeParams([makeGroup(override)]);
    renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    expect(mockUpdateSet).not.toHaveBeenCalled();
    expect(mockAnnounce).not.toHaveBeenCalled();
  });

  it("is idempotent: does not re-fire on re-render with same session id", async () => {
    const params = makeParams([makeGroup()]);
    const { rerender } = renderHook<unknown, { p: any }>(({ p }) => useSessionActions(p), { initialProps: { p: params } });
    await act(async () => { await flush(); });
    expect(mockUpdateSet).toHaveBeenCalledTimes(2);

    mockUpdateSet.mockClear();
    mockAnnounce.mockClear();
    // Simulate groups re-computation (new array reference, same session)
    rerender({ p: makeParams([makeGroup()]) });
    await act(async () => { await flush(); });
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("manual tap still shows toast + haptic (non-silent path)", async () => {
    const params = makeParams([makeGroup({
      // Touched so auto-prefill skips; then manual tap resets to untouched-like via fresh call path.
      sets: [
        { id: "s1", weight: 999, reps: 1, duration_seconds: null, completed: false, set_type: "working" },
      ],
    })]);
    const { result, rerender } = renderHook<ReturnType<typeof useSessionActions>, { p: any }>(({ p }) => useSessionActions(p), { initialProps: { p: params } });
    await act(async () => { await flush(); });
    expect(mockUpdateSet).not.toHaveBeenCalled(); // auto skipped (touched)

    // Now rerender with an untouched group so a manual tap produces fills
    const freshGroup = makeGroup();
    const freshParams = { ...params, groups: [freshGroup] as any };
    rerender({ p: freshParams });

    await act(async () => {
      await result.current.handlePrefillFromPrevious("ex-1");
    });
    expect(mockUpdateSet).toHaveBeenCalledTimes(2);
    expect(freshParams.showToast).toHaveBeenCalledWith(expect.stringContaining("Filled 2"));
    const haptics = jest.requireMock("expo-haptics");
    expect(haptics.impactAsync).toHaveBeenCalled();
  });

  it("rollback + warn when silent auto-prefill persistence fails (BLD-542 QD/reviewer blocker)", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockUpdateSet.mockRejectedValueOnce(new Error("DB locked"));

    const params = makeParams([makeGroup()]);
    params.setGroups = jest.fn();

    renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    // Silent contract intact: no toast, no showError, no haptic
    expect(params.showToast).not.toHaveBeenCalled();
    expect(params.showError).not.toHaveBeenCalled();
    const haptics = jest.requireMock("expo-haptics");
    expect(haptics.impactAsync).not.toHaveBeenCalled();

    // No a11y announce on failure (we never reached success path)
    expect(mockAnnounce).not.toHaveBeenCalled();

    // Diagnostic breadcrumb surfaced
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[prefillFromPrevious] persist failed"),
      expect.any(Error),
    );

    // setGroups called twice: optimistic apply + rollback
    const setGroupsMock = params.setGroups as jest.Mock;
    expect(setGroupsMock.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Apply both updaters sequentially to an initial state; final state equals initial (rollback).
    const initial = [makeGroup()];
    let state: any = initial;
    for (const [updater] of setGroupsMock.mock.calls) {
      state = updater(state);
    }
    expect(state[0].sets.every((s: any) => s.weight == null && s.reps == null && s.duration_seconds == null)).toBe(true);

    warnSpy.mockRestore();
  });
});
