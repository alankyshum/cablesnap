/**
 * BLD-2561: useExerciseManagement — preferred-swap Undo routing regression guard.
 *
 * FAILING-FIRST REQUIREMENT:
 *   Before Fix 1 (the appliedPreferredSwaps.has() entry guard in handlePreferredSwap),
 *   pressing the "Swapped to … · Undo" chip would re-enter swap logic and open the
 *   discovery sheet (handleSwapOpen) instead of undoing. These tests MUST fail without
 *   the guard and PASS with it.
 *
 * Covers:
 *   - handlePreferredSwap(targetId) routes to handleSwapUndo when targetId is in
 *     appliedPreferredSwaps (chip in swapped state) → undoSwapInSession is called.
 *   - handlePreferredSwap(targetId) does NOT call getExerciseById / snapToIndex
 *     (discovery-sheet path) when in swapped state.
 *   - Undo works after the 5s toast window (swapUndoRef is NOT cleared by the timer).
 */

jest.mock("@/components/ui/bna-toast", () => ({
  useToast: () => ({
    info: mockShowToast,
    error: jest.fn(),
    warning: jest.fn(),
  }),
}));

jest.mock("../../lib/db", () => ({
  addSet: jest.fn(),
  deleteSetsBatch: jest.fn().mockResolvedValue(undefined),
  getExerciseById: jest.fn().mockResolvedValue(null),
  swapExerciseInSession: jest.fn().mockResolvedValue(["set-1", "set-2"]),
  undoSwapInSession: jest.fn().mockResolvedValue(undefined),
  getPreferredSubstitute: jest.fn(),
  setPreferredSubstitute: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: "medium" },
}));

jest.mock("@gorhom/bottom-sheet", () => "BottomSheet");

const mockShowToast = jest.fn();

import { renderHook, act } from "@testing-library/react-native";
import { useExerciseManagement } from "../../hooks/useExerciseManagement";
import type { ExerciseGroup } from "../../components/session/types";
import { swapExerciseInSession, undoSwapInSession, getExerciseById, getPreferredSubstitute } from "../../lib/db";

const mockSwap = swapExerciseInSession as jest.Mock;
const mockUndo = undoSwapInSession as jest.Mock;
const mockGetExById = getExerciseById as jest.Mock;
const mockGetPreferred = getPreferredSubstitute as jest.Mock;

function makeGroups(srcId = "ex-src", tgtId = "ex-tgt"): ExerciseGroup[] {
  return [
    {
      exercise_id: srcId,
      name: "Cable Row",
      is_voltra: false,
      is_bodyweight: false,
      trackingMode: "reps",
      equipment: "cable",
      exercise_position: 0,
      link_id: null,
      preferredSubstituteId: tgtId,
      preferredSubstituteName: "Machine Row",
      sets: [{ id: "s1", completed: false } as never],
      progressionSuggested: false,
    } as ExerciseGroup,
    {
      exercise_id: tgtId,
      name: "Machine Row",
      is_voltra: false,
      is_bodyweight: false,
      trackingMode: "reps",
      equipment: "machine",
      exercise_position: 1,
      link_id: null,
      preferredSubstituteId: null,
      preferredSubstituteName: null,
      sets: [{ id: "s2", completed: false } as never],
      progressionSuggested: false,
    } as ExerciseGroup,
  ];
}

function makeHookArgs(overrides: Partial<Parameters<typeof useExerciseManagement>[0]> = {}) {
  return {
    id: "session-1",
    groups: makeGroups(),
    setGroups: jest.fn(),
    load: jest.fn().mockResolvedValue(undefined),
    startRest: jest.fn().mockResolvedValue(undefined),
    dismissRest: jest.fn(),
    ...overrides,
  };
}

describe("useExerciseManagement — BLD-2561 preferred-swap Undo routing", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    // Default: preferred sub resolves to Machine Row.
    mockGetPreferred.mockResolvedValue({ id: "ex-tgt", name: "Machine Row", deleted_at: undefined });
    mockSwap.mockResolvedValue(["set-1"]);
    mockUndo.mockResolvedValue(undefined);
    mockGetExById.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("handlePreferredSwap(targetId) routes to undo when target is in appliedPreferredSwaps (chip swapped state)", async () => {
    const load = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useExerciseManagement(makeHookArgs({ load })),
    );

    // Step 1: apply the preferred swap (ex-src → ex-tgt).
    await act(async () => {
      await result.current.handlePreferredSwap("ex-src");
    });

    // Verify swap was applied.
    expect(mockSwap).toHaveBeenCalledWith("session-1", "ex-src", "ex-tgt");
    expect(mockUndo).not.toHaveBeenCalled();

    // Step 2: simulate pressing the chip on the TARGET's card ("Swapped to Machine Row · Undo").
    // appliedPreferredSwaps should now contain "ex-tgt", so handlePreferredSwap("ex-tgt")
    // must route to handleSwapUndo — NOT re-enter swap logic.
    await act(async () => {
      await result.current.handlePreferredSwap("ex-tgt");
    });

    // REGRESSION GUARD: undoSwapInSession MUST have been called.
    expect(mockUndo).toHaveBeenCalledTimes(1);
    // Discovery-sheet path must NOT have been taken (getExerciseById is what handleSwapOpen calls).
    expect(mockGetExById).not.toHaveBeenCalledWith("ex-tgt");
  });

  it("undo works after the 5s toast window (swapUndoRef NOT cleared by timer)", async () => {
    const load = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useExerciseManagement(makeHookArgs({ load })),
    );

    // Apply the swap.
    await act(async () => {
      await result.current.handlePreferredSwap("ex-src");
    });
    expect(mockSwap).toHaveBeenCalledWith("session-1", "ex-src", "ex-tgt");

    // Let the 5s toast timer expire — swapUndoRef must NOT be cleared.
    act(() => {
      jest.advanceTimersByTime(6000);
    });

    // Undo must still work after the timer.
    await act(async () => {
      await result.current.handlePreferredSwap("ex-tgt");
    });
    expect(mockUndo).toHaveBeenCalledTimes(1);
  });
});
