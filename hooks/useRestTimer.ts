import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { play as playAudio } from "../lib/audio";
import { getRestSecondsForExercise, getAppSetting } from "../lib/db";
import { isAvailable, scheduleRestComplete, cancelRestComplete } from "../lib/notifications";
import { duration as durationTokens } from "../constants/design-tokens";

type UseRestTimerOptions = {
  sessionId: string | undefined;
  colors: { primaryContainer: string; primary: string };
};

export function useRestTimer({ sessionId, colors }: UseRestTimerOptions) {
  const [rest, setRest] = useState(0);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endAtRef = useRef<number | null>(null);
  const notificationIdRef = useRef<string | null>(null);
  const restFlash = useSharedValue(0);
  const restFlashStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      restFlash.value,
      [0, 1],
      [colors.primaryContainer, colors.primary],
    ),
  }));
  const restHapticTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const prevRest = useRef(0);

  const cancelNotification = useCallback(() => {
    if (notificationIdRef.current) {
      cancelRestComplete(notificationIdRef.current);
      notificationIdRef.current = null;
    }
  }, []);

  const scheduleNotification = useCallback(async (seconds: number) => {
    if (!sessionId || seconds <= 0) return;
    try {
      const setting = await getAppSetting("rest_notification_enabled");
      if (setting === "false") return;
      if (!isAvailable()) return;
      const id = await scheduleRestComplete(seconds, sessionId);
      notificationIdRef.current = id;
    } catch {
      // Non-critical — timer still works without notification
    }
  }, [sessionId]);

  const startRest = useCallback(async (exerciseId: string) => {
    if (restRef.current) clearInterval(restRef.current);
    cancelNotification();
    const secs = await getRestSecondsForExercise(sessionId!, exerciseId);
    const endAt = Date.now() + secs * 1000;
    endAtRef.current = endAt;
    setRest(secs);
    scheduleNotification(secs);
    restRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endAtRef.current! - Date.now()) / 1000));
      setRest(remaining);
      if (remaining <= 0) {
        if (restRef.current) clearInterval(restRef.current);
        restRef.current = null;
        endAtRef.current = null;
        cancelNotification();
      }
    }, 1000);
  }, [sessionId, cancelNotification, scheduleNotification]);

  const startRestWithDuration = useCallback((secs: number) => {
    if (restRef.current) clearInterval(restRef.current);
    cancelNotification();
    const endAt = Date.now() + secs * 1000;
    endAtRef.current = endAt;
    setRest(secs);
    scheduleNotification(secs);
    restRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endAtRef.current! - Date.now()) / 1000));
      setRest(remaining);
      if (remaining <= 0) {
        if (restRef.current) clearInterval(restRef.current);
        restRef.current = null;
        endAtRef.current = null;
        cancelNotification();
      }
    }, 1000);
  }, [cancelNotification, scheduleNotification]);

  const dismissRest = useCallback(() => {
    if (restRef.current) clearInterval(restRef.current);
    restRef.current = null;
    endAtRef.current = null;
    cancelNotification();
    setRest(0);
  }, [cancelNotification]);

  // AppState listener: recalculate remaining time on foreground resume
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === "active" && endAtRef.current) {
        const remaining = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
        setRest(remaining);
        if (remaining <= 0) {
          if (restRef.current) clearInterval(restRef.current);
          restRef.current = null;
          endAtRef.current = null;
          cancelNotification();
        }
      }
    };
    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [cancelNotification]);

  // Haptic + audio feedback on rest timer completion and countdown
  useEffect(() => {
    if (prevRest.current > 0 && rest === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      const t1 = setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, 300);
      const t2 = setTimeout(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }, 600);
      restHapticTimers.current = [t1, t2];

      playAudio("complete");

      // eslint-disable-next-line react-hooks/immutability
      restFlash.value = 1;
      // eslint-disable-next-line react-hooks/immutability
      restFlash.value = withTiming(0, { duration: durationTokens.slow });
    }

    if (rest > 0 && rest <= 3) {
      playAudio("tick");
    }

    prevRest.current = rest;
  }, [rest, restFlash]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (restRef.current) clearInterval(restRef.current);
      for (const t of restHapticTimers.current) clearTimeout(t);
      cancelNotification();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    rest,
    restFlashStyle,
    startRest,
    startRestWithDuration,
    dismissRest,
    restRef,
  };
}
