import { useCallback } from "react";
import { useSetTimer } from "./useSetTimer";
import type { ExerciseGroup } from "../components/session/types";

type UseSessionTimerArgs = {
  sessionId: string | undefined;
  groups: ExerciseGroup[];
  dismissRest: () => void;
  handleUpdate: (setId: string, field: "weight" | "reps" | "duration_seconds", val: string) => void;
};

export function useSessionTimer({ sessionId, groups, dismissRest, handleUpdate }: UseSessionTimerArgs) {
  const timer = useSetTimer({ sessionId });

  const handleTimerStart = useCallback((setId: string) => {
    for (const g of groups) {
      const idx = g.sets.findIndex((s) => s.id === setId);
      if (idx >= 0) {
        dismissRest();
        const target = g.sets[idx].duration_seconds;
        timer.start(g.exercise_id, idx, target ?? undefined);
        break;
      }
    }
  }, [groups, timer, dismissRest]);

  const handleTimerStop = useCallback((setId: string) => {
    const elapsed = timer.stop();
    if (elapsed != null && elapsed > 0) {
      handleUpdate(setId, "duration_seconds", String(elapsed));
    }
  }, [timer, handleUpdate]);

  return {
    activeExerciseId: timer.activeExerciseId,
    activeSetIndex: timer.activeSetIndex,
    isRunning: timer.isRunning,
    displaySeconds: timer.displaySeconds,
    handleTimerStart,
    handleTimerStop,
  };
}
