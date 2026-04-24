import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { play as playAudio } from "../lib/audio";

export type UseSetTimerOptions = {
  sessionId?: string;
};

type PersistedTimerState = {
  startedAt: number;
  exerciseId: string;
  setIndex: number;
  targetDuration?: number;
};

function storageKey(sessionId: string, exerciseId: string, setIndex: number): string {
  return `set-timer-${sessionId}-${exerciseId}-${setIndex}`;
}

// Persist timer start to survive process kill
function persistTimerState(sessionId: string | undefined, state: PersistedTimerState): void {
  if (!sessionId) return;
  const key = storageKey(sessionId, state.exerciseId, state.setIndex);
  SecureStore.setItemAsync(key, JSON.stringify(state)).catch(() => {});
}

function clearPersistedTimerState(sessionId: string | undefined, exerciseId: string, setIndex: number): void {
  if (!sessionId) return;
  SecureStore.deleteItemAsync(storageKey(sessionId, exerciseId, setIndex)).catch(() => {});
}

export function useSetTimer(options: UseSetTimerOptions = {}) {
  const sessionId = options.sessionId;
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

  // BLD-577 battery fix: explicit "is the stopwatch conceptually running"
  // flag (separate from `isRunning` state) so the AppState listener can
  // decide whether to RESTART the 1Hz interval on foreground. We can't use
  // the React `isRunning` state directly because the listener reads via a
  // stale closure; a ref survives closure boundaries and updates atomically.
  const isTickingRef = useRef(false);

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
    isTickingRef.current = true;

    setIsRunning(true);
    setElapsed(0);
    setTargetDuration(target);
    setActiveExerciseId(exerciseId);
    setActiveSetIndex(setIndex);

    persistTimerState(sessionId, { startedAt: now, exerciseId, setIndex, targetDuration: target });

    // BLD-577: only spin up the 1Hz interval if the app is actually
    // foregrounded. If the hook starts while backgrounded (rare but
    // possible, e.g. haptic-triggered autostart), the AppState listener
    // will start ticking on the next "active" transition.
    if (AppState.currentState === "active") {
      intervalRef.current = setInterval(updateDisplay, 1000);
    }
  }, [clearTimer, updateDisplay, sessionId]);

  const stop = useCallback((): number => {
    clearTimer();
    isTickingRef.current = false;
    const duration = startedAtRef.current
      ? Math.round((Date.now() - startedAtRef.current) / 1000)
      : 0;

    if (activeExerciseId != null && activeSetIndex != null) {
      clearPersistedTimerState(sessionId, activeExerciseId, activeSetIndex);
    }

    startedAtRef.current = null;
    targetRef.current = undefined;
    completedRef.current = false;

    setIsRunning(false);
    setElapsed(0);
    setTargetDuration(undefined);
    setActiveExerciseId(null);
    setActiveSetIndex(null);

    return duration;
  }, [clearTimer, sessionId, activeExerciseId, activeSetIndex]);

  const dismiss = useCallback(() => {
    clearTimer();
    isTickingRef.current = false;

    if (activeExerciseId != null && activeSetIndex != null) {
      clearPersistedTimerState(sessionId, activeExerciseId, activeSetIndex);
    }

    startedAtRef.current = null;
    targetRef.current = undefined;
    completedRef.current = false;
    setIsRunning(false);
    setElapsed(0);
    setTargetDuration(undefined);
    setActiveExerciseId(null);
    setActiveSetIndex(null);
  }, [clearTimer, sessionId, activeExerciseId, activeSetIndex]);

  // BLD-577 battery fix: pause the 1Hz interval while backgrounded and
  // restart it on foreground. Elapsed is recomputed from the absolute
  // startedAtRef so no drift accumulates. Mirrors the BLD-553 pattern
  // already in useSessionActions / useRestTimer.
  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === "active") {
        if (!isTickingRef.current) return;
        // Recompute immediately and re-arm the interval.
        updateDisplay();
        if (!intervalRef.current) {
          intervalRef.current = setInterval(updateDisplay, 1000);
        }
      } else {
        // background / inactive — stop ticking until we come back.
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
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
