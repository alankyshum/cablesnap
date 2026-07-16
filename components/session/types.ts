import type { WorkoutSet, Equipment } from "../../lib/types";
import type { PrefillCandidate } from "../../hooks/resolvePrefillCandidate";

export type SetWithMeta = WorkoutSet & {
  exercise_name?: string;
  exercise_deleted?: boolean;
  previous?: string;
  is_pr?: boolean;
  /**
   * BLD-682 — display-only hydrated value from the previous workout's
   * matching set. Surfaced by useSessionData when the row is pristine
   * (weight/reps/duration_seconds/notes/bodyweight_modifier_kg all
   * null AND completed=false). The picker reads this through the
   * displayed-value derivation in SetRow; nothing here is persisted
   * until the user expresses intent (touch picker / mark complete).
   */
  prefillCandidate?: PrefillCandidate | null;
  left?: SetWithMeta;
  right?: SetWithMeta;
};

export type ExerciseGroup = {
  exercise_id: string;
  name: string;
  sets: SetWithMeta[];
  link_id: string | null;
  is_voltra: boolean;
  is_bodyweight: boolean;
  trackingMode: "reps" | "duration";
  equipment: Equipment;
  exercise_position: number;
  previousSummary?: string | null;
  previousSummaryA11y?: string | null;
  previousSets?: Array<{ weight: number | null; reps: number | null; duration_seconds: number | null; pulley_pin: number | null }>;
  previousSetupPhotoUri?: string | null;
  progressionSuggested?: boolean;
  exerciseCategory?: string | null;
  // BLD-1028: pinned per-exercise note loaded at session start.
  pinnedNote?: string | null;
  /** Backfill candidate from workout_sets.notes; null when dismissed or absent. */
  pinnedNoteBackfill?: { text: string; date: number } | null;
  // BLD-1158: exercise-level default tempo (E-B-C-T canonical). Used by
  // addSet/addSetsBatch to inherit tempo on new sets (AC1.1).
  defaultTempo?: string | null;
  // BLD-2561: preferred substitute exercise id (resolved to name at load time).
  // NULL = no preference set. Used to show/hide the fast-path swap chip.
  preferredSubstituteId?: string | null;
  /** Resolved name of the preferred substitute; null when id is null or deleted. */
  preferredSubstituteName?: string | null;
  // BLD-3344: unilateral exercise setting
  track_unilateral?: boolean;
};
