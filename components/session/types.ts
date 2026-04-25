import type { WorkoutSet, TrainingMode, Equipment, MountPosition } from "../../lib/types";

export type SetWithMeta = WorkoutSet & {
  exercise_name?: string;
  exercise_deleted?: boolean;
  previous?: string;
  is_pr?: boolean;
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

export const RPE_CHIPS = [6, 7, 8, 9, 10] as const;

export const RPE_LABELS: Record<number, string> = {
  6: "Easy", 7: "Easy", 8: "Mod", 9: "Hard", 10: "Max",
};
