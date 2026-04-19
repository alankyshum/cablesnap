import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Haptics from "expo-haptics";
import { play as playAudio } from "../lib/audio";

// sessionId reserved for future persistence (e.g. crash recovery via AsyncStorage)
export type UseSetTimerOptions = {
  sessionId?: string;
};

export function useSetTimer(options: UseSetTimerOptions = {}) {
  void options;
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [targetDuration, setTargetDuration] = useState<number | undefined>();
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [activeSetIndex, setActiveSetIndex] = useState<number | null>(null);

  const startedAtRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetRef = useRef<number | undefined>(undefined);
  const completedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const updateDisplay = useCallback(() => {
    if (startedAtRef.current === null) return;
    const now = Date.now();
    const secs = Math.round((now - startedAtRef.current) / 1000);
    setElapsed(secs);

    // Countdown completion
    if (targetRef.current && secs >= targetRef.current && !completedRef.current) {
      completedRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      }, 300);
      playAudio("complete");
    }

    // Countdown tick in final 3 seconds
    if (targetRef.current) {
      const remaining = targetRef.current - secs;
      if (remaining > 0 && remaining <= 3) {
        playAudio("tick");
      }
    }
  }, []);

  const start = useCallback((exerciseId: string, setIndex: number, target?: number) => {
    clearTimer();
    const now = Date.now();
    startedAtRef.current = now;
    targetRef.current = target;
    completedRef.current = false;

    setIsRunning(true);
    setElapsed(0);
    setTargetDuration(target);
    setActiveExerciseId(exerciseId);
    setActiveSetIndex(setIndex);

    intervalRef.current = setInterval(updateDisplay, 1000);
  }, [clearTimer, updateDisplay]);

  const stop = useCallback((): number => {
    clearTimer();
    const duration = startedAtRef.current
      ? Math.round((Date.now() - startedAtRef.current) / 1000)
      : 0;

    startedAtRef.current = null;
    targetRef.current = undefined;
    completedRef.current = false;

    setIsRunning(false);
    setElapsed(0);
    setTargetDuration(undefined);
    setActiveExerciseId(null);
    setActiveSetIndex(null);

    return duration;
  }, [clearTimer]);

  const dismiss = useCallback(() => {
    clearTimer();
    startedAtRef.current = null;
    targetRef.current = undefined;
    completedRef.current = false;
    setIsRunning(false);
    setElapsed(0);
    setTargetDuration(undefined);
    setActiveExerciseId(null);
    setActiveSetIndex(null);
  }, [clearTimer]);

  // AppState listener — recalculate elapsed on foreground resume (absolute timestamp)
  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === "active" && startedAtRef.current) {
        updateDisplay();
      }
    };
    const sub = AppState.addEventListener("change", handler);
    return () => sub.remove();
  }, [updateDisplay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const isCountdownComplete = targetDuration != null && elapsed >= targetDuration;
  const remaining = targetDuration != null ? Math.max(0, targetDuration - elapsed) : null;
  const displaySeconds = targetDuration != null ? remaining! : elapsed;

  return {
    elapsed,
    isRunning,
    targetDuration,
    activeExerciseId,
    activeSetIndex,
    isCountdownComplete,
    remaining,
    displaySeconds,
    start,
    stop,
    dismiss,
  };
}
