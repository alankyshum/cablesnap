/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prefer-const */
let mockCreate: jest.Mock;
let mockGet: jest.Mock;
let mockAppend: jest.Mock;
let mockList: jest.Mock;
let mockRestore: jest.Mock;
let mockContext: jest.Mock;
let mockGenerate: jest.Mock;

jest.mock("@/lib/db/coach-workout-drafts", () => {
  const actual = jest.requireActual("@/lib/db/coach-workout-drafts");
  return { ...actual, createCoachWorkoutDraft: (...args: unknown[]) => mockCreate(...args), getCoachWorkoutDraft: (...args: unknown[]) => mockGet(...args), appendCoachWorkoutDraftRevision: (...args: unknown[]) => mockAppend(...args), listCoachWorkoutDraftRevisions: (...args: unknown[]) => mockList(...args), restoreCoachWorkoutDraftRevision: (...args: unknown[]) => mockRestore(...args) };
});
jest.mock("@/lib/db/coach-workout-context", () => ({ readCoachWorkoutContext: (...args: unknown[]) => mockContext(...args) }));
jest.mock("@/lib/coach-workout-draft", () => {
  const actual = jest.requireActual("@/lib/coach-workout-draft");
  return { ...actual, generateWorkoutDraft: (...args: unknown[]) => mockGenerate(...args) };
});
import { createGymPhotoWorkoutDraftTools } from "@/lib/ai/tools/gym-photo-workout-draft";
import { CoachWorkoutDraftError } from "@/lib/db/coach-workout-drafts";

mockCreate = jest.fn();
mockGet = jest.fn();
mockAppend = jest.fn();
mockList = jest.fn();
mockRestore = jest.fn();
mockContext = jest.fn();
mockGenerate = jest.fn();

async function execute(toolValue: any, input: unknown): Promise<any> {
  return toolValue.execute(input, {});
}

const draft = {
  schemaVersion: 1,
  name: "Equipment workout draft",
  targetMinutes: 45,
  estimatedMinutes: 30,
  exercises: [{ exercise_id: "ex-1", exerciseId: "ex-1", name: "Press", equipment: "dumbbell", primaryMuscles: ["chest"], sets: 3, reps: 8, restSeconds: 90, rest_seconds: 90, weight: null, load: { kind: "conservative", rpe: 6, instruction: "start_light_controlled_first_set" } }],
  pattern: "chest",
  lastWorkout: null,
  restedMuscles: { muscles: ["chest"], heuristic: true, disclosed: "heuristic" },
  readiness: "normal",
  reasons: [{ code: "duration.fallback", input: "none", rule: "fallback", fallback: "45 minutes" }],
  stopGuidance: "Stop if pain occurs.",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockContext.mockResolvedValue({ exercises: [], completedSessions: [], historyByExercise: {}, recentlyTrainedMuscles: [], nowMs: 1 });
  mockGenerate.mockReturnValue(draft);
  mockCreate.mockResolvedValue({ id: "draft-1", revision: { version: 1 } });
  mockGet.mockImplementation(async (draftId: string) => draftId === "missing" ? null : { id: "draft-1", revision: { version: 1, canonical_draft: draft } });
  mockAppend.mockResolvedValue({ version: 2, canonical_draft: draft, reason_ledger: draft.reasons });
  mockList.mockResolvedValue([{ version: 1, canonical_draft: draft, reason_ledger: draft.reasons }]);
  mockRestore.mockResolvedValue({ version: 3, canonical_draft: draft, reason_ledger: [{ code: "restored", input: "v1", rule: "append" }] });
});

describe("gym-photo workout draft tools", () => {
  it("accepts only structured equipment classification and never image data", async () => {
    const tools = createGymPhotoWorkoutDraftTools("coach-1");
    await expect(execute(tools.detect_gym_equipment, {
      equipment: [{ label: "dumbbell", confidence: 0.91, uncertainty: "partially occluded" }],
    })).resolves.toEqual({
      ok: true,
      operation: "detect_equipment",
      data: { equipment: [{ label: "dumbbell", confidence: 0.91, uncertainty: "partially occluded" }] },
    });
    const result = JSON.stringify(await execute(tools.detect_gym_equipment, {
      equipment: [{ label: "cable", confidence: 0.8 }],
    }));
    expect(result).not.toMatch(/photo|uri|base64|bytes|exif|location/i);
  });

  it("returns a recoverable ownership error before any draft read or write", async () => {
    const tools = createGymPhotoWorkoutDraftTools("coach-1");
    await expect(execute(tools.create_gym_workout_draft, {
      coachSessionId: "coach-2",
      equipment: [{ label: "barbell", confidence: 0.99 }],
    })).resolves.toEqual({
      ok: false,
      error: { kind: "ownership", message: "This workout draft belongs to another coach session.", recoverable: true },
    });
  });

  it("requires clarification for malformed or ambiguous equipment", async () => {
    const tools = createGymPhotoWorkoutDraftTools("coach-1");
    await expect(execute(tools.detect_gym_equipment, {
      equipment: [{ label: "dumbbell", confidence: 0.4 }],
    })).resolves.toMatchObject({ ok: false, error: { kind: "clarification", recoverable: true } });
    await expect(execute(tools.detect_gym_equipment, {
      equipment: [{ label: "unidentified apparatus", confidence: 0.99 }],
    })).resolves.toMatchObject({ ok: false, error: { kind: "clarification", recoverable: true } });
  });

  it("detects, deduplicates aliases, immediately persists, and returns the card DTO", async () => {
    const tools = createGymPhotoWorkoutDraftTools("coach-1");
    await execute(tools.detect_gym_equipment, { equipment: [{ label: "Dumbbells", confidence: 0.7 }, { label: "dumbbell", confidence: 0.95, uncertainty: "clear" }] });
    const result = await execute(tools.create_gym_workout_draft, { coachSessionId: "coach-1", equipment: [{ label: "Dumbbells", confidence: 0.7 }, { label: "dumbbell", confidence: 0.95 }], limitedMorning: true });
    const draftCard = { ...draft };
    delete (draftCard as { reasons?: unknown }).reasons;
    expect(result).toMatchObject({ ok: true, operation: "create_draft", data: { draftId: "draft-1", revision: 1, equipment: [{ label: "dumbbell", confidence: 0.95, uncertainty: "clear" }], draft: draftCard, reasons: draft.reasons } });
    expect(Object.keys(result.data)).toEqual(["draftId", "revision", "equipment", "draft", "reasons"]);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ coachSessionId: "coach-1", sourceKind: "gym_photo_equipment", reasonLedger: draft.reasons }));
  });

  it("requires detection and rejects mismatched equipment without persistence", async () => {
    const tools = createGymPhotoWorkoutDraftTools("coach-1");
    await expect(execute(tools.create_gym_workout_draft, { coachSessionId: "coach-1", equipment: [{ label: "dumbbell", confidence: 0.9 }] })).resolves.toMatchObject({ ok: false, error: { kind: "clarification" } });
    await execute(tools.detect_gym_equipment, { equipment: [{ label: "cable", confidence: 0.9 }] });
    await expect(execute(tools.create_gym_workout_draft, { coachSessionId: "coach-1", equipment: [{ label: "machine", confidence: 0.9 }] })).resolves.toMatchObject({ ok: false, error: { kind: "clarification" } });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("modifies successfully, reports stale conflict, and validates exercise errors without writes", async () => {
    const tools = createGymPhotoWorkoutDraftTools("coach-1");
    await expect(execute(tools.modify_gym_workout_draft, { draftId: "draft-1", expectedRevision: 1, change: { kind: "adjust_sets", exerciseId: "ex-1", sets: 2 } })).resolves.toMatchObject({ ok: true, operation: "modify_draft", data: { revision: 2 } });
    expect(mockAppend).toHaveBeenCalledTimes(1);
    mockAppend.mockRejectedValueOnce(new CoachWorkoutDraftError("conflict", "Workout draft was changed elsewhere."));
    await expect(execute(tools.modify_gym_workout_draft, { draftId: "draft-1", expectedRevision: 1, change: { kind: "adjust_sets", exerciseId: "ex-1", sets: 2 } })).resolves.toMatchObject({ ok: false, error: { kind: "conflict", recoverable: true } });
    await expect(execute(tools.modify_gym_workout_draft, { draftId: "draft-1", expectedRevision: 1, change: { kind: "remove_exercise", exerciseId: "missing" } })).resolves.toMatchObject({ ok: false, error: { kind: "invalid" } });
    await expect(execute(tools.modify_gym_workout_draft, { draftId: "missing", expectedRevision: 1, change: { kind: "adjust_sets", exerciseId: "ex-1", sets: 2 } })).resolves.toMatchObject({ ok: false, error: { kind: "not_found" } });
    await expect(execute(tools.modify_gym_workout_draft, { draftId: "draft-1", expectedRevision: 1, change: { kind: "add_exercise", exerciseId: "inactive" } })).resolves.toMatchObject({ ok: false, error: { kind: "invalid" } });
    mockCreate.mockRejectedValueOnce(new Error("database unavailable"));
    const failingTools = createGymPhotoWorkoutDraftTools("coach-1");
    await execute(failingTools.detect_gym_equipment, { equipment: [{ label: "dumbbell", confidence: 0.9 }] });
    await expect(execute(failingTools.create_gym_workout_draft, { coachSessionId: "coach-1", equipment: [{ label: "dumbbell", confidence: 0.9 }] })).resolves.toMatchObject({ ok: false, error: { kind: "local_data_unavailable", recoverable: true } });
  });

  it("lists revisions and restores with an ordered non-empty reason ledger", async () => {
    const tools = createGymPhotoWorkoutDraftTools("coach-1");
    await expect(execute(tools.list_gym_workout_revisions, { draftId: "draft-1" })).resolves.toMatchObject({ ok: true, data: { revisions: [{ version: 1 }] } });
    const result = await execute(tools.restore_gym_workout_revision, { draftId: "draft-1", version: 1, expectedRevision: 2 });
    expect(result).toMatchObject({ ok: true, operation: "restore_revision", data: { revision: 3, reasons: [{ code: "restored" }] } });
    expect(JSON.parse(JSON.stringify(result.data)).reasons).toEqual([{ code: "restored", input: "v1", rule: "append" }]);
    expect(mockRestore).toHaveBeenCalledWith("draft-1", 1, 2, "coach-1");
  });
});
