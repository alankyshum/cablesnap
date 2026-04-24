/**
 * BLD-577 battery: ensure useExerciseManagement's timer refs are all
 * released on unmount. Prior to this fix the setTimeout for pending
 * delete and the setInterval driving the 5s countdown were only cleared
 * on user-driven paths (undo / commit / next delete). An unmount mid-
 * countdown (user backs out of session within 5s) left them running
 * against a stale `setGroups` closure — minor memory leak on every
 * session close, and a plausible contributor to the reported
 * foreground crash/stuck state on Z Fold6 (GitHub #336).
 */

// Controllable timer spy before any imports.
const clearTimeoutSpy = jest.fn();
const clearIntervalSpy = jest.fn();

jest.mock("@/components/ui/bna-toast", () => ({
  useToast: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
  }),
}));

jest.mock("../../lib/db", () => ({
  addSet: jest.fn(),
  deleteSetsBatch: jest.fn().mockResolvedValue(undefined),
  getExerciseById: jest.fn(),
  swapExerciseInSession: jest.fn().mockResolvedValue([]),
  undoSwapInSession: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: "medium" },
}));

jest.mock("@gorhom/bottom-sheet", () => "BottomSheet");

import { renderHook, act } from "@testing-library/react-native";
import { useExerciseManagement } from "../../hooks/useExerciseManagement";
import type { ExerciseGroup } from "../../components/session/types";

function makeGroups(): ExerciseGroup[] {
  return [
    // Minimal shape sufficient for handleDeleteExercise's internal usage.
    {
      exercise_id: "ex-1",
      name: "Bench Press",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sets: [{ id: "s1", completed: false } as any, { id: "s2", completed: false } as any],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  ];
}

describe("useExerciseManagement — unmount cleanup (BLD-577)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    // Wrap the real timers so we can count releases.
    const realClearTimeout = globalThis.clearTimeout;
    const realClearInterval = globalThis.clearInterval;
    clearTimeoutSpy.mockImplementation((h: ReturnType<typeof setTimeout>) =>
      realClearTimeout(h),
    );
    clearIntervalSpy.mockImplementation((h: ReturnType<typeof setInterval>) =>
      realClearInterval(h),
    );
    globalThis.clearTimeout = clearTimeoutSpy as unknown as typeof clearTimeout;
    globalThis.clearInterval = clearIntervalSpy as unknown as typeof clearInterval;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("clears pending delete timeout + countdown interval on unmount", () => {
    const groups = makeGroups();
    const { result, unmount } = renderHook(() =>
      useExerciseManagement({
        id: "session-1",
        groups,
        setGroups: jest.fn(),
        load: jest.fn().mockResolvedValue(undefined),
        startRest: jest.fn().mockResolvedValue(undefined),
        dismissRest: jest.fn(),
      }),
    );

    act(() => {
      result.current.handleDeleteExercise("ex-1");
    });

    clearTimeoutSpy.mockClear();
    clearIntervalSpy.mockClear();

    // Unmount WHILE the 5s delete window + 1Hz countdown are live.
    unmount();

    // Both timers must have been released — at least one clearTimeout
    // and one clearInterval attributable to our refs.
    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
