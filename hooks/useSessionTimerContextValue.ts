/**
 * useSessionTimerContextValue — BLD-1235
 *
 * Memoize the SetTimerContext provider value so consumers only see a new
 * identity when the underlying timer fields actually change. Extracted from
 * app/session/[id].tsx to keep that file under the FTA 720-line gate.
 */
import { useMemo } from "react";
import type { SetTimerContextValue } from "../components/session/SetTimerContext";

export function useSessionTimerContextValue(args: SetTimerContextValue): SetTimerContextValue {
  const { isRunning, displaySeconds, activeExerciseId, activeSetIndex, onTimerStart, onTimerStop } = args;
  return useMemo(
    () => ({ isRunning, displaySeconds, activeExerciseId, activeSetIndex, onTimerStart, onTimerStop }),
    [isRunning, displaySeconds, activeExerciseId, activeSetIndex, onTimerStart, onTimerStop],
  );
}
