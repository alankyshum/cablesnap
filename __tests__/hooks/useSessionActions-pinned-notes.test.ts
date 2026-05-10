/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * BLD-1028 — Pinned Per-Exercise Notes: hook-level regression tests.
 *
 * Tests the actual useSessionActions code paths for:
 * 1. Dismissed backfill: handleLoadBackfill skips DB query when
 *    pinnedNoteBackfill === null (already dismissed).
 * 2. AppState flush: updateExerciseNote is called immediately when
 *    the app goes to background/inactive, bypassing the 600ms debounce.
 * 3. finish() ordering: pending note is flushed to DB before
 *    completeSession() is called.
 */

// ---- var declarations for mocks accessed in jest.mock() factory ----
// eslint-disable-next-line no-var
var mockAppStateListeners: Array<(s: string) => void> = [];
// eslint-disable-next-line no-var
var mockAppState: { currentState: string; addEventListener: jest.Mock };

jest.mock("react-native", () => {
  mockAppState = {
    currentState: "active",
    addEventListener: jest.fn((event: string, handler: (s: string) => void) => {
      if (event === "change") mockAppStateListeners.push(handler);
      return {
        remove: () => {
          mockAppStateListeners = mockAppStateListeners.filter((h) => h !== handler);
        },
      };
    }),
  };
  return {
    AccessibilityInfo: { announceForAccessibility: jest.fn() },
    Keyboard: { dismiss: jest.fn() },
    Platform: { OS: "ios" },
    AppState: mockAppState,
  };
});

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
  // BLD-1028 pinned note functions under test:
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

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light" },
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn() }),
}));

// confirmAction immediately calls the confirm callback so finish() runs fully.
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

import { renderHook, act } from "@testing-library/react-native";
import { useSessionActions } from "../../hooks/useSessionActions";
import {
  updateExerciseNote,
  getExerciseBackfillCandidate,
  completeSession,
} from "../../lib/db";

function makeGroup(overrides: any = {}): any {
  return {
    exercise_id: "ex-1",
    name: "Bench Press",
    link_id: null,
    is_voltra: false,
    is_bodyweight: false,
    trackingMode: "reps" as const,
    equipment: "barbell",
    exercise_position: 0,
    exerciseCategory: null,
    sets: [],
    previousSets: [],
    progressionSuggested: false,
    pinnedNote: null,
    pinnedNoteBackfill: undefined,
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
    // clock_started_at must be non-null so the AppState listener gets registered.
    session: { started_at: Date.now(), clock_started_at: Date.now(), name: "Test" },
    showToast: jest.fn(),
    showError: jest.fn(),
    ...overrides,
  };
}

// ─── Test A: handleLoadBackfill skips query for dismissed exercises ────────────
describe("useSessionActions — BLD-1028 backfill dismissed state", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockAppStateListeners = [];
    mockAppState.currentState = "active";
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("skips getExerciseBackfillCandidate when pinnedNoteBackfill is null (dismissed)", async () => {
    // pinnedNoteBackfill: null means the user already dismissed the suggestion.
    // handleLoadBackfill must NOT fire another DB query.
    const group = makeGroup({ exercise_id: "ex-1", pinnedNoteBackfill: null });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));

    await act(async () => {
      await result.current.handleLoadBackfill("ex-1");
    });

    expect(getExerciseBackfillCandidate).not.toHaveBeenCalled();
  });

  it("calls getExerciseBackfillCandidate when pinnedNoteBackfill is undefined (not yet queried)", async () => {
    // pinnedNoteBackfill: undefined means we haven't queried yet — should trigger query.
    const group = makeGroup({ exercise_id: "ex-1", pinnedNoteBackfill: undefined });
    const params = makeParams([group]);
    (getExerciseBackfillCandidate as jest.Mock).mockResolvedValueOnce({
      text: "Great session",
      date: 1699000000000,
    });

    const { result } = renderHook(() => useSessionActions(params));

    await act(async () => {
      await result.current.handleLoadBackfill("ex-1");
    });

    expect(getExerciseBackfillCandidate).toHaveBeenCalledWith("ex-1");
    // setGroups should be called to store the candidate in component state.
    expect(params.setGroups).toHaveBeenCalled();
  });
});

// ─── Test B: AppState flush goes through the real hook ─────────────────────────
describe("useSessionActions — BLD-1028 AppState flush", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockAppStateListeners = [];
    mockAppState.currentState = "active";
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("flushes pending draft immediately when app goes to background (bypasses 600ms debounce)", async () => {
    const group = makeGroup({ exercise_id: "ex-1" });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));

    // Trigger a draft change — queues a 600ms debounce and stores in the pending ref.
    act(() => {
      result.current.handlePinnedNoteDraftChange("ex-1", "my draft note");
    });
    // Debounce not yet fired.
    expect(updateExerciseNote).not.toHaveBeenCalled();

    // Simulate app going to background → flushAllPinnedNotes() is called (void).
    await act(async () => {
      mockAppStateListeners.forEach((h) => h("background"));
    });

    expect(updateExerciseNote).toHaveBeenCalledWith("ex-1", "my draft note");
    expect(updateExerciseNote).toHaveBeenCalledTimes(1);
  });

  it("flushes pending draft when app goes to inactive", async () => {
    const group = makeGroup({ exercise_id: "ex-1" });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));

    act(() => {
      result.current.handlePinnedNoteDraftChange("ex-1", "inactive draft");
    });
    expect(updateExerciseNote).not.toHaveBeenCalled();

    await act(async () => {
      mockAppStateListeners.forEach((h) => h("inactive"));
    });

    expect(updateExerciseNote).toHaveBeenCalledWith("ex-1", "inactive draft");
  });
});

// ─── Test C: finish() flushes pending note before completeSession ──────────────
describe("useSessionActions — BLD-1028 finish() flush ordering", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockAppStateListeners = [];
    mockAppState.currentState = "active";
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("calls updateExerciseNote before completeSession when finish() is triggered", async () => {
    const callOrder: string[] = [];
    (updateExerciseNote as jest.Mock).mockImplementation(async () => {
      callOrder.push("updateExerciseNote");
    });
    (completeSession as jest.Mock).mockImplementation(async () => {
      callOrder.push("completeSession");
    });

    const group = makeGroup({ exercise_id: "ex-1" });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));

    // Build up a pending draft (debounce not yet fired).
    act(() => {
      result.current.handlePinnedNoteDraftChange("ex-1", "pending note before finish");
    });
    // Advance timers partially — not enough to fire the 600ms debounce.
    act(() => { jest.advanceTimersByTime(100); });
    expect(updateExerciseNote).not.toHaveBeenCalled();

    // finish() should: flush pending notes → then complete session.
    await act(async () => {
      result.current.finish();
    });

    expect(callOrder).toEqual(["updateExerciseNote", "completeSession"]);
    expect(callOrder.indexOf("updateExerciseNote")).toBeLessThan(
      callOrder.indexOf("completeSession"),
    );
  });

  it("finish() still completes session even when there are no pending notes", async () => {
    const group = makeGroup({ exercise_id: "ex-1" });
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));

    // No draft changes — finish should cleanly complete the session.
    await act(async () => {
      result.current.finish();
    });

    expect(completeSession).toHaveBeenCalledWith("session-1");
    expect(updateExerciseNote).not.toHaveBeenCalled();
  });
});
