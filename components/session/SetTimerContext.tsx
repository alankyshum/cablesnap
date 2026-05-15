/**
 * SetTimerContext — BLD-1235
 *
 * Provides timer state to the set-row tree via React context so that only
 * the SetTimerCell component re-renders each second, keeping SetRow and all
 * ancestor memo boundaries stable during active timing.
 */
import { createContext, useContext } from "react";

export type SetTimerContextValue = {
  isRunning: boolean;
  displaySeconds: number;
  activeExerciseId: string | null | undefined;
  activeSetIndex: number | null | undefined;
  onTimerStart: (setId: string) => void;
  onTimerStop: (setId: string) => void;
};

const defaultValue: SetTimerContextValue = {
  isRunning: false,
  displaySeconds: 0,
  activeExerciseId: null,
  activeSetIndex: null,
  onTimerStart: () => {},
  onTimerStop: () => {},
};

export const SetTimerContext = createContext<SetTimerContextValue>(defaultValue);

export function useSetTimerContext(): SetTimerContextValue {
  return useContext(SetTimerContext);
}
