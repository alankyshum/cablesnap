import { applyDraftChange, generateWorkoutDraft, resolveTargetMinutes } from "../../lib/coach-workout-draft";
import type { DraftContext } from "../../lib/coach-workout-draft";
import type { Exercise } from "../../lib/types";

const exercise = (id: string, equipment: Exercise["equipment"]): Exercise => ({ id, name: id, category: "back", primary_muscles: ["back"], secondary_muscles: [], equipment, instructions: "", difficulty: "beginner", is_custom: false });
const context = (overrides: Partial<DraftContext> = {}): DraftContext => ({ exercises: [exercise("a", "cable"), exercise("b", "cable"), exercise("c", "cable"), exercise("d", "cable"), exercise("e", "cable"), exercise("f", "cable"), exercise("g", "cable")], completedSessions: [], historyByExercise: {}, recentlyTrainedMuscles: [], nowMs: 1, ...overrides });

test("is deterministic and applies hard 12/18 caps", () => {
  const a = generateWorkoutDraft({ equipment: ["cable"], requestedMinutes: 30 }, context());
  const b = generateWorkoutDraft({ equipment: ["cable"], requestedMinutes: 60 }, context());
  expect(a).toEqual(generateWorkoutDraft({ equipment: ["cable"], requestedMinutes: 30 }, context()));
  if ("exercises" in a) expect(a.exercises.reduce((n, e) => n + e.sets, 0)).toBeLessThanOrEqual(12);
  if ("exercises" in b) expect(b.exercises.reduce((n, e) => n + e.sets, 0)).toBeLessThanOrEqual(18);
});
test("unfamiliar or no history never gets a numeric load", () => { const result = generateWorkoutDraft({ equipment: ["cable"] }, context()); if ("exercises" in result) { expect(result.exercises[0].reps).toBe(12); expect(result.exercises[0].load.kind).toBe("conservative"); expect(JSON.stringify(result.reasons)).toContain("RPE 6–7"); } });
test("clarifies ambiguous equipment and reduces readiness volume", () => { expect(generateWorkoutDraft({ equipment: ["mystery"] }, context())).toHaveProperty("kind", "clarification"); const result = generateWorkoutDraft({ equipment: ["cable"], requestedMinutes: 60, readiness: "sore" }, context()); if ("exercises" in result) expect(result.exercises.reduce((n, e) => n + e.sets, 0)).toBeLessThanOrEqual(14); });
test("clarifies mixed known and unknown equipment instead of discarding uncertainty", () => { expect(generateWorkoutDraft({ equipment: ["cable", "mystery"] }, context())).toHaveProperty("kind", "clarification"); });
test("uses only comparable completed-set history for numeric load and discloses heuristic recovery", () => {
  const result = generateWorkoutDraft({ equipment: ["cable"] }, context({ historyByExercise: { a: [{ weightKg: 20, reps: 8, completedWorkingSet: true }] }, recentlyTrainedMuscles: ["back"] }));
  if (!("exercises" in result)) throw new Error("expected draft");
  expect(result.exercises.find(e => e.exerciseId === "a")?.load).toEqual({ kind: "history", value: 20, unit: "kg", source: "comparable_completed_working_set" });
  expect(result.restedMuscles.disclosed).toContain("sleep");
  expect(result.stopGuidance).toContain("pain");
});
test("bounded changes preserve cap", () => { const result = generateWorkoutDraft({ equipment: ["cable"], requestedMinutes: 30 }, context()); if (!("exercises" in result)) throw new Error("expected draft"); const changed = applyDraftChange(result, { kind: "adjust_sets", exerciseId: "a", sets: 99 }, context()); if ("exercises" in changed) expect(changed.exercises.reduce((n, e) => n + e.sets, 0)).toBeLessThanOrEqual(12); });
test("limited morning uses only an in-bound median and standard duration has bounded median/fallback", () => {
  const sessions = (durations: number[]) => durations.map((durationMinutes, i) => ({ startedAt: i, durationMinutes, setCount: 5 }));
  expect(resolveTargetMinutes({ equipment: ["cable"], limitedMorning: true }, context({ completedSessions: sessions([20, 40, 30]) })).minutes).toBe(30);
  expect(resolveTargetMinutes({ equipment: ["cable"], limitedMorning: true }, context({ completedSessions: sessions([10, 50]) })).minutes).toBe(30);
  expect(resolveTargetMinutes({ equipment: ["cable"], limitedMorning: false }, context()).minutes).toBe(45);
  expect(resolveTargetMinutes({ equipment: ["cable"], limitedMorning: false }, context({ completedSessions: sessions([10, 20, 100]) })).minutes).toBe(30);
  expect(resolveTargetMinutes({ equipment: ["cable"], limitedMorning: false }, context({ completedSessions: sessions([50, 70]) })).minutes).toBe(60);
});
test("pain clarifies and unfamiliar equipment can be replaced with conservative guidance", () => {
  const pain = generateWorkoutDraft({ equipment: ["cable"], painReported: true }, context());
  expect(pain).toHaveProperty("kind", "clarification");
  const replacementContext = context({ exercises: [...context().exercises, exercise("dumbbell-replacement", "dumbbell")] });
  const draft = generateWorkoutDraft({ equipment: ["cable"] }, replacementContext);
  if (!("exercises" in draft)) throw new Error("expected draft");
  const changed = applyDraftChange(draft, { kind: "replace_exercise", fromExerciseId: "a", toExerciseId: "dumbbell-replacement" }, replacementContext);
  if (!("exercises" in changed)) throw new Error("expected changed draft");
  expect(changed.exercises.find(e => e.exerciseId === "dumbbell-replacement")?.load.kind).toBe("conservative");
});
test("stable ties, deleted exercises, rested muscles, and realistic overrun are deterministic", () => {
  const deleted = { ...exercise("deleted", "cable"), deleted_at: 1 };
  const result = generateWorkoutDraft({ equipment: ["cable"], requestedMinutes: 30 }, context({ exercises: [exercise("b", "cable"), exercise("a", "cable"), deleted], recentlyTrainedMuscles: ["back"] }));
  if (!("exercises" in result)) throw new Error("expected draft");
  expect(result.exercises.map(e => e.exerciseId)).toEqual(["a", "b"]);
  expect(result.exercises.some(e => e.exerciseId === "deleted")).toBe(false);
  expect(result.restedMuscles.muscles).not.toContain("back");
  let overrun = result;
  const overrunContext = context();
  const expanded = applyDraftChange(overrun, { kind: "add_exercise", exerciseId: "g" }, overrunContext);
  if (!("exercises" in expanded)) throw new Error("expected expanded draft");
  overrun = expanded;
  for (const item of result.exercises) {
    const changed = applyDraftChange(overrun, { kind: "adjust_rest", exerciseId: item.exerciseId, restSeconds: 300 }, overrunContext);
    if (!("exercises" in changed)) throw new Error("expected changed draft");
    overrun = changed;
  }
  expect(overrun.estimatedMinutes).toBeGreaterThan(overrun.targetMinutes);
});
test("reduced readiness remains capped after every change", () => {
  const draft = generateWorkoutDraft({ equipment: ["cable"], requestedMinutes: 60, readiness: "fatigued" }, context());
  if (!("exercises" in draft)) throw new Error("expected draft");
  for (const change of [{ kind: "adjust_sets", exerciseId: "a", sets: 99 } as const, { kind: "add_exercise", exerciseId: "g" } as const, { kind: "time_cap", minutes: 60 } as const]) {
    const changed = applyDraftChange(draft, change, context());
    if ("exercises" in changed) expect(changed.exercises.reduce((n, e) => n + e.sets, 0)).toBeLessThanOrEqual(14);
  }
});
