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
import {
  getRestSecondsForExercise,
  getAppSetting,
  getRestContext,
} from "../lib/db";
import type { SetType } from "../lib/types";
import {
  resolveRestSeconds,
  defaultBreakdown,
  type RestBreakdown,
} from "../lib/rest";
import { isAvailable, scheduleRestComplete, cancelRestComplete } from "../lib/notifications";
import { duration as durationTokens } from "../constants/design-tokens";

export type SetContext = {
  exerciseId: string;
  sessionId: string;
  setType: SetType;
  rpe: number | null;
};

type UseRestTimerOptions = {
  sessionId: string | undefined;
  colors: { primaryContainer: string; primary: string };
};

export function useRestTimer({ sessionId, colors }: UseRestTimerOptions) {
  const [rest, setRest] = useState(0);
  // Breakdown lives in useState (per plan) so the breakdown sheet re-renders when
  // a new timer starts. Ref-based storage caused stale reads (TL blocker #7).
  const [breakdown, setBreakdown] = useState<RestBreakdown>(() => defaultBreakdown(0));
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

  const runTimer = useCallback(
    (secs: number, nextBreakdown: RestBreakdown) => {
      if (restRef.current) clearInterval(restRef.current);
      cancelNotification();
      const endAt = Date.now() + secs * 1000;
      endAtRef.current = endAt;
      setRest(secs);
      setBreakdown(nextBreakdown);
      scheduleNotification(secs);
      restRef.current = setInterval(() => {
        const remaining = Math.max(
          0,
          Math.ceil((endAtRef.current! - Date.now()) / 1000),
        );
        setRest(remaining);
        if (remaining <= 0) {
          if (restRef.current) clearInterval(restRef.current);
          restRef.current = null;
          endAtRef.current = null;
          cancelNotification();
        }
      }, 1000);
    },
    [cancelNotification, scheduleNotification],
  );

  /**
   * Primary entry from useSessionActions.handleCheck.
   *
   * Back-compat: accepts either a bare `exerciseId` string (legacy callers,
   * e.g. useExerciseManagement) OR a full SetContext object. When `ctx` is a
   * string OR adaptive rest is disabled, we fall through to the legacy
   * `getRestSecondsForExercise` path and render a synthetic isDefault breakdown.
   */
  const startRest = useCallback(
    async (ctx: string | SetContext) => {
      const exerciseId = typeof ctx === "string" ? ctx : ctx.exerciseId;
      if (!sessionId) return;
      const adaptiveSetting = await getAppSetting("rest_adaptive_enabled");
      const adaptiveOn = adaptiveSetting !== "false";

      if (typeof ctx === "object" && adaptiveOn) {
        try {
          const inputs = await getRestContext(sessionId, ctx.exerciseId, {
            set_type: ctx.setType,
            rpe: ctx.rpe,
          });
          const br = resolveRestSeconds(inputs);
          runTimer(br.totalSeconds, br);
          return;
        } catch {
          // Fall through to legacy on error.
        }
      }

      const secs = await getRestSecondsForExercise(sessionId, exerciseId);
      runTimer(secs, defaultBreakdown(secs));
    },
    [sessionId, runTimer],
  );

  const startRestWithDuration = useCallback((secs: number) => {
    runTimer(secs, defaultBreakdown(secs));
  }, [runTimer]);

  /**
   * Adaptive variant for callers (e.g. handleLinkedRest) that have already
   * resolved an adaptive breakdown and want to start the timer without
   * re-resolving.
   */
  const startRestWithBreakdown = useCallback(
    (br: RestBreakdown) => {
      runTimer(br.totalSeconds, br);
    },
    [runTimer],
  );

  const dismissRest = useCallback(() => {
    if (restRef.current) clearInterval(restRef.current);
    restRef.current = null;
    endAtRef.current = null;
    cancelNotification();
    setRest(0);
    setBreakdown(defaultBreakdown(0));
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
      // Check user settings before firing haptics/audio
      Promise.all([
        getAppSetting("rest_timer_vibrate"),
        getAppSetting("rest_timer_sound"),
      ]).then(([vibrateSetting, soundSetting]) => {
        const shouldVibrate = vibrateSetting !== "false";
        const shouldSound = soundSetting !== "false";

        if (shouldVibrate) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          const t1 = setTimeout(() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          }, 300);
          const t2 = setTimeout(() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }, 600);
          restHapticTimers.current = [t1, t2];
        }

        if (shouldSound) {
          playAudio("complete");
        }
      });

      // eslint-disable-next-line react-hooks/immutability
      restFlash.value = 1;
      // eslint-disable-next-line react-hooks/immutability
      restFlash.value = withTiming(0, { duration: durationTokens.slow });
    }

    if (rest > 0 && rest <= 3) {
      getAppSetting("rest_timer_sound").then((soundSetting) => {
        if (soundSetting !== "false") {
          playAudio("tick");
        }
      });
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
    breakdown,
    restFlashStyle,
    startRest,
    startRestWithDuration,
    startRestWithBreakdown,
    dismissRest,
    restRef,
  };
}
