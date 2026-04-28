import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  interpolateColor,
  useReducedMotion,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { play as playAudio } from "../lib/audio";
import {
  getRestSecondsForExercise,
  getAppSetting,
  getRestContext,
  setAppSetting,
  deleteAppSetting,
} from "../lib/db";
import type { SetType } from "../lib/types";
import {
  resolveRestSeconds,
  defaultBreakdown,
  type RestBreakdown,
} from "../lib/rest";
import {
  isAvailable,
  requestPermission,
  scheduleRestComplete,
  cancelRestComplete,
} from "../lib/notifications";
import { sessionBreadcrumb } from "../lib/session-breadcrumbs";

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

type PersistedRestTimerState = {
  sessionId: string;
  endTimestamp: number;
  durationSeconds: number;
  breakdown: RestBreakdown;
  notificationId: string | null;
};

const DEFAULT_REST_SECONDS = 30;
const REST_DEFAULT_SECONDS_KEY = "rest_timer_default_seconds";
const ACTIVE_REST_TIMER_KEY = "rest_timer_active_state";

function sanitizeRestSeconds(value: string | null): number {
  const parsed = value == null ? Number.NaN : parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REST_SECONDS;
}

function parsePersistedRestTimerState(value: string | null): PersistedRestTimerState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PersistedRestTimerState>;
    if (
      typeof parsed.sessionId !== "string"
      || typeof parsed.endTimestamp !== "number"
      || typeof parsed.durationSeconds !== "number"
    ) {
      return null;
    }
    return {
      sessionId: parsed.sessionId,
      endTimestamp: parsed.endTimestamp,
      durationSeconds: parsed.durationSeconds,
      breakdown: parsed.breakdown ?? defaultBreakdown(parsed.durationSeconds),
      notificationId: typeof parsed.notificationId === "string" ? parsed.notificationId : null,
    };
  } catch {
    return null;
  }
}

export function useRestTimer({ sessionId, colors }: UseRestTimerOptions) {
  const [rest, setRest] = useState(0);
  // Breakdown lives in useState (per plan) so the breakdown sheet re-renders when
  // a new timer starts. Ref-based storage caused stale reads (TL blocker #7).
  const [breakdown, setBreakdown] = useState<RestBreakdown>(() => defaultBreakdown(0));
  const [persistedDurationSeconds, setPersistedDurationSeconds] = useState(DEFAULT_REST_SECONDS);
  const [selectedDurationSeconds, setSelectedDurationSeconds] = useState(DEFAULT_REST_SECONDS);
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
  const reduceMotion = useReducedMotion();
  const restHapticTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const prevRest = useRef(0);

  const persistLastUsedDuration = useCallback((seconds: number) => {
    setPersistedDurationSeconds(seconds);
    void setAppSetting(REST_DEFAULT_SECONDS_KEY, String(seconds)).catch(() => {});
  }, []);

  const persistActiveTimerState = useCallback((state: PersistedRestTimerState | null) => {
    if (!state) {
      void deleteAppSetting(ACTIVE_REST_TIMER_KEY).catch(() => {});
      return;
    }
    void setAppSetting(ACTIVE_REST_TIMER_KEY, JSON.stringify(state)).catch(() => {});
  }, []);

  const cancelNotification = useCallback(() => {
    if (notificationIdRef.current) {
      void cancelRestComplete(notificationIdRef.current);
      notificationIdRef.current = null;
    }
  }, []);

  const clearPersistedActiveTimer = useCallback(() => {
    endAtRef.current = null;
    notificationIdRef.current = null;
    persistActiveTimerState(null);
  }, [persistActiveTimerState]);

  const scheduleNotification = useCallback(async (
    seconds: number,
    endTimestamp: number,
    nextBreakdown: RestBreakdown,
  ) => {
    if (!sessionId || seconds <= 0) return;
    try {
      const setting = await getAppSetting("rest_notification_enabled");
      if (setting === "false") return;
      if (!isAvailable()) return;
      const granted = await requestPermission();
      if (!granted) return;
      const id = await scheduleRestComplete(seconds, sessionId);
      notificationIdRef.current = id;
      persistActiveTimerState({
        sessionId,
        endTimestamp,
        durationSeconds: seconds,
        breakdown: nextBreakdown,
        notificationId: id,
      });
    } catch {
      // Non-critical — timer still works without notification
    }
  }, [persistActiveTimerState, sessionId]);

  // BLD-553: extracted tick so we can pause/restart the 1Hz interval on
  // AppState background/foreground transitions (battery drain mitigation).
  const startRestInterval = useCallback(() => {
    if (restRef.current) return;
    restRef.current = setInterval(() => {
      if (endAtRef.current == null) {
        if (restRef.current) clearInterval(restRef.current);
        restRef.current = null;
        return;
      }
      const remaining = Math.max(
        0,
        Math.ceil((endAtRef.current - Date.now()) / 1000),
      );
      setRest(remaining);
      if (remaining <= 0) {
        if (restRef.current) clearInterval(restRef.current);
        restRef.current = null;
        cancelNotification();
        clearPersistedActiveTimer();
        setBreakdown(defaultBreakdown(0));
      }
    }, 1000);
  }, [cancelNotification, clearPersistedActiveTimer]);

  const stopRestInterval = useCallback(() => {
    if (restRef.current) {
      clearInterval(restRef.current);
      restRef.current = null;
    }
  }, []);

  const runTimer = useCallback(
    (secs: number, nextBreakdown: RestBreakdown) => {
      stopRestInterval();
      cancelNotification();
      const endTimestamp = Date.now() + secs * 1000;
      endAtRef.current = endTimestamp;
      setRest(secs);
      setBreakdown(nextBreakdown);
      setSelectedDurationSeconds(secs);
      persistLastUsedDuration(secs);
      if (sessionId) {
        persistActiveTimerState({
          sessionId,
          endTimestamp,
          durationSeconds: secs,
          breakdown: nextBreakdown,
          notificationId: null,
        });
      }
      void scheduleNotification(secs, endTimestamp, nextBreakdown);
      sessionBreadcrumb("timer.rest.start", { secs });
      // Start unconditionally; AppState change listener will stop the interval
      // immediately if the app is actually backgrounded.
      startRestInterval();
    },
    [
      cancelNotification,
      persistActiveTimerState,
      persistLastUsedDuration,
      scheduleNotification,
      sessionId,
      startRestInterval,
      stopRestInterval,
    ],
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
    stopRestInterval();
    cancelNotification();
    clearPersistedActiveTimer();
    setRest(0);
    setBreakdown(defaultBreakdown(0));
    sessionBreadcrumb("timer.rest.dismiss");
  }, [cancelNotification, clearPersistedActiveTimer, stopRestInterval]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [savedDefault, savedActiveTimer] = await Promise.all([
          getAppSetting(REST_DEFAULT_SECONDS_KEY),
          getAppSetting(ACTIVE_REST_TIMER_KEY),
        ]);
        if (cancelled) return;

        const nextPersistedDuration = sanitizeRestSeconds(savedDefault);
        setPersistedDurationSeconds(nextPersistedDuration);
        setSelectedDurationSeconds(nextPersistedDuration);

        const restoredState = parsePersistedRestTimerState(savedActiveTimer);
        if (!restoredState || !sessionId || restoredState.sessionId !== sessionId) {
          return;
        }

        notificationIdRef.current = restoredState.notificationId;
        setBreakdown(restoredState.breakdown);
        setSelectedDurationSeconds(restoredState.durationSeconds);

        const remaining = Math.max(0, Math.ceil((restoredState.endTimestamp - Date.now()) / 1000));
        if (remaining <= 0) {
          clearPersistedActiveTimer();
          setRest(0);
          setBreakdown(defaultBreakdown(0));
          setSelectedDurationSeconds(nextPersistedDuration);
          return;
        }

        endAtRef.current = restoredState.endTimestamp;
        setRest(remaining);
        if (AppState.currentState === "active") {
          startRestInterval();
        }
      } catch {
        if (!cancelled) {
          setPersistedDurationSeconds(DEFAULT_REST_SECONDS);
          setSelectedDurationSeconds(DEFAULT_REST_SECONDS);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearPersistedActiveTimer, sessionId, startRestInterval]);

  // BLD-553 battery fix: AppState listener pauses the 1Hz interval when
  // backgrounded (native notification still fires) and restarts it on
  // foreground with a recomputed remaining from absolute endAt.
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        if (endAtRef.current) {
          const remaining = Math.max(
            0,
            Math.ceil((endAtRef.current - Date.now()) / 1000),
          );
          setRest(remaining);
          if (remaining <= 0) {
            stopRestInterval();
            cancelNotification();
            clearPersistedActiveTimer();
            setBreakdown(defaultBreakdown(0));
          } else {
            startRestInterval();
          }
        }
      } else {
        // Pause ticking while backgrounded to save battery/CPU.
        stopRestInterval();
      }
    };
    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [cancelNotification, clearPersistedActiveTimer, startRestInterval, stopRestInterval]);

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
    }

    // BLD-611: one-shot start-flash on rest start (0 → positive). Single
    // attention pulse on the timer chip in the session header. Honors OS
    // Reduce Motion via a static tint hold (no opacity flicker, no cycles).
    // Constraints: total ≤ 700 ms, single cycle ≥ 300 ms, accent palette only
    // (interpolates primaryContainer ↔ primary). WCAG 2.3.1 (no strobe).
    if (prevRest.current === 0 && rest > 0) {
      if (reduceMotion) {
        // Static tint hold: brief fade-in to peak, hold ~200 ms, fade back.
        // No flicker — symmetric ease via withTiming endpoints.
        // eslint-disable-next-line react-hooks/immutability
        restFlash.value = withSequence(
          withTiming(1, { duration: 100 }),
          withDelay(200, withTiming(0, { duration: 100 })),
        );
      } else {
        // Single pulse: rise to peak, return to baseline. ~650 ms total,
        // one cycle, ≥300 ms total — within WCAG flash budget.
        // eslint-disable-next-line react-hooks/immutability
        restFlash.value = withSequence(
          withTiming(1, { duration: 300 }),
          withTiming(0, { duration: 350 }),
        );
      }
    }

    if (rest > 0 && rest <= 3) {
      getAppSetting("rest_timer_sound").then((soundSetting) => {
        if (soundSetting !== "false") {
          playAudio("tick");
        }
      });
    }

    prevRest.current = rest;
  }, [rest, restFlash, reduceMotion]);

  useEffect(() => {
    return () => {
      restHapticTimers.current.forEach((t) => clearTimeout(t));
      restHapticTimers.current = [];
      stopRestInterval();
    };
  }, [stopRestInterval]);

  return {
    rest,
    breakdown,
    persistedDurationSeconds,
    selectedDurationSeconds,
    restFlashStyle,
    startRest,
    startRestWithDuration,
    startRestWithBreakdown,
    dismissRest,
    restRef,
  };
}
