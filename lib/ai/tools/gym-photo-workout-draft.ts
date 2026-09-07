import { tool } from "ai";
import { z } from "zod";
import {
  appendCoachWorkoutDraftRevision,
  createCoachWorkoutDraft,
  getCoachWorkoutDraft,
  listCoachWorkoutDraftRevisions,
  restoreCoachWorkoutDraftRevision,
  CoachWorkoutDraftError,
} from "../../db/coach-workout-drafts";
import { readCoachWorkoutContext } from "../../db/coach-workout-context";
import { applyDraftChange, generateWorkoutDraft, type DraftChange, type DraftRequest, type WorkoutDraft } from "../../coach-workout-draft";

const equipment = z.object({
  label: z.string().trim().min(1).max(40),
  confidence: z.number().min(0).max(1),
  uncertainty: z.string().trim().max(160).optional(),
});
const change = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("time_cap"), minutes: z.number().int().min(20).max(90) }),
  z.object({ kind: z.literal("add_exercise"), exerciseId: z.string().min(1).max(100) }),
  z.object({ kind: z.literal("remove_exercise"), exerciseId: z.string().min(1).max(100) }),
  z.object({ kind: z.literal("replace_exercise"), fromExerciseId: z.string().min(1).max(100), toExerciseId: z.string().min(1).max(100) }),
  z.object({ kind: z.literal("adjust_sets"), exerciseId: z.string().min(1).max(100), sets: z.number().int().min(1).max(6) }),
  z.object({ kind: z.literal("adjust_reps"), exerciseId: z.string().min(1).max(100), reps: z.number().int().min(1).max(30) }),
  z.object({ kind: z.literal("adjust_rest"), exerciseId: z.string().min(1).max(100), restSeconds: z.number().int().min(30).max(300) }),
  z.object({ kind: z.literal("focus"), muscles: z.array(z.string()).max(8) }),
]);
const EQUIPMENT_ALIASES: Record<string, string> = {
  barbell: "barbell", barbells: "barbell", olympic_bar: "barbell", olympic_barbell: "barbell",
  dumbbell: "dumbbell", dumbbells: "dumbbell", free_weights: "dumbbell",
  cable: "cable", cables: "cable", cable_machine: "cable", pulley: "cable", pulleys: "cable",
  machine: "machine", machines: "machine", gym_machine: "machine",
  bodyweight: "bodyweight", "body weight": "bodyweight", calisthenics: "bodyweight",
  kettlebell: "kettlebell", kettlebells: "kettlebell",
  band: "band", bands: "band", resistance_band: "band", resistance_bands: "band",
  other: "other",
};
function canonicalEquipmentLabel(label: string): string | null {
  const normalized = label.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return EQUIPMENT_ALIASES[normalized] ?? null;
}
type DetectedEquipment = { label: string; confidence: number; uncertainty?: string };
function normalizeEquipment(labels: DetectedEquipment[]): DetectedEquipment[] | null {
  const merged = new Map<string, DetectedEquipment>();
  for (const item of labels) {
    const label = canonicalEquipmentLabel(item.label);
    if (!label || item.confidence < 0.5) return null;
    const previous = merged.get(label);
    if (!previous || item.confidence > previous.confidence) {
      merged.set(label, { label, confidence: item.confidence, ...(item.uncertainty || previous?.uncertainty ? { uncertainty: item.uncertainty ?? previous?.uncertainty } : {}) });
    }
  }
  return [...merged.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export type GymWorkoutToolErrorKind = "ownership" | "conflict" | "invalid" | "clarification" | "local_data_unavailable" | "not_found";
export type GymWorkoutToolResult =
  | { ok: true; operation: string; data: Record<string, unknown> }
  | { ok: false; error: { kind: GymWorkoutToolErrorKind; message: string; recoverable: true } };

const failure = (kind: GymWorkoutToolErrorKind, message: string): GymWorkoutToolResult => ({ ok: false, error: { kind, message, recoverable: true } });
function errorResult(error: unknown): GymWorkoutToolResult {
  if (error instanceof CoachWorkoutDraftError) return failure(error.code, error.message);
  if (error && typeof error === "object" && "kind" in error && (error as { kind?: unknown }).kind === "context_unavailable") return failure("local_data_unavailable", "Local workout context is temporarily unavailable; please retry.");
  return failure("local_data_unavailable", "The workout draft could not be read or saved.");
}
function card(draft: WorkoutDraft, revision: number, draftId?: string, detected: DetectedEquipment[] = [], reasonLedger: unknown[] = draft.reasons): Record<string, unknown> {
  // Keep the result deliberately ordered: the card payload precedes its audit ledger.
  const draftWithoutReasons = { ...draft, reasons: undefined } as Omit<WorkoutDraft, "reasons"> & { reasons?: undefined };
  delete draftWithoutReasons.reasons;
  return { draftId, revision, equipment: detected, draft: draftWithoutReasons, reasons: reasonLedger };
}
async function context() {
  const value = await readCoachWorkoutContext();
  if ("kind" in value) throw value;
  return value;
}

export function createGymPhotoWorkoutDraftTools(coachSessionId: string) {
  // This is intentionally ephemeral request state: it is only the structured
  // classification returned by the current image turn, never the image itself.
  // Later text turns use the durable draft/revision tools and do not need this.
  let detectedEquipment: DetectedEquipment[] | null = null;
  const detect = tool({
    description: "Validate visible gym equipment labels from the current image. Classify equipment only; do not invent exercises or a workout.",
    inputSchema: z.object({ equipment: z.array(equipment).min(1).max(20) }),
    execute: async ({ equipment: labels }): Promise<GymWorkoutToolResult> => {
      const normalized = normalizeEquipment(labels);
      if (!normalized?.length) return failure("clarification", "Please clarify which equipment is visible; the image classification was incomplete, uncertain, or outside the supported equipment vocabulary.");
      detectedEquipment = normalized;
      return { ok: true, operation: "detect_equipment", data: { equipment: normalized } };
    },
  });

  const create = tool({
    description: "Create and immediately save a deterministic workout draft from validated equipment labels. The local rules own duration, exercises, sets, reps, rest, loads, and reasons.",
    inputSchema: z.object({ coachSessionId: z.string().optional(), equipment: z.array(equipment).min(1).max(20), limitedMorning: z.boolean().optional(), requestedMinutes: z.number().int().min(20).max(90).optional(), focus: z.array(z.string()).max(8).optional(), readiness: z.enum(["normal", "fatigued", "sore"]).optional(), painReported: z.boolean().optional() }),
    execute: async (input): Promise<GymWorkoutToolResult> => {
      if (!coachSessionId || input.coachSessionId && input.coachSessionId !== coachSessionId) return failure("ownership", "This workout draft belongs to another coach session.");
      try {
        if (!detectedEquipment) return failure("clarification", "Validate the visible equipment first; I will not create a workout from unverified labels.");
        const requested = normalizeEquipment(input.equipment);
        if (!requested?.length) return failure("clarification", "Please clarify the requested equipment using the supported vocabulary.");
        const requestedEquipment = requested.map((item) => item.label);
        const classifiedEquipment = detectedEquipment.map((item) => item.label);
        if (requestedEquipment.join("\u0000") !== classifiedEquipment.join("\u0000")) return failure("clarification", "The requested equipment does not match the current image classification. Please clarify or analyze the image again.");
        const generated = generateWorkoutDraft({ ...input, equipment: classifiedEquipment } as DraftRequest, await context());
        if ("kind" in generated) return failure("clarification", generated.message);
        const saved = await createCoachWorkoutDraft({ coachSessionId, sourceKind: "gym_photo_equipment", sourceMetadata: { equipment: detectedEquipment }, canonicalDraft: generated, reasonLedger: generated.reasons, changeReason: "created" });
        return { ok: true, operation: "create_draft", data: card(generated, saved?.revision?.version ?? 1, saved?.id, detectedEquipment) };
      } catch (error) { return errorResult(error); }
    },
  });

  const modify = tool({
    description: "Apply one bounded conversational change to the saved draft and immediately append a new revision.",
    inputSchema: z.object({ draftId: z.string().min(1), expectedRevision: z.number().int().min(1), change }),
    execute: async (input): Promise<GymWorkoutToolResult> => {
      if (!coachSessionId) return failure("ownership", "A coach session is required to modify a workout draft.");
      try {
        const current = await getCoachWorkoutDraft(input.draftId, coachSessionId);
        if (!current?.revision) return failure("not_found", "Workout draft was not found.");
        const requestedChange = input.change as DraftChange;
        if (requestedChange.kind === "remove_exercise" && !current.revision.canonical_draft.exercises.some((item) => item.exercise_id === requestedChange.exerciseId)) {
          return failure("invalid", "Exercise is not in the draft.");
        }
        const next = applyDraftChange(current.revision.canonical_draft as WorkoutDraft, requestedChange, await context());
        if ("kind" in next) return failure("invalid", next.message);
        const saved = await appendCoachWorkoutDraftRevision(input.draftId, input.expectedRevision, next, coachSessionId, next.reasons, `change:${input.change.kind}`);
        return { ok: true, operation: "modify_draft", data: card(next, saved?.version ?? input.expectedRevision + 1, input.draftId) };
      } catch (error) { return errorResult(error); }
    },
  });

  const revisions = tool({
    description: "List saved revisions of the current coach session's workout draft.",
    inputSchema: z.object({ draftId: z.string().min(1) }),
    execute: async ({ draftId }): Promise<GymWorkoutToolResult> => {
      try { return { ok: true, operation: "list_revisions", data: { revisions: await listCoachWorkoutDraftRevisions(draftId, coachSessionId) } }; } catch (error) { return errorResult(error); }
    },
  });
  const restore = tool({
    description: "Restore a prior draft revision by appending it as the newest revision.",
    inputSchema: z.object({ draftId: z.string().min(1), version: z.number().int().min(1), expectedRevision: z.number().int().min(1) }),
    execute: async ({ draftId, version, expectedRevision }): Promise<GymWorkoutToolResult> => {
      try {
        const saved = await restoreCoachWorkoutDraftRevision(draftId, version, expectedRevision, coachSessionId);
        const restoredDraft = await getCoachWorkoutDraft(draftId, coachSessionId);
        const restoredEquipment = Array.isArray(restoredDraft?.source_metadata?.equipment)
          ? restoredDraft.source_metadata.equipment as DetectedEquipment[]
          : [];
        return { ok: true, operation: "restore_revision", data: card(saved?.canonical_draft as WorkoutDraft, saved?.version ?? expectedRevision + 1, draftId, restoredEquipment, saved?.reason_ledger ?? []) };
      } catch (error) { return errorResult(error); }
    },
  });
  return { detect_gym_equipment: detect, create_gym_workout_draft: create, modify_gym_workout_draft: modify, list_gym_workout_revisions: revisions, restore_gym_workout_revision: restore };
}

export const gymPhotoWorkoutDraftTools = createGymPhotoWorkoutDraftTools("");
