import { ExerciseMatch } from "@/lib/import/exercise-matcher";
import type { Exercise } from "@/lib/types";

export type MatchState = ExerciseMatch & {
  userConfirmed: boolean;
  userOverrideExercise: Exercise | null;
};

export type ImportResult = {
  sessionsImported: number;
  exercisesCreated: number;
  setsImported: number;
  skippedTimed: number;
  skippedDistance: number;
};
