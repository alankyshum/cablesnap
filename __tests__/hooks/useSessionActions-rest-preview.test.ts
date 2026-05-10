/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * BLD-1137 AC5/AC6/AC12/AC13: Production preview wiring in useSessionActions.
 *
 * Verifies handleCheck computes a NextSetPreview from the groups state and
 * passes it into startRest(), closing the gap where the production caller
 * never forwarded preview/isLastSet (caught in TL round-1 review).
 *
 * Three cases:
 * 1. Multi-set group → preview matches the next uncompleted set, isLastSet=false.
 * 2. Last set across all groups → isLastSet=true, preview=null.
 * 3. Last set in group but other groups remain → isLastSet=false, preview=null.
 */

jest.mock("@/components/ui/bna-toast", () => ({
  useToast: () => ({ warning: jest.fn(), success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

import { renderHook, act } from "@testing-library/react-native";
import { useSessionActions } from "../../hooks/useSessionActions";
import type { ExerciseGroup, SetWithMeta } from "../../components/session/types";
import type { SetType } from "../../lib/types";

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), push: jest.fn() }),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Medium: "medium", Heavy: "heavy", Light: "light" },
  NotificationFeedbackType: { Success: "success" },
}));

jest.mock("../../lib/db", () => ({
  completeSet: jest.fn().mockResolvedValue(undefined),
  uncompleteSet: jest.fn().mockResolvedValue(undefined),
  addSet: jest.fn().mockResolvedValue({ id: "new-set", weight: null, reps: null }),
  deleteSet: jest.fn().mockResolvedValue(undefined),
  cancelSession: jest.fn().mockResolvedValue(undefined),
  completeSession: jest.fn().mockResolvedValue(undefined),
  updateSet: jest.fn().mockResolvedValue(undefined),
  updateSetRPE: jest.fn().mockResolvedValue(undefined),
  updateSetNotes: jest.fn().mockResolvedValue(undefined),
  getSessionSets: jest.fn().mockResolvedValue([]),
  getRestSecondsForLink: jest.fn().mockResolvedValue(90),
  getRestContext: jest.fn().mockResolvedValue({ baseRestSeconds: 90, category: "standard", setType: "normal", rpe: null }),
  getAppSetting: jest.fn().mockResolvedValue("false"), // adaptive rest disabled
  updateSetDuration: jest.fn().mockResolvedValue(undefined),
  checkSetPR: jest.fn().mockResolvedValue(false),
  checkSetBodyweightModifierPR: jest.fn().mockResolvedValue(false),
  updateExercisePositions: jest.fn().mockResolvedValue(undefined),
  getGoalForExercise: jest.fn().mockResolvedValue(null),
  achieveGoal: jest.fn().mockResolvedValue(undefined),
  getCurrentBestWeight: jest.fn().mockResolvedValue(null),
  syncTemplateFromSession: jest.fn(),
  undoTemplateSyncFromSession: jest.fn(),
  updateExerciseNote: jest.fn(),
  dismissExerciseBackfill: jest.fn(),
  getExerciseBackfillCandidate: jest.fn().mockResolvedValue(null),
  updatePulleyPin: jest.fn(),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../lib/query", () => ({
  bumpQueryVersion: jest.fn(),
  queryClient: {
    removeQueries: jest.fn(),
    invalidateQueries: jest.fn(),
    fetchQuery: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock("../../lib/programs", () => ({
  getSessionProgramDayId: jest.fn().mockResolvedValue(null),
  getProgramDayById: jest.fn().mockResolvedValue(null),
  advanceProgram: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../lib/format", () => ({
  formatTime: jest.fn((s: number) => `${s}s`),
  computePrefillSets: jest.fn(() => []),
}));

jest.mock("../../lib/confirm", () => ({
  confirmAction: jest.fn(),
}));

// --- Helpers ---

function makeSet(overrides: Partial<SetWithMeta> & { id: string }): SetWithMeta {
  return {
    session_id: "session-1",
    exercise_id: "ex-1",
    set_number: 1,
    weight: 60,
    reps: 8,
    completed: false,
    completed_at: null,
    set_type: "normal" as SetType,
    rpe: null,
    notes: null,
    previous: null,
    is_pr: false,
    link_id: null,
    round: null,
    tempo: null,
    swapped_from_exercise_id: null,
    duration_seconds: null,
    exercise_position: 0,
    bodyweight_modifier_kg: null,
    stack_marker: null,
    stack_id: null,
    stack_name_at_log: null,
    stack_unit_at_log: null,
    ...overrides,
  } as SetWithMeta;
}

function makeGroup(overrides: Partial<ExerciseGroup> & { exercise_id: string; sets: SetWithMeta[] }): ExerciseGroup {
  return {
    name: "Cable Row",
    link_id: null,
    is_voltra: false,
    is_bodyweight: false,
    trackingMode: "reps",
    equipment: "cable" as any,
    exercise_position: 0,
    ...overrides,
  };
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
    unit: "lb" as const,
    ...overrides,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("useSessionActions — handleCheck preview wiring (BLD-1137 AC5/AC6/AC12/AC13)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("passes populated preview for the next uncompleted set in the same group (non-last-set)", async () => {
    const startRest = jest.fn();
    const set1 = makeSet({ id: "s1", exercise_id: "ex-1", weight: 60, reps: 8, completed: false });
    const set2 = makeSet({ id: "s2", exercise_id: "ex-1", weight: 65, reps: 6, completed: false });
    const group = makeGroup({ exercise_id: "ex-1", name: "Cable Row", sets: [set1, set2] });

    const { result } = renderHook(() =>
      useSessionActions(createParams({ groups: [group], startRest }))
    );

    await act(async () => {
      await result.current.handleCheck(set1);
      await flush();
    });

    expect(startRest).toHaveBeenCalledTimes(1);
    const ctx = startRest.mock.calls[0][0];
    expect(ctx.preview).not.toBeNull();
    expect(ctx.preview?.exerciseName).toBe("Cable Row");
    expect(ctx.preview?.plannedWeight).toBe(65);
    expect(ctx.preview?.repRange).toBe("6");
    expect(ctx.preview?.weightUnit).toBe("lb");
    expect(ctx.preview?.exerciseKind).toBe("weighted");
    expect(ctx.isLastSet).toBe(false);
  });

  it("passes isLastSet=true and preview=null when completing the final set across all groups", async () => {
    const startRest = jest.fn();
    const onlySet = makeSet({ id: "s1", exercise_id: "ex-1", weight: 80, reps: 5 });
    const group = makeGroup({ exercise_id: "ex-1", name: "Deadlift", sets: [onlySet] });

    const { result } = renderHook(() =>
      useSessionActions(createParams({ groups: [group], startRest }))
    );

    await act(async () => {
      await result.current.handleCheck(onlySet);
      await flush();
    });

    expect(startRest).toHaveBeenCalledTimes(1);
    const ctx = startRest.mock.calls[0][0];
    expect(ctx.isLastSet).toBe(true);
    expect(ctx.preview).toBeNull();
  });

  it("passes preview=null (no next in same group) with isLastSet=false when other groups have uncompleted sets", async () => {
    const startRest = jest.fn();
    // group1 has only one set (to complete); group2 still has an uncompleted set
    const set1 = makeSet({ id: "s1", exercise_id: "ex-1", weight: 60, reps: 8 });
    const group1 = makeGroup({ exercise_id: "ex-1", name: "Cable Row", sets: [set1] });
    const set2 = makeSet({ id: "s2", exercise_id: "ex-2", weight: 50, reps: 10 });
    const group2 = makeGroup({ exercise_id: "ex-2", name: "Lat Pulldown", sets: [set2] });

    const { result } = renderHook(() =>
      useSessionActions(createParams({ groups: [group1, group2], startRest }))
    );

    await act(async () => {
      await result.current.handleCheck(set1);
      await flush();
    });

    expect(startRest).toHaveBeenCalledTimes(1);
    const ctx = startRest.mock.calls[0][0];
    expect(ctx.isLastSet).toBe(false);
    expect(ctx.preview).toBeNull(); // no next set in same exercise group
  });

  it("falls back to progression suggestion when no next set in group — uses real weighted shape (reps: null) and derives repRange from last completed set", async () => {
    const startRest = jest.fn();
    // Only one set in group (will be completed) — no next planned set
    // Set is completed=false initially; handleCheck will mark it done
    const onlySet = makeSet({ id: "s1", exercise_id: "ex-1", weight: 60, reps: 8 });
    const group = makeGroup({ exercise_id: "ex-1", name: "Cable Row", sets: [onlySet] });
    // Also a second group so isLastSet = false
    const set2 = makeSet({ id: "s2", exercise_id: "ex-2", weight: 50, reps: 10 });
    const group2 = makeGroup({ exercise_id: "ex-2", name: "Lat Pulldown", sets: [set2] });

    // Real weighted suggestion shape from lib/rm.ts suggest() — reps is null for increase/maintain
    const suggestion = { type: "increase" as const, weight: 65, reps: null, reason: "All sets completed — increase by 5" };

    const { result } = renderHook(() =>
      useSessionActions(createParams({
        groups: [group, group2],
        startRest,
        suggestions: { "ex-1": suggestion },
      }))
    );

    await act(async () => {
      await result.current.handleCheck(onlySet);
      await flush();
    });

    expect(startRest).toHaveBeenCalledTimes(1);
    const ctx = startRest.mock.calls[0][0];
    expect(ctx.isLastSet).toBe(false);
    expect(ctx.preview).not.toBeNull();
    expect(ctx.preview?.exerciseName).toBe("Cable Row");
    expect(ctx.preview?.plannedWeight).toBe(65);
    // repRange derived from the last completed set (onlySet.reps = 8)
    expect(ctx.preview?.repRange).toBe("8");
    expect(ctx.preview?.exerciseKind).toBe("weighted");
  });
});
