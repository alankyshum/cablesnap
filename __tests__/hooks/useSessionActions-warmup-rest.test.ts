import { renderHook, act } from "@testing-library/react-native";
import { useSessionActions } from "../../hooks/useSessionActions";
import type { ExerciseGroup, SetWithMeta } from "../../components/session/types";
import type { SetType } from "../../lib/types";

// --- Mocks ---

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Medium: "medium", Heavy: "heavy" },
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
  updateSetTrainingMode: jest.fn().mockResolvedValue(undefined),
  getSessionSets: jest.fn().mockResolvedValue([]),
  getRestSecondsForLink: jest.fn().mockResolvedValue(90),
  updateSetDuration: jest.fn().mockResolvedValue(undefined),
  checkSetPR: jest.fn().mockResolvedValue(false),
  updateExercisePositions: jest.fn().mockResolvedValue(undefined),
  getGoalForExercise: jest.fn().mockResolvedValue(null),
  achieveGoal: jest.fn().mockResolvedValue(undefined),
  getCurrentBestWeight: jest.fn().mockResolvedValue(null),
}));

jest.mock("../../lib/query", () => ({
  bumpQueryVersion: jest.fn(),
  queryClient: {
    removeQueries: jest.fn(),
  },
}));

jest.mock("../../lib/programs", () => ({
  getSessionProgramDayId: jest.fn().mockResolvedValue(null),
  getProgramDayById: jest.fn().mockResolvedValue(null),
  advanceProgram: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../lib/format", () => ({
  formatTime: jest.fn((s: number) => `${s}s`),
}));

jest.mock("../../lib/confirm", () => ({
  confirmAction: jest.fn().mockResolvedValue(true),
}));

// --- Helpers ---

function makeSet(overrides: Partial<SetWithMeta> = {}): SetWithMeta {
  return {
    id: "set-1",
    session_id: "session-1",
    exercise_id: "ex-1",
    set_number: 1,
    weight: 100,
    reps: 10,
    completed: false,
    completed_at: null,
    set_type: "normal" as SetType,
    rpe: null,
    notes: "",
    previous: "-",
    is_pr: false,
    link_id: null,
    round: null,
    training_mode: null,
    tempo: null,
    swapped_from_exercise_id: null,
    duration_seconds: null,
    exercise_position: 0,
    ...overrides,
  };
}

function makeGroup(overrides: Partial<ExerciseGroup> = {}): ExerciseGroup {
  return {
    exercise_id: "ex-1",
    name: "Bench Press",
    sets: [makeSet()],
    link_id: null,
    is_voltra: false,
    is_bodyweight: false,
    training_modes: [],
    trackingMode: "reps",
    equipment: "barbell",
    exercise_position: 0,
    ...overrides,
  };
}

describe("useSessionActions – warmup rest timer guard", () => {
  const startRest = jest.fn();
  const startRestWithDuration = jest.fn();
  const updateGroupSet = jest.fn();
  const showToast = jest.fn();
  const showError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function renderActions(groups: ExerciseGroup[]) {
    return renderHook(() =>
      useSessionActions({
        id: "session-1",
        groups,
        setGroups: jest.fn(),
        modes: {},
        setModes: jest.fn(),
        updateGroupSet,
        startRest,
        startRestWithDuration,
        session: { started_at: Date.now(), name: "Test" },
        showToast,
        showError,
      }),
    );
  }

  it("auto-starts rest timer when a normal set is completed", async () => {
    const normalSet = makeSet({ set_type: "normal" as SetType });
    const group = makeGroup({ sets: [normalSet] });
    const { result } = renderActions([group]);

    await act(async () => {
      await result.current.handleCheck(normalSet);
    });

    expect(startRest).toHaveBeenCalledWith("ex-1");
  });

  it("does NOT auto-start rest timer when a warmup set is completed", async () => {
    const warmupSet = makeSet({ set_type: "warmup" as SetType });
    const group = makeGroup({ sets: [warmupSet] });
    const { result } = renderActions([group]);

    await act(async () => {
      await result.current.handleCheck(warmupSet);
    });

    expect(startRest).not.toHaveBeenCalled();
    expect(startRestWithDuration).not.toHaveBeenCalled();
  });

  it("auto-starts rest timer for non-warmup linked set at end of superset", async () => {
    const linkedSet = makeSet({ set_type: "normal" as SetType, exercise_id: "ex-1", link_id: "link-1" });
    // Single group with link_id → this exercise is the only (and last) in the superset
    const group = makeGroup({ exercise_id: "ex-1", sets: [linkedSet], link_id: "link-1" });
    const { result } = renderActions([group]);

    await act(async () => {
      await result.current.handleCheck(linkedSet);
    });

    // Last exercise in the linked group → startRestWithDuration
    expect(startRestWithDuration).toHaveBeenCalledWith(90);
  });

  it("does NOT auto-start rest timer for warmup set in a superset", async () => {
    const warmupLinkedSet = makeSet({ set_type: "warmup" as SetType, exercise_id: "ex-1", link_id: "link-1" });
    const group = makeGroup({ exercise_id: "ex-1", sets: [warmupLinkedSet], link_id: "link-1" });
    const { result } = renderActions([group]);

    await act(async () => {
      await result.current.handleCheck(warmupLinkedSet);
    });

    expect(startRest).not.toHaveBeenCalled();
    expect(startRestWithDuration).not.toHaveBeenCalled();
  });
});
