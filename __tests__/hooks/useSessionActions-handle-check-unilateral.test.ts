/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * BLD-3371 regression: unilateral (L/R) set completion must PERSIST to BOTH
 * side rows.
 *
 * Root cause: `components/session/ExerciseGroupSetTable.tsx` renders a
 * unilateral row by passing `set={set.left || set}` (i.e. the raw left-side
 * row) into `SetRow`. `SetRow.handleCheckPress` then calls `onCheck(set)` with
 * that left row, not the grouped wrapper. The unilateral branch in
 * `useSessionActions.handleCheck` resolved `leftSet`/`rightSet` from
 * `set.left` / `set.right` or from siblings with `s.side === "left"|"right"`.
 * Neither strategy could work: the passed row has no `.left`/`.right`, and
 * `group.sets` stores wrappers (per `useSessionData.ts:228-268`), not raw
 * side rows with `.side` — so the sibling search never matches. Both
 * `leftSet` and `rightSet` were `undefined`, so `completeSet()` was never
 * called on either persisted side row. The UI showed the set completed but,
 * on reload, hydration recomputed `completed` from the DB rows (which were
 * still `completed=false`) and the completion was lost.
 *
 * Fix: `handleCheck`'s unilateral branch now ALSO resolves the wrapper from
 * `activeGroup.sets` by `set_number` and reads its `.left`/`.right`. This
 * pins the persistence path regardless of whether the caller passes the
 * wrapper or the raw left-row.
 */

const mockCompleteSet = jest.fn().mockResolvedValue(undefined);
const mockUncompleteSet = jest.fn().mockResolvedValue(undefined);
const mockDeleteSet = jest.fn().mockResolvedValue(undefined);

jest.mock("../../lib/db", () => ({
  addSet: jest.fn(),
  cancelSession: jest.fn(),
  deleteSet: (...args: any[]) => mockDeleteSet(...args),
  completeSession: jest.fn(),
  completeSet: (...args: any[]) => mockCompleteSet(...args),
  getRestSecondsForLink: jest.fn(),
  getRestContext: jest.fn(),
  getAppSetting: jest.fn().mockResolvedValue(null),
  uncompleteSet: (...args: any[]) => mockUncompleteSet(...args),
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

const EX_ID = "ex-unilateral-1";

// The wrapper shape produced by useSessionData for a unilateral group entry.
function makeWrapper(setNumber: number, opts: {
  leftId?: string | null;
  leftWeight?: number | null;
  leftReps?: number | null;
  leftCompleted?: boolean;
  rightId?: string | null;
  rightWeight?: number | null;
  rightReps?: number | null;
  rightCompleted?: boolean;
  completed?: boolean;
}) {
  const left = opts.leftId != null ? {
    id: opts.leftId,
    session_id: "sess-1",
    exercise_id: EX_ID,
    set_number: setNumber,
    set_type: "normal" as const,
    side: "left" as const,
    weight: opts.leftWeight ?? null,
    reps: opts.leftReps ?? null,
    duration_seconds: null,
    completed: opts.leftCompleted ?? false,
    completed_at: null,
  } : undefined;
  const right = opts.rightId != null ? {
    id: opts.rightId,
    session_id: "sess-1",
    exercise_id: EX_ID,
    set_number: setNumber,
    set_type: "normal" as const,
    side: "right" as const,
    weight: opts.rightWeight ?? null,
    reps: opts.rightReps ?? null,
    duration_seconds: null,
    completed: opts.rightCompleted ?? false,
    completed_at: null,
  } : undefined;
  return {
    id: left?.id ?? right?.id ?? `wrap-${setNumber}`,
    session_id: "sess-1",
    exercise_id: EX_ID,
    set_number: setNumber,
    set_type: "normal" as const,
    completed: opts.completed ?? false,
    completed_at: null,
    left,
    right,
  } as any;
}

function makeGroup(sets: any[]) {
  return {
    exercise_id: EX_ID,
    name: "One-Arm Cable Row",
    link_id: null,
    is_voltra: false,
    is_bodyweight: false,
    track_unilateral: true,
    trackingMode: "reps" as const,
    equipment: "cable",
    exercise_position: 0,
    sets,
    previousSets: [],
    progressionSuggested: false,
  };
}

function makeParams(groups: any[]) {
  return {
    id: "sess-1",
    groups: groups as any,
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

describe("useSessionActions.handleCheck — unilateral persistence (BLD-3371)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("REGRESSION: when SetRow passes the unwrapped left-side row (as ExerciseGroupSetTable does), completing persists completeSet() for BOTH side row IDs", async () => {
    // Wrapper has both left ("L1") and right ("R1") with real values entered.
    const wrapper = makeWrapper(1, {
      leftId: "L1", leftWeight: 50, leftReps: 8,
      rightId: "R1", rightWeight: 50, rightReps: 8,
    });
    const group = makeGroup([wrapper]);
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    // Simulate the actual production call site: ExerciseGroupSetTable
    // unwraps `set.left || set` before passing to SetRow, and SetRow.onCheck
    // forwards that unwrapped row. So handleCheck receives the LEFT-SIDE row,
    // not the wrapper.
    const leftRowAsPassed = wrapper.left;
    await act(async () => { await result.current.handleCheck(leftRowAsPassed); });

    // Both persisted side rows must be marked complete in the DB.
    expect(mockCompleteSet).toHaveBeenCalledTimes(2);
    expect(mockCompleteSet).toHaveBeenCalledWith("L1");
    expect(mockCompleteSet).toHaveBeenCalledWith("R1");
    // Neither should be deleted (both had values entered).
    expect(mockDeleteSet).not.toHaveBeenCalled();
  });

  it("REGRESSION: uncomplete path — when the wrapper says completed and user taps again, uncompleteSet() fires on BOTH side row IDs", async () => {
    const wrapper = makeWrapper(1, {
      leftId: "L1", leftWeight: 50, leftReps: 8, leftCompleted: true,
      rightId: "R1", rightWeight: 50, rightReps: 8, rightCompleted: true,
      completed: true,
    });
    const group = makeGroup([wrapper]);
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    // The unwrapped row passed by SetRow carries `completed: true` (the DB
    // left-row's completed flag mirrors the wrapper's after a real completion).
    const leftRowAsPassed = wrapper.left;
    await act(async () => { await result.current.handleCheck(leftRowAsPassed); });

    expect(mockUncompleteSet).toHaveBeenCalledTimes(2);
    expect(mockUncompleteSet).toHaveBeenCalledWith("L1");
    expect(mockUncompleteSet).toHaveBeenCalledWith("R1");
    expect(mockCompleteSet).not.toHaveBeenCalled();
  });

  it("still supports the wrapper-shaped caller (future-proofing)", async () => {
    const wrapper = makeWrapper(1, {
      leftId: "L2", leftWeight: 40, leftReps: 10,
      rightId: "R2", rightWeight: 40, rightReps: 10,
    });
    const group = makeGroup([wrapper]);
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    // Directly pass the wrapper.
    await act(async () => { await result.current.handleCheck(wrapper); });

    expect(mockCompleteSet).toHaveBeenCalledTimes(2);
    expect(mockCompleteSet).toHaveBeenCalledWith("L2");
    expect(mockCompleteSet).toHaveBeenCalledWith("R2");
  });

  it("only-entered-side (left has values, right empty) still deletes the empty side and completes the entered side — no persistence regression", async () => {
    const wrapper = makeWrapper(1, {
      leftId: "L3", leftWeight: 60, leftReps: 6,
      rightId: "R3", rightWeight: null, rightReps: null,
    });
    const group = makeGroup([wrapper]);
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    const leftRowAsPassed = wrapper.left;
    await act(async () => { await result.current.handleCheck(leftRowAsPassed); });

    expect(mockCompleteSet).toHaveBeenCalledTimes(1);
    expect(mockCompleteSet).toHaveBeenCalledWith("L3");
    expect(mockDeleteSet).toHaveBeenCalledTimes(1);
    expect(mockDeleteSet).toHaveBeenCalledWith("R3");
  });

  it("REGRESSION: persisted left-only unilateral row (reload+complete lifecycle) -> tapping complete calls completeSet(left.id) exactly once and does NOT create/complete a right row", async () => {
    // Wrapper only has left ("L4") with real values entered, right is undefined (never created/persisted).
    const wrapper = makeWrapper(1, {
      leftId: "L4", leftWeight: 50, leftReps: 8,
    });
    const group = makeGroup([wrapper]);
    const params = makeParams([group]);
    const { result } = renderHook(() => useSessionActions(params));
    await act(async () => { await flush(); });

    // Tapping checkmark passes the unwrapped left-side row to handleCheck
    const leftRowAsPassed = wrapper.left;
    await act(async () => { await result.current.handleCheck(leftRowAsPassed); });

    // Left must be completed exactly once.
    expect(mockCompleteSet).toHaveBeenCalledTimes(1);
    expect(mockCompleteSet).toHaveBeenCalledWith("L4");
    // Right must not be completed or deleted.
    expect(mockDeleteSet).not.toHaveBeenCalled();
  });
});
