import type { WorkoutSet, TrainingMode, Equipment, MountPosition } from "../../lib/types";
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
};

export type ExerciseGroup = {
  exercise_id: string;
  name: string;
  sets: SetWithMeta[];
  link_id: string | null;
  training_modes: TrainingMode[];
  is_voltra: boolean;
  is_bodyweight: boolean;
  trackingMode: "reps" | "duration";
  equipment: Equipment;
  exercise_position: number;
  previousSummary?: string | null;
  previousSummaryA11y?: string | null;
  previousSets?: Array<{ weight: number | null; reps: number | null; duration_seconds: number | null }>;
  progressionSuggested?: boolean;
  exerciseCategory?: string | null;
  /**
   * BLD-596: cable mount position for Voltra exercises (high/mid/low/floor).
   * `undefined` for non-Voltra; `null` for Voltra exercises whose mount is unset
   * (custom user exercises). Consumers MUST treat `null` and `undefined`
   * identically (use truthiness, not `=== undefined`).
   */
  mount_position?: MountPosition | null;
};
