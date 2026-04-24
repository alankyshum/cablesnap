/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * BLD-560 polish: elapsed-clock AppState pause/resume in useSessionActions.
 *
 * Mirrors the pattern of useRestTimer's backgrounded test:
 *   - When backgrounded, the 1Hz interval stops (no renders).
 *   - When foregrounded, elapsed is recomputed from session.started_at.
 *   - When mounted while backgrounded, start() does NOT spin up an interval
 *     until the next "active" transition.
 */

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
  updateSet: jest.fn(),
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
  formatTime: jest.fn(() => "0:00"),
  computePrefillSets: jest.fn(() => []),
}));

// Controllable AppState mock with listener registry.
// Declared via `var` because jest.mock() is hoisted above `let`/`const`;
// we still prefix names with `mock` to satisfy the referenced-in-factory rule.
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

import { renderHook, act } from "@testing-library/react-native";
import { useSessionActions } from "../../hooks/useSessionActions";

function makeParams(overrides: any = {}) {
  return {
    id: "session-1",
    groups: [],
    setGroups: jest.fn(),
    modes: {},
    setModes: jest.fn(),
    updateGroupSet: jest.fn(),
    startRest: jest.fn(),
    startRestWithDuration: jest.fn(),
    startRestWithBreakdown: jest.fn(),
    session: { started_at: Date.now(), name: "Test" },
    showToast: jest.fn(),
    showError: jest.fn(),
    ...overrides,
  };
}

describe("useSessionActions — elapsed clock AppState pause/resume (BLD-560)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockAppStateListeners = [];
    mockAppState.currentState = "active";
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts ticking when mounted in active state", () => {
    const startedAt = Date.now();
    const { result } = renderHook(() =>
      useSessionActions(makeParams({ session: { started_at: startedAt, name: "T" } })),
    );
    expect(result.current.elapsed).toBe(0);

    act(() => { jest.advanceTimersByTime(1000); });
    expect(result.current.elapsed).toBe(1);

    act(() => { jest.advanceTimersByTime(2000); });
    expect(result.current.elapsed).toBe(3);
  });

  it("pauses the 1Hz interval when app goes to background", () => {
    const startedAt = Date.now();
    const { result } = renderHook(() =>
      useSessionActions(makeParams({ session: { started_at: startedAt, name: "T" } })),
    );

    act(() => { jest.advanceTimersByTime(2000); });
    expect(result.current.elapsed).toBe(2);

    // Background
    act(() => {
      mockAppState.currentState = "background";
      mockAppStateListeners.forEach((h) => h("background"));
    });

    // Simulate real-wall-clock passage. Because setInterval is stopped, the
    // hook must NOT re-render elapsed until we come back to active.
    const beforePaused = result.current.elapsed;
    act(() => { jest.advanceTimersByTime(5000); });
    expect(result.current.elapsed).toBe(beforePaused);
  });

  it("recomputes elapsed from session.started_at on resume (no drift)", () => {
    const now = Date.now();
    jest.setSystemTime(now);
    const startedAt = now;
    const { result } = renderHook(() =>
      useSessionActions(makeParams({ session: { started_at: startedAt, name: "T" } })),
    );

    // Simulate: user opens app, waits 2s of ticking, backgrounds.
    act(() => { jest.advanceTimersByTime(2000); });
    expect(result.current.elapsed).toBe(2);

    act(() => {
      mockAppState.currentState = "background";
      mockAppStateListeners.forEach((h) => h("background"));
    });

    // 30 wall-clock seconds pass while backgrounded (no interval ticking).
    act(() => { jest.setSystemTime(now + 32_000); });

    act(() => {
      mockAppState.currentState = "active";
      mockAppStateListeners.forEach((h) => h("active"));
      // Next interval tick triggers the recompute via update().
      jest.advanceTimersByTime(1000);
    });

    // Elapsed should reflect absolute (now+32s+1s - started_at).
    expect(result.current.elapsed).toBeGreaterThanOrEqual(33);
  });

  it("does NOT spin up the interval if mounted while already backgrounded", () => {
    mockAppState.currentState = "background";
    const startedAt = Date.now();
    const { result } = renderHook(() =>
      useSessionActions(makeParams({ session: { started_at: startedAt, name: "T" } })),
    );

    // Because start() is guarded, elapsed should remain 0 even as timers
    // advance — no interval was scheduled.
    expect(result.current.elapsed).toBe(0);
    act(() => { jest.advanceTimersByTime(5000); });
    expect(result.current.elapsed).toBe(0);

    // Transition to active — NOW the interval starts and elapsed catches up.
    act(() => {
      mockAppState.currentState = "active";
      mockAppStateListeners.forEach((h) => h("active"));
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.elapsed).toBeGreaterThan(0);
  });
});
