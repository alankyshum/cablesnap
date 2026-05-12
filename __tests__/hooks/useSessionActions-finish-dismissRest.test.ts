/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * BLD-1137 call-chain test: finish() must call dismissRest() to cancel all
 * active rest-timer notifications (pre-end cue, live countdown, rest-complete)
 * before navigating away on workout completion.
 *
 * AC7 (End Workout cancellation path).
 */

const mockCompleteSession = jest.fn().mockResolvedValue(undefined);
const mockGetSessionSets = jest.fn();

jest.mock("../../lib/db", () => ({
  addSet: jest.fn(),
  cancelSession: jest.fn(),
  deleteSet: jest.fn(),
  completeSession: (...args: any[]) => mockCompleteSession(...args),
  completeSet: jest.fn(),
  getRestSecondsForLink: jest.fn(),
  uncompleteSet: jest.fn(),
  updateSet: jest.fn(),
  updateSetRPE: jest.fn(),
  updateSetNotes: jest.fn(),
  getSessionSets: (...args: any[]) => mockGetSessionSets(...args),
  updateSetDuration: jest.fn(),
  checkSetPR: jest.fn(),
  updateExercisePositions: jest.fn(),
  getGoalForExercise: jest.fn().mockResolvedValue(null),
  achieveGoal: jest.fn(),
  getCurrentBestWeight: jest.fn(),
}));

jest.mock("../../lib/query", () => ({
  bumpQueryVersion: jest.fn(),
  queryClient: {
    removeQueries: jest.fn(),
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

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
}));

jest.mock("../../lib/confirm", () => ({
  confirmAction: jest.fn((_title: string, _msg: string, cb: () => Promise<void>) => cb()),
}));

jest.mock("../../lib/format", () => ({
  formatTime: jest.fn(() => "0:30"),
  computePrefillSets: jest.fn(() => []),
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

function flush(ms = 100): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function createParams(overrides: Partial<Parameters<typeof useSessionActions>[0]> = {}) {
  return {
    id: "session-1",
    groups: [],
    setGroups: jest.fn(),
    updateGroupSet: jest.fn(),
    startRest: jest.fn(),
    startRestWithDuration: jest.fn(),
    startRestWithBreakdown: jest.fn(),
    dismissRest: jest.fn(),
    session: { started_at: Date.now() - 30000, name: "Test" },
    showToast: jest.fn(),
    showError: jest.fn(),
    ...overrides,
  };
}

describe("useSessionActions — finish() dismisses rest timer (BLD-1137 AC7)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls dismissRest() when user confirms End Workout (sets completed → summary path)", async () => {
    const dismissRest = jest.fn();
    mockGetSessionSets.mockResolvedValue([
      { id: "s1", completed: true },
    ]);

    const { result } = renderHook(() => useSessionActions(createParams({ dismissRest })));

    await act(async () => {
      result.current.finish();
      await flush();
    });

    expect(dismissRest).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/session/summary/session-1");
  });

  it("calls dismissRest() when user confirms End Workout (no completed sets → tabs path)", async () => {
    const dismissRest = jest.fn();
    mockGetSessionSets.mockResolvedValue([
      { id: "s1", completed: false },
    ]);

    const { result } = renderHook(() => useSessionActions(createParams({ dismissRest })));

    await act(async () => {
      result.current.finish();
      await flush();
    });

    expect(dismissRest).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
  });

  it("calls dismissRest() before completeSession (ordering guarantee)", async () => {
    const callOrder: string[] = [];
    const dismissRest = jest.fn(() => { callOrder.push("dismissRest"); });
    mockCompleteSession.mockImplementation(async () => { callOrder.push("completeSession"); });
    mockGetSessionSets.mockResolvedValue([{ id: "s1", completed: true }]);

    const { result } = renderHook(() => useSessionActions(createParams({ dismissRest })));

    await act(async () => {
      result.current.finish();
      await flush();
    });

    expect(callOrder[0]).toBe("dismissRest");
    expect(callOrder[1]).toBe("completeSession");
  });

  describe("BLD-1207 / GH#589 — Complete Workout no-op regression", () => {
    it("invokes confirmAction with destructive=false and 'Complete' label", async () => {
      const { confirmAction } = jest.requireMock("../../lib/confirm");
      mockGetSessionSets.mockResolvedValue([{ id: "s1", completed: true }]);

      const { result } = renderHook(() => useSessionActions(createParams()));

      await act(async () => {
        result.current.finish();
        await flush();
      });

      expect(confirmAction).toHaveBeenCalledWith(
        "Complete Workout?",
        expect.any(String),
        expect.any(Function),
        false,
        "Complete"
      );
    });

    it("surfaces an error toast when completeSession throws (no silent no-op)", async () => {
      const showError = jest.fn();
      mockCompleteSession.mockRejectedValueOnce(new Error("DB write failed"));
      mockGetSessionSets.mockResolvedValue([{ id: "s1", completed: true }]);

      const { result } = renderHook(() => useSessionActions(createParams({ showError })));

      await act(async () => {
        result.current.finish();
        await flush();
      });

      expect(showError).toHaveBeenCalledWith(
        expect.stringMatching(/couldn'?t finish workout/i)
      );
      expect(mockReplace).not.toHaveBeenCalledWith("/session/summary/session-1");
    });

    it("does not navigate to summary when the finish chain throws", async () => {
      const showError = jest.fn();
      mockCompleteSession.mockRejectedValueOnce(new Error("boom"));
      mockGetSessionSets.mockResolvedValue([{ id: "s1", completed: true }]);

      const { result } = renderHook(() => useSessionActions(createParams({ showError })));

      await act(async () => {
        result.current.finish();
        await flush();
      });

      expect(mockCompleteSession).toHaveBeenCalled();
      expect(showError).toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});
