/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * BLD-1130 — Stack marker autofill behavioral tests.
 *
 * Closes QD G5 gaps from PR #545 review:
 * - AC6 cold-cache: handleAddSet on a calibrated cable session must
 *   await `queryClient.fetchQuery` (NOT `getQueryData`) so the first
 *   add-set after a gym change deterministically autofills the marker
 *   even when `useActiveCalibration` hasn't populated the cache yet.
 *   (G2: replaces the silent "no autofill" fallback that masqueraded
 *   as a calibration-missing case.)
 * - AC9 two-stack same-marker different-weight persistence: when two
 *   distinct stacks (e.g. one 5lb-base, one 10lb-base) both have a
 *   marker `5`, `handleMarkerConfirm` must persist DISTINCT
 *   snapshots — the second confirm must not reuse the first stack's
 *   weight or stack_id.
 *
 * [test: __tests__/hooks/useSessionActions-stackmarker-autofill.test.ts]
 */

const mockUpdateSetStackMarker = jest.fn().mockResolvedValue(undefined);
const mockGetRecentStackHistory = jest.fn();
const mockAddSet = jest.fn();
const mockFetchStacks = jest.fn();
const mockFetchQuery = jest.fn();

jest.mock("../../hooks/useActiveCalibration", () => ({
  fetchStacksWithCalibrations: (...args: any[]) => mockFetchStacks(...args),
  useActiveCalibration: jest.fn(() => []),
}));

// BLD-1130: source uses `await import("@/hooks/useActiveCalibration")`.
// Mock both relative AND alias paths to ensure the dynamic import resolves
// to the same mock factory regardless of which path jest's resolver picks.
jest.mock("@/hooks/useActiveCalibration", () => ({
  fetchStacksWithCalibrations: (...args: any[]) => mockFetchStacks(...args),
  useActiveCalibration: jest.fn(() => []),
}));

jest.mock("../../lib/db", () => ({
  addSet: (...args: any[]) => mockAddSet(...args),
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
  updateSetManualWeight: jest.fn(),
  getRecentStackHistory: (...args: any[]) => mockGetRecentStackHistory(...args),
  updateSetRepsAndDuration: jest.fn(),
}));

jest.mock("../../lib/query", () => ({
  bumpQueryVersion: jest.fn(),
  queryClient: {
    removeQueries: jest.fn(),
    invalidateQueries: jest.fn(),
    fetchQuery: (...args: any[]) => mockFetchQuery(...args),
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

// ─── G2 / AC6 cold-cache add-set autofill ─────────────────────────────────
describe("BLD-1130 G2 / AC6 — cold-cache add-set autofills marker via fetchQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("awaits queryClient.fetchQuery (not getQueryData) when adding a cable set on a calibrated gym with prior marker history", async () => {
    // Cold cache: queryClient.fetchQuery is invoked. Resolve via the queryFn
    // (deferred to fetchStacksWithCalibrations) to prove the deterministic
    // path — the only way the autofill fires when the cache is empty.
    mockFetchQuery.mockImplementation(async ({ queryFn }: any) => queryFn());
    mockFetchStacks.mockResolvedValue([
      {
        id: "stack-A",
        name: "Home Stack",
        unit: "kg",
        calibrations: [
          { marker: 5, true_weight: 50 },
          { marker: 6, true_weight: 60 },
        ],
      },
    ]);
    mockGetRecentStackHistory.mockResolvedValue({ stack_id: "stack-A", stack_marker: 6 });
    mockAddSet.mockResolvedValue({ id: "new-set-99", set_number: 1 });

    const groups = [makeGroup([])];
    const params = makeParams(groups);

    const { result } = renderHook(() => useSessionActions(params));

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    // G2 cure: fetchQuery invoked with the calibration query key + correct
    // staleTime, so the cold path awaits a real fetch instead of silently
    // skipping autofill on a cold cache. Filter for the calibration call —
    // BLD-771 variant-history autofill also routes through fetchQuery on
    // the same handleAddSet code path.
    const calibrationCall = mockFetchQuery.mock.calls.find(
      ([opts]) => Array.isArray(opts?.queryKey) && opts.queryKey[0] === "stack-calibrations"
    );
    expect(calibrationCall).toBeDefined();
    expect(calibrationCall![0]).toEqual(
      expect.objectContaining({
        queryKey: ["stack-calibrations", "gym-1"],
        staleTime: 60_000,
      })
    );
    expect(mockFetchStacks).toHaveBeenCalledWith("gym-1");

    // Marker autofill MUST persist with the resolved true weight from
    // CURRENT calibration (not historical snapshot).
    expect(mockUpdateSetStackMarker).toHaveBeenCalledWith("new-set-99", {
      weight: 60,
      marker: 6,
      stackId: "stack-A",
      stackName: "Home Stack",
      stackUnit: "kg",
    });
  });

  it("does NOT autofill when prior history exists but the stored stack_id no longer matches any current calibration", async () => {
    mockFetchQuery.mockImplementation(async ({ queryFn, queryKey }: any) => {
      // Only resolve the calibration fetch via our mocked fetchStacks.
      // Other fetchQuery callers (BLD-771 variant-history) get a passthrough.
      if (Array.isArray(queryKey) && queryKey[0] === "stack-calibrations") {
        return queryFn();
      }
      return queryFn ? queryFn() : undefined;
    });
    mockFetchStacks.mockResolvedValue([
      { id: "stack-B", name: "Other Stack", unit: "kg", calibrations: [{ marker: 5, true_weight: 50 }] },
    ]);
    mockGetRecentStackHistory.mockResolvedValue({ stack_id: "stack-deleted", stack_marker: 5 });
    mockAddSet.mockResolvedValue({ id: "new-set-100", set_number: 1 });

    const groups = [makeGroup([])];
    const params = makeParams(groups);

    const { result } = renderHook(() => useSessionActions(params));

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    // Cold-cache fetch still attempted (deterministic resolution requirement)
    // but no autofill write because the historical stack_id is gone.
    const calibrationCalls = mockFetchQuery.mock.calls.filter(
      ([opts]) => Array.isArray(opts?.queryKey) && opts.queryKey[0] === "stack-calibrations"
    );
    expect(calibrationCalls.length).toBeGreaterThanOrEqual(1);
    expect(mockFetchStacks).toHaveBeenCalledWith("gym-1");
    expect(mockUpdateSetStackMarker).not.toHaveBeenCalled();
  });

  it("autofill is silent no-op when session has no gym_id (uncalibrated session)", async () => {
    mockGetRecentStackHistory.mockResolvedValue({ stack_id: "stack-A", stack_marker: 6 });
    mockAddSet.mockResolvedValue({ id: "new-set-101", set_number: 1 });

    const groups = [makeGroup([])];
    const params = makeParams(groups, {
      session: { started_at: Date.now(), name: "Unbound Session", gym_id: null },
    });

    const { result } = renderHook(() => useSessionActions(params));

    await act(async () => {
      await result.current.handleAddSet("ex-1");
    });

    // Without a gym binding the marker autofill branch must not even
    // attempt the calibration fetch (gates closed at the entry condition).
    // BLD-771 variant-history may still fetchQuery on its own key — filter.
    const calibrationCalls = mockFetchQuery.mock.calls.filter(
      ([opts]) => Array.isArray(opts?.queryKey) && opts.queryKey[0] === "stack-calibrations"
    );
    expect(calibrationCalls).toHaveLength(0);
    expect(mockFetchStacks).not.toHaveBeenCalled();
    expect(mockUpdateSetStackMarker).not.toHaveBeenCalled();
  });
});

// ─── AC9 two-stack same-marker different-weight persistence ──────────────
describe("BLD-1130 / AC9 — two distinct stacks at same marker persist distinct snapshots", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("handleMarkerConfirm called twice with same marker but different stacks writes two distinct snapshots (no cross-contamination)", async () => {
    const set1 = makeSet({ id: "set-A" });
    const set2 = makeSet({ id: "set-B", set_number: 2 });
    const groups = [makeGroup([set1, set2])];
    const params = makeParams(groups);

    const { result } = renderHook(() => useSessionActions(params));

    // First: stack-X marker 5 → trueWeight 50
    await act(async () => {
      await result.current.handleMarkerConfirm("set-A", {
        stackId: "stack-X",
        stackName: "5lb-base",
        marker: 5,
        trueWeight: 50,
        unit: "lb",
      });
    });

    // Second: stack-Y marker 5 (same marker) → DIFFERENT trueWeight 80
    await act(async () => {
      await result.current.handleMarkerConfirm("set-B", {
        stackId: "stack-Y",
        stackName: "10lb-base",
        marker: 5,
        trueWeight: 80,
        unit: "lb",
      });
    });

    // Each set persisted its own distinct snapshot (per-set isolation).
    expect(mockUpdateSetStackMarker).toHaveBeenNthCalledWith(1, "set-A", {
      weight: 50,
      marker: 5,
      stackId: "stack-X",
      stackName: "5lb-base",
      stackUnit: "lb",
    });
    expect(mockUpdateSetStackMarker).toHaveBeenNthCalledWith(2, "set-B", {
      weight: 80,
      marker: 5,
      stackId: "stack-Y",
      stackName: "10lb-base",
      stackUnit: "lb",
    });

    // updateGroupSet optimistic writes likewise distinct (no shared mutable
    // state leaking between confirms).
    const { updateGroupSet } = params;
    expect(updateGroupSet).toHaveBeenNthCalledWith(1, "set-A", expect.objectContaining({
      stack_id: "stack-X",
      stack_name_at_log: "5lb-base",
      stack_marker: 5,
      stack_unit_at_log: "lb",
      weight: 50,
    }));
    expect(updateGroupSet).toHaveBeenNthCalledWith(2, "set-B", expect.objectContaining({
      stack_id: "stack-Y",
      stack_name_at_log: "10lb-base",
      stack_marker: 5,
      stack_unit_at_log: "lb",
      weight: 80,
    }));
  });
});
