import type { WorkoutSet, TrainingMode, Equipment } from "../../lib/types";

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
};

export const RPE_CHIPS = [6, 7, 8, 9, 10] as const;

export const RPE_LABELS: Record<number, string> = {
  6: "Easy", 7: "Easy", 8: "Mod", 9: "Hard", 10: "Max",
};
