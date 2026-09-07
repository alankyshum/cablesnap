import type { Equipment, Exercise, MuscleGroup } from "./types";

export type DraftReason = {
  code: string;
  input: string;
  rule: string;
  bound?: string;
  fallback?: string;
  uncertainty?: string;
  override?: string;
};

export type LoadGuidance =
  | { kind: "history"; value: number; unit: "kg"; source: "comparable_completed_working_set" }
  | { kind: "conservative"; rpe: 6 | 7; instruction: "start_light_controlled_first_set" };

/** UI-friendly view with the exact P1 persisted fields kept in parallel. */
export type DraftExercise = {
  exercise_id: string;
  rest_seconds: number;
  weight: number | null;
  exerciseId: string;
  name: string;
  equipment: Equipment;
  primaryMuscles: MuscleGroup[];
  sets: number;
  reps: number;
  restSeconds: number;
  load: LoadGuidance;
};

export type WorkoutDraft = {
  schemaVersion: 1;
  name: string;
  targetMinutes: number;
  estimatedMinutes: number;
  exercises: DraftExercise[];
  pattern: string;
  lastWorkout: { startedAt: number; durationMinutes: number; setCount: number } | null;
  restedMuscles: { muscles: MuscleGroup[]; heuristic: true; disclosed: string };
  readiness: "normal" | "reduced" | "clarify";
  reasons: DraftReason[];
  clarification?: string;
  stopGuidance: string;
};

export type ComparableHistory = { weightKg: number; reps: number; completedWorkingSet: true; sessionId?: string };
export type DraftContext = {
  exercises: Exercise[];
  completedSessions: { startedAt: number; durationMinutes?: number | null; setCount: number }[];
  historyByExercise: Record<string, ComparableHistory[]>;
  recentlyTrainedMuscles: MuscleGroup[];
  nowMs: number;
  readiness?: "normal" | "fatigued" | "sore";
  painReported?: boolean;
};

export type DraftRequest = {
  equipment: string[];
  limitedMorning?: boolean;
  requestedMinutes?: number;
  focus?: MuscleGroup[];
  readiness?: "normal" | "fatigued" | "sore";
  painReported?: boolean;
};

export type DraftChange =
  | { kind: "time_cap"; minutes: number }
  | { kind: "add_exercise"; exerciseId: string }
  | { kind: "remove_exercise"; exerciseId: string }
  | { kind: "replace_exercise"; fromExerciseId: string; toExerciseId: string }
  | { kind: "adjust_sets"; exerciseId: string; sets: number }
  | { kind: "adjust_reps"; exerciseId: string; reps: number }
  | { kind: "adjust_rest"; exerciseId: string; restSeconds: number }
  | { kind: "focus"; muscles: MuscleGroup[] };

const DISCLOSURE =
  "Rested-muscle status is a history-based heuristic only; sleep, soreness, illness, pain, manual labor, and unrecorded activity are not captured. Stop or modify the workout if pain or concerning symptoms occur.";
const STOP = "Stop or modify the exercise if pain or concerning symptoms occur; this is editable guidance, not a medical, injury, or form diagnosis.";
const EQUIPMENT: Equipment[] = ["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "band", "other"];

function normalize(value: string): string { return value.trim().toLowerCase().replace(/\s+/g, " "); }
function equipmentMatch(label: string, equipment: Equipment): boolean {
  const x = normalize(label);
  return x === equipment || (x.includes(equipment) && equipment !== "other") ||
    (equipment === "bodyweight" && /(body.?weight|pull.?up|dip)/.test(x));
}
function capFor(minutes: number): number {
  const bounded = Math.max(30, Math.min(60, minutes));
  return Math.min(18, Math.max(12, Math.floor(12 + ((bounded - 30) * 6) / 30)));
}
function median(values: number[]): number | null {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const middle = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[middle] : (xs[middle - 1] + xs[middle]) / 2;
}
function estimateMinutes(exercises: DraftExercise[]): number {
  return Math.ceil(exercises.reduce((sum, e) => sum + e.sets * 0.75 + (e.sets - 1) * e.restSeconds / 60 + 1, 0));
}
function reason(code: string, input: string, rule: string, extra: Partial<DraftReason> = {}): DraftReason {
  return { code, input, rule, ...extra };
}

export function resolveTargetMinutes(request: DraftRequest, context: DraftContext): { minutes: number; reason: DraftReason } {
  const durations = context.completedSessions.slice(0, 8).map(s => s.durationMinutes ?? 0).filter(n => n > 0);
  const historical = median(durations);
  if (request.requestedMinutes != null) {
    const minutes = Math.max(30, Math.min(60, Math.round(request.requestedMinutes)));
    return { minutes, reason: reason("duration.user", String(request.requestedMinutes), "use explicit duration", { bound: "30–60 minutes" }) };
  }
  if (request.limitedMorning) {
    if (historical != null && historical >= 20 && historical <= 45) {
      return { minutes: Math.round(historical), reason: reason("duration.median_limited", "latest up-to-eight completed sessions", "adjust limited-morning default by historical median", { bound: "20–45 minutes" }) };
    }
    return { minutes: 30, reason: reason("duration.limited_fallback", "limited morning", "use product default", { fallback: "30 minutes", bound: "historical median outside 20–45 minutes is ignored" }) };
  }
  if (historical != null) return { minutes: Math.max(30, Math.min(60, Math.round(historical))), reason: reason("duration.median", "latest up-to-eight completed sessions", "clamp historical median", { bound: "30–60 minutes" }) };
  return { minutes: 45, reason: reason("duration.fallback", "no usable duration history", "use product fallback", { fallback: "45 minutes" }) };
}

// The deterministic rule matrix is intentionally explicit for auditability.
// eslint-disable-next-line complexity
export function generateWorkoutDraft(request: DraftRequest, context: DraftContext): WorkoutDraft | { kind: "clarification"; message: string; reasons: DraftReason[] } {
  const labels = [...new Set(request.equipment.map(normalize).filter(Boolean))].sort();
  if (!labels.length) return { kind: "clarification", message: "Which equipment is available? I will not infer it from an ambiguous photo.", reasons: [reason("equipment.missing", "no equipment labels", "request clarification", { uncertainty: "insufficient context" })] };
  const known = labels.filter(label => EQUIPMENT.some(e => equipmentMatch(label, e)));
  // Do not silently discard one uncertain classification just because another
  // label happened to match. The model is allowed to classify equipment only;
  // ambiguous context must come back to the user rather than becoming an
  // invented exercise selection.
  const unknown = labels.filter(label => !known.includes(label));
  if (!known.length || unknown.length) return { kind: "clarification", message: "I could not unambiguously match all equipment labels to the local exercise library. Please clarify the equipment labels.", reasons: [reason("equipment.unknown", unknown.length ? unknown.join(", ") : labels.join(", "), "request clarification", { uncertainty: unknown.length ? "one or more labels are outside the closed vocabulary" : "not in closed vocabulary" })] };
  const { minutes, reason: durationReason } = resolveTargetMinutes(request, context);
  const readiness = request.readiness ?? context.readiness ?? "normal";
  if (request.painReported || context.painReported) return { kind: "clarification", message: "Are you experiencing pain or concerning symptoms? Clarify before training, or defer and seek appropriate professional advice.", reasons: [reason("readiness.pain", "pain reported", "clarify or defer rather than fabricate a prescription")] };
  const reduction = readiness === "normal" ? 1 : 0.8;
  const volumeCap = Math.floor(capFor(minutes) * reduction);
  const unfamiliar = new Set(labels.filter(label => !context.exercises.some(e => equipmentMatch(label, e.equipment))));
  const candidates = context.exercises.filter(e => !e.deleted_at && known.some(label => equipmentMatch(label, e.equipment))).sort((a, b) => a.id.localeCompare(b.id));
  if (!candidates.length) return { kind: "clarification", message: "No active local exercises match the detected equipment; please clarify or choose another equipment label.", reasons: [reason("equipment.no_library_match", known.join(", "), "request clarification", { uncertainty: "library has no active compatible exercise" })] };
  const focus = request.focus ?? [];
  const recentlyTrained = new Set(context.recentlyTrainedMuscles);
  const ranked = [...candidates].sort((a, b) => {
    const af = focus.some(m => a.primary_muscles.includes(m)) ? 0 : 1;
    const bf = focus.some(m => b.primary_muscles.includes(m)) ? 0 : 1;
    const ar = a.primary_muscles.some(m => recentlyTrained.has(m)) ? 1 : 0;
    const br = b.primary_muscles.some(m => recentlyTrained.has(m)) ? 1 : 0;
    return af - bf || ar - br || a.id.localeCompare(b.id);
  });
  const exercises: DraftExercise[] = [];
  let setsUsed = 0;
  for (const ex of ranked) {
    if (setsUsed >= volumeCap || exercises.length >= 6) break;
    const exUnfamiliar = unfamiliar.has(ex.equipment) || !(context.historyByExercise[ex.id] ?? []).some(h => h.completedWorkingSet);
    const sets = Math.min(3, volumeCap - setsUsed);
    const history = context.historyByExercise[ex.id] ?? [];
    const latest = history.find(h => h.completedWorkingSet && h.weightKg >= 0);
    const load = latest && !exUnfamiliar ? { kind: "history" as const, value: latest.weightKg, unit: "kg" as const, source: "comparable_completed_working_set" as const } : { kind: "conservative" as const, rpe: 6 as const, instruction: "start_light_controlled_first_set" as const };
    const reps = exUnfamiliar ? 12 : 8;
    exercises.push({ exercise_id: ex.id, rest_seconds: 90, weight: load.kind === "history" ? load.value : null, exerciseId: ex.id, name: ex.name, equipment: ex.equipment, primaryMuscles: [...ex.primary_muscles], sets, reps, restSeconds: 90, load });
    setsUsed += sets;
  }
  const last = context.completedSessions[0] ?? null;
  const reasons: DraftReason[] = [durationReason, reason("volume.cap", `${minutes} minutes`, "bounded working-set cap", { bound: `at most ${capFor(minutes)} sets at target; ${readiness === "normal" ? "no reduction" : "20% reduction for fatigue/soreness"}` })];
  if (readiness !== "normal") reasons.push(reason("readiness.reduction", readiness, "reduce planned volume", { bound: "10–20%", uncertainty: "self-reported readiness context" }));
  if (exercises.some(e => e.load.kind === "conservative")) reasons.push(reason("load.unfamiliar", "unfamiliar equipment or no comparable completed working-set history", "12–15 reps, RPE 6–7, start light and adjust after a controlled first set", { uncertainty: "no comparable load history" }));
  if (focus.length) reasons.push(reason("focus.user", focus.join(","), "prioritize requested muscles", { override: "user focus" }));
  const activeMuscles = [...new Set(candidates.flatMap(e => e.primary_muscles))].sort();
  const restedMuscles = activeMuscles.filter(m => !recentlyTrained.has(m));
  reasons.push(reason("recovery.heuristic", context.recentlyTrainedMuscles.join(",") || "no recent muscle history", "exclude recently trained muscles from rested candidates", { uncertainty: DISCLOSURE }));
  reasons.push(reason("safety.stop_modify", "all exercises", "provide stop/modify guidance", { uncertainty: STOP }));
  return { schemaVersion: 1, name: focus.length ? `Focused ${focus.join(" / ")} workout` : "Equipment workout draft", targetMinutes: minutes, estimatedMinutes: estimateMinutes(exercises), exercises, pattern: exercises.map(e => e.primaryMuscles[0] ?? "full_body").join(","), lastWorkout: last ? { startedAt: last.startedAt, durationMinutes: last.durationMinutes ?? 0, setCount: last.setCount } : null, restedMuscles: { muscles: restedMuscles, heuristic: true, disclosed: DISCLOSURE }, readiness: readiness === "normal" ? "normal" : "reduced", reasons, stopGuidance: STOP };
}

// The bounded operation matrix is intentionally explicit and auditable.
// eslint-disable-next-line complexity
export function applyDraftChange(draft: WorkoutDraft, change: DraftChange, context: DraftContext): WorkoutDraft | { kind: "invalid_change"; message: string } {
  const next = structuredClone(draft) as WorkoutDraft;
  // P1 persists the snake_case ID; the UI-facing compatibility field is only
  // valid when it agrees with it. Never let a stale compatibility field direct
  // a change to a different exercise.
  for (const item of next.exercises) {
    if (!item.exercise_id || item.exerciseId != null && item.exercise_id !== item.exerciseId) {
      return { kind: "invalid_change", message: "Draft exercise identifiers are inconsistent." };
    }
    item.exerciseId = item.exercise_id;
  }
  const exerciseId = (item: DraftExercise) => item.exercise_id;
  if (change.kind === "time_cap") next.targetMinutes = Math.max(30, Math.min(60, Math.round(change.minutes)));
  else if (change.kind === "focus") next.name = change.muscles.length ? `Focused ${change.muscles.join(" / ")} workout` : "Equipment workout draft";
  else {
    const item = change.kind === "replace_exercise"
      ? next.exercises.find(e => exerciseId(e) === change.fromExerciseId)
      : "exerciseId" in change ? next.exercises.find(e => exerciseId(e) === change.exerciseId) : undefined;
    if (change.kind === "remove_exercise") { next.exercises = next.exercises.filter(e => e.exerciseId !== change.exerciseId); }
    else if (change.kind === "add_exercise") { const ex = context.exercises.find(e => e.id === change.exerciseId && !e.deleted_at); if (!ex) return { kind: "invalid_change", message: "Exercise is not an active local library exercise." }; if (next.exercises.some(e => e.exerciseId === ex.id)) return { kind: "invalid_change", message: "Exercise is already in the draft." }; const load = { kind: "conservative" as const, rpe: 6 as const, instruction: "start_light_controlled_first_set" as const }; next.exercises.push({ exercise_id: ex.id, rest_seconds: 90, weight: null, exerciseId: ex.id, name: ex.name, equipment: ex.equipment, primaryMuscles: [...ex.primary_muscles], sets: 2, reps: 12, restSeconds: 90, load }); }
    else if (change.kind === "replace_exercise") { const ex = context.exercises.find(e => e.id === change.toExerciseId && !e.deleted_at); if (!item || !ex) return { kind: "invalid_change", message: "Replacement must use active local exercises." }; const load = { kind: "conservative" as const, rpe: 6 as const, instruction: "start_light_controlled_first_set" as const }; next.exercises[next.exercises.indexOf(item)] = { ...item, exercise_id: ex.id, exerciseId: ex.id, name: ex.name, equipment: ex.equipment, primaryMuscles: [...ex.primary_muscles], weight: null, load }; }
    else if (!item) return { kind: "invalid_change", message: "Exercise is not in the draft." };
    else if (change.kind === "adjust_sets") item.sets = Math.max(1, Math.min(6, Math.round(change.sets)));
    else if (change.kind === "adjust_reps") item.reps = Math.max(1, Math.min(30, Math.round(change.reps)));
    else if (change.kind === "adjust_rest") item.restSeconds = Math.max(30, Math.min(300, Math.round(change.restSeconds)));
  }
  const cap = Math.floor(capFor(next.targetMinutes) * (next.readiness === "reduced" ? 0.8 : 1));
  let remaining = cap;
  next.exercises = next.exercises.map(e => { const sets = Math.min(e.sets, remaining); remaining -= sets; return { ...e, sets }; }).filter(e => e.sets > 0);
  next.exercises = next.exercises.map(e => ({ ...e, exercise_id: exerciseId(e), rest_seconds: e.restSeconds, weight: e.load.kind === "history" ? e.load.value : null }));
  next.estimatedMinutes = estimateMinutes(next.exercises);
  next.reasons = [...next.reasons, reason("change.validated", change.kind, "apply bounded user operation", { bound: `at most ${cap} working sets` })];
  return next;
}
