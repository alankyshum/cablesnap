import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  getGoalForExercise,
  getActiveGoals,
  createGoal,
  updateGoal,
  achieveGoal,
  deleteGoal,
  getCurrentBestWeight,
  getCurrentBestReps,
  type StrengthGoalRow,
  type CreateGoalInput,
  type UpdateGoalInput,
} from "@/lib/db";

export type GoalWithProgress = {
  goal: StrengthGoalRow;
  currentBest: number | null;
  progressPct: number;
  isBodyweight: boolean;
};

export function useStrengthGoal(exerciseId: string | undefined, isBodyweight: boolean) {
  const [goal, setGoal] = useState<StrengthGoalRow | null>(null);
  const [currentBest, setCurrentBest] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!exerciseId) {
      setGoal(null);
      setCurrentBest(null);
      setIsLoading(false);
      return;
    }
    try {
      const [g, best] = await Promise.all([
        getGoalForExercise(exerciseId),
        isBodyweight ? getCurrentBestReps(exerciseId) : getCurrentBestWeight(exerciseId),
      ]);
      setGoal(g);
      setCurrentBest(best);
    } catch {
      setGoal(null);
      setCurrentBest(null);
    } finally {
      setIsLoading(false);
    }
  }, [exerciseId, isBodyweight]);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      reload();
    }, [reload]),
  );

  const target = goal
    ? (isBodyweight ? goal.target_reps : goal.target_weight) ?? 0
    : 0;
  const progressPct = target > 0 && currentBest != null
    ? Math.round((currentBest / target) * 100)
    : 0;

  const handleCreate = useCallback(
    async (input: CreateGoalInput) => {
      await createGoal(input);
      await reload();
    },
    [reload],
  );

  const handleUpdate = useCallback(
    async (goalId: string, updates: UpdateGoalInput) => {
      await updateGoal(goalId, updates);
      await reload();
    },
    [reload],
  );

  const handleAchieve = useCallback(
    async (goalId: string) => {
      await achieveGoal(goalId);
      await reload();
    },
    [reload],
  );

  const handleDelete = useCallback(
    async (goalId: string) => {
      await deleteGoal(goalId);
      await reload();
    },
    [reload],
  );

  return {
    goal,
    currentBest,
    progressPct,
    isLoading,
    reload,
    createGoal: handleCreate,
    updateGoal: handleUpdate,
    achieveGoal: handleAchieve,
    deleteGoal: handleDelete,
  };
}

export function useActiveGoals() {
  const [goals, setGoals] = useState<StrengthGoalRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      (async () => {
        try {
          const g = await getActiveGoals();
          setGoals(g);
        } catch {
          setGoals([]);
        } finally {
          setIsLoading(false);
        }
      })();
    }, []),
  );

  return { goals, isLoading };
}
