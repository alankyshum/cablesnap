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
import type { RestSource } from "../lib/rest-resolver";
import { setUserRestSeconds, restResolverBreadcrumb } from "../lib/rest-resolver";
import * as Sentry from "@sentry/react-native";
import {
  isAvailable,
  requestPermission,
  scheduleRestComplete,
  cancelRestComplete,
  schedulePreEndCue,
  presentLiveRestCountdown,
  cancelAllRestNotifications,
  type NextSetPreview,
} from "../lib/notifications";
import { sessionBreadcrumb } from "../lib/session-breadcrumbs";

export type SetContext = {
  exerciseId: string;
  sessionId: string;
  setType: SetType;
  rpe: number | null;
  /** BLD-1110: set ID used to gate recomputeActiveRest to the most-recent-completed set. */
  setId?: string;
  /** BLD-1137: next-set preview to show on lock screen. */
  preview?: NextSetPreview;
  /** BLD-1137: whether this is the last set of the session. */
  isLastSet?: boolean;
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
  /** BLD-1137: replaces legacy notificationId. Migration: if notificationIds missing, read notificationId as complete. */
  notificationIds: { preEnd?: string | null; complete?: string | null; liveOngoing?: string | null };
  previewSnapshot: NextSetPreview;
  isLastSet: boolean;
  cueSeconds: number;
  liveEnabled: boolean;
  /** @deprecated Legacy field — migrated to notificationIds.complete on read */
  notificationId?: string | null;
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
    // BLD-1137: Migration — if notificationIds missing, read legacy notificationId as complete.
    let notificationIds: PersistedRestTimerState["notificationIds"] = {};
    if (parsed.notificationIds && typeof parsed.notificationIds === "object") {
      notificationIds = parsed.notificationIds;
    } else if (typeof parsed.notificationId === "string" || parsed.notificationId === null) {
      notificationIds = { complete: parsed.notificationId };
    }
    return {
      sessionId: parsed.sessionId,
      endTimestamp: parsed.endTimestamp,
      durationSeconds: parsed.durationSeconds,
      breakdown: parsed.breakdown ?? defaultBreakdown(parsed.durationSeconds),
      notificationIds,
      previewSnapshot: parsed.previewSnapshot ?? null,
      isLastSet: typeof parsed.isLastSet === "boolean" ? parsed.isLastSet : false,
      cueSeconds: typeof parsed.cueSeconds === "number" ? parsed.cueSeconds : 10,
      liveEnabled: typeof parsed.liveEnabled === "boolean" ? parsed.liveEnabled : false,
    };
  } catch {
    return null;
  }
}

// eslint-disable-next-line max-lines-per-function -- BLD-1137: Smart Rest Coach adds cold-start resume + 3-id scheduling, pushing past 400 lines. Extracting sub-hooks would fragment tightly-coupled timer state.
export function useRestTimer({ sessionId, colors }: UseRestTimerOptions) {
  const [rest, setRest] = useState(0);
  // Breakdown lives in useState (per plan) so the breakdown sheet re-renders when
  // a new timer starts. Ref-based storage caused stale reads (TL blocker #7).
  const [breakdown, setBreakdown] = useState<RestBreakdown>(() => defaultBreakdown(0));
  // BLD-1100: current resolver source + active exercise ID for attribution + Pin toggle.
  const [restSource, setRestSource] = useState<RestSource | null>(null);
  const [restExerciseId, setRestExerciseId] = useState<string | null>(null);
  // BLD-1110: set ID that triggered the active rest timer (Tech S4 advisory).
  // Used by recomputeActiveRest to gate: only the most-recent-completed set
  // can trigger a recompute, avoiding a DB roundtrip on every chip tap.
  const restSetIdRef = useRef<string | null>(null);
  // BLD-1110: set type of the triggering set (needed for recomputeActiveRest resolver call).
  const restSetTypeRef = useRef<SetType>("normal");
  const [persistedDurationSeconds, setPersistedDurationSeconds] = useState(DEFAULT_REST_SECONDS);
  const [selectedDurationSeconds, setSelectedDurationSeconds] = useState(DEFAULT_REST_SECONDS);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endAtRef = useRef<number | null>(null);
  /** BLD-1137: replaces legacy notificationIdRef with three-id object. */
  const notificationIdsRef = useRef<{ preEnd?: string | null; complete?: string | null; liveOngoing?: string | null }>({});
  /** BLD-1137: setInterval handle for the 5s live countdown re-present. */
  const liveCountdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** BLD-1137: preview snapshot ref so recomputeActiveRest can re-use without refetching. */
  const previewRef = useRef<NextSetPreview>(null);
  /** BLD-1137: isLastSet ref mirroring previewRef. */
  const isLastSetRef = useRef<boolean>(false);
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

  /** BLD-1137: Clear the live countdown JS interval. */
  const stopLiveCountdownInterval = useCallback(() => {
    if (liveCountdownIntervalRef.current) {
      clearInterval(liveCountdownIntervalRef.current);
      liveCountdownIntervalRef.current = null;
    }
  }, []);

  /**
   * Cancel all scheduled rest notifications via cancelAllRestNotifications.
   * Also stops the live countdown interval.
   * BLD-1137: replaces the old cancelNotification (single-id).
   */
  const cancelNotification = useCallback(() => {
    stopLiveCountdownInterval();
    if (sessionId) {
      void cancelAllRestNotifications(sessionId).catch(() => {});
    } else {
      // Fallback: cancel by stored IDs (no sessionId available)
      const ids = notificationIdsRef.current;
      if (ids.complete) { void cancelRestComplete(ids.complete).catch(() => {}); }
    }
    notificationIdsRef.current = {};
  }, [sessionId, stopLiveCountdownInterval]);

  const clearPersistedActiveTimer = useCallback(() => {
    endAtRef.current = null;
    notificationIdsRef.current = {};
    persistActiveTimerState(null);
  }, [persistActiveTimerState]);

  /**
   * BLD-1137: Schedule pre-end cue, rest-complete, and optionally live countdown.
   * All notification IDs stored in notificationIdsRef and persisted.
   */
  const scheduleNotification = useCallback(async (
    seconds: number,
    endTimestamp: number,
    nextBreakdown: RestBreakdown,
    preview: NextSetPreview = null,
    isLastSet: boolean = false,
  ) => {
    if (!sessionId || seconds <= 0) return;
    try {
      const masterEnabled = await getAppSetting("rest_notification_enabled");
      if (masterEnabled === "false") return;
      if (!isAvailable()) return;
      const granted = await requestPermission();
      if (!granted) return;

      // Read BLD-1137 settings
      const [cueSecondsRaw, liveRaw] = await Promise.all([
        getAppSetting("rest_timer_pre_end_cue_seconds"),
        getAppSetting("rest_timer_live_countdown"),
      ]);
      const cueSeconds = cueSecondsRaw != null ? parseInt(cueSecondsRaw, 10) : 10;
      const liveEnabled = liveRaw !== "false"; // default true on Android, ignored on iOS
      const showPreview = (await getAppSetting("rest_timer_show_next_set_preview")) === "true";
      const effectivePreview: NextSetPreview = showPreview ? preview : null;

      const ids: PersistedRestTimerState["notificationIds"] = {};

      // Schedule pre-end cue (if cueSeconds > 0 AND rest is long enough)
      if (Number.isFinite(cueSeconds) && cueSeconds > 0 && seconds > cueSeconds + 2) {
        const preEndId = await schedulePreEndCue(
          seconds - cueSeconds,
          effectivePreview,
          isLastSet,
          cueSeconds,
          sessionId,
        );
        ids.preEnd = preEndId;
      }

      // Schedule rest-complete
      const completeId = await scheduleRestComplete(seconds, sessionId, effectivePreview, isLastSet);
      ids.complete = completeId;

      // Start live countdown on Android (no-op on iOS)
      if (liveEnabled) {
        const liveId = await presentLiveRestCountdown(seconds, effectivePreview, sessionId);
        ids.liveOngoing = liveId;
        if (liveId) {
          stopLiveCountdownInterval();
          // Self-correcting setTimeout chain to avoid setInterval drift (AC4 ±500ms)
          const scheduleNext = () => {
            if (endAtRef.current == null) return;
            const remaining = Math.max(0, Math.floor((endAtRef.current - Date.now()) / 1000));
            if (remaining <= 0) {
              stopLiveCountdownInterval();
              return;
            }
            void presentLiveRestCountdown(remaining, effectivePreview, sessionId).catch(() => {});
            liveCountdownIntervalRef.current = setTimeout(scheduleNext, 5000) as unknown as ReturnType<typeof setInterval>;
          };
          liveCountdownIntervalRef.current = setTimeout(scheduleNext, 5000) as unknown as ReturnType<typeof setInterval>;
        }
      }

      notificationIdsRef.current = ids;
      persistActiveTimerState({
        sessionId,
        endTimestamp,
        durationSeconds: seconds,
        breakdown: nextBreakdown,
        notificationIds: ids,
        previewSnapshot: effectivePreview,
        isLastSet,
        cueSeconds: Number.isFinite(cueSeconds) ? cueSeconds : 10,
        liveEnabled,
      });
    } catch {
      // Non-critical — timer still works without notification
    }
  }, [persistActiveTimerState, sessionId, stopLiveCountdownInterval]);

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
    (secs: number, nextBreakdown: RestBreakdown, preview: NextSetPreview = null, isLastSet = false) => {
      stopRestInterval();
      cancelNotification();
      const endTimestamp = Date.now() + secs * 1000;
      endAtRef.current = endTimestamp;
      previewRef.current = preview;
      isLastSetRef.current = isLastSet;
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
          notificationIds: {},
          previewSnapshot: null,
          isLastSet: false,
          cueSeconds: 10,
          liveEnabled: false,
        });
      }
      void scheduleNotification(secs, endTimestamp, nextBreakdown, preview, isLastSet);
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
   *
   * BLD-1137: SetContext may carry optional `preview` and `isLastSet` for
   * Smart Rest Coach lock-screen body. These are forwarded to scheduleNotification.
   */
  const startRest = useCallback(
    async (ctx: string | SetContext) => {
      const exerciseId = typeof ctx === "string" ? ctx : ctx.exerciseId;
      const preview: NextSetPreview = typeof ctx === "object" ? (ctx.preview ?? null) : null;
      const isLastSet: boolean = typeof ctx === "object" ? (ctx.isLastSet ?? false) : false;
      if (!sessionId) return;
      const adaptiveSetting = await getAppSetting("rest_adaptive_enabled");
      const adaptiveOn = adaptiveSetting !== "false";

      // BLD-1110: capture the triggering setId for recomputeActiveRest gating.
      restSetIdRef.current = typeof ctx === "object" && ctx.setId ? ctx.setId : null;
      restSetTypeRef.current = typeof ctx === "object" ? ctx.setType : "normal";

      if (typeof ctx === "object" && adaptiveOn) {
        try {
          const inputs = await getRestContext(sessionId, ctx.exerciseId, {
            set_type: ctx.setType,
            rpe: ctx.rpe,
          });
          setRestSource(inputs.source);
          setRestExerciseId(ctx.exerciseId);
          // AC2b: bypass resolveRestSeconds for history/pinned — their seconds are
          // already the user's actual rest value; re-multiplying is double-counting.
          // Clamp to [15, 600] (resolver-side bounds), NOT legacy [10, 360].
          if (inputs.source.kind === "history" || inputs.source.kind === "pinned") {
            const secs = Math.min(600, Math.max(15, inputs.source.seconds));
            runTimer(secs, defaultBreakdown(secs), preview, isLastSet);
            return;
          }
          const br = resolveRestSeconds(inputs);
          runTimer(br.totalSeconds, br, preview, isLastSet);
          return;
        } catch (e) {
          // Resolver error — log to Sentry for observability, then fall through to legacy path.
          Sentry.captureException(e, { tags: { feature: "rest-resolver" } });
          restResolverBreadcrumb({ source: "default", seconds: 0, exerciseId: ctx.exerciseId, level: "error" });
        }
      }

      setRestSource(null);
      setRestExerciseId(exerciseId);
      const secs = await getRestSecondsForExercise(sessionId, exerciseId);
      runTimer(secs, defaultBreakdown(secs), preview, isLastSet);
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

  /**
   * BLD-1110: Recompute the running rest timer when the user updates RPE on
   * the most-recent-completed set during an active rest.
   *
   * No-op guards (all four required per Tech B1):
   * 1. No active timer (endAtRef.current == null)
   * 2. Wrong exercise (restExerciseId !== exerciseId param)
   * 3. Not the most-recent-completed set (setId !== restSetIdRef.current)
   * 4. Source is history or pinned (would double-count the multiplier)
   *
   * When computing: remaining = max(0, prev_remaining + (newTotal − oldTotal)).
   * Elapsed is preserved (no reset). If remaining ≤ 0, fires the existing
   * natural-expiry path. Debounced: 250 ms window, only the final tap fires.
   */
  const recomputeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recomputeActiveRest = useCallback(
    (setId: string, exerciseId: string, newRpe: number | null) => {
      // Guard 1: no active timer
      if (endAtRef.current == null) return;
      // Guard 2: wrong exercise
      if (restExerciseId !== exerciseId) return;
      // Guard 3: not the triggering set
      if (restSetIdRef.current !== setId) return;
      // Guard 4: history/pinned sources must not be re-multiplied
      if (restSource?.kind === "history" || restSource?.kind === "pinned") return;

      // Debounce — only the final tap within 250 ms drives the recompute.
      if (recomputeDebounceRef.current) clearTimeout(recomputeDebounceRef.current);
      recomputeDebounceRef.current = setTimeout(() => {
        recomputeDebounceRef.current = null;
        if (!sessionId || endAtRef.current == null) return;

        // Re-resolve with new RPE
        getRestContext(sessionId, exerciseId, {
          set_type: restSetTypeRef.current,
          rpe: newRpe,
        }).then((inputs) => {
          // In-callback guard: timer may have expired or been dismissed while
          // the async resolver was pending.
          if (endAtRef.current == null) return;

          // Double-check source hasn't changed to history/pinned between the
          // debounce delay and now.
          if (inputs.source.kind === "history" || inputs.source.kind === "pinned") return;

          const newBreakdown = resolveRestSeconds(inputs);
          const newTotal = newBreakdown.totalSeconds;
          const oldTotal = breakdown.totalSeconds;
          const delta = newTotal - oldTotal;

          const prevRemaining = Math.max(
            0,
            Math.ceil((endAtRef.current! - Date.now()) / 1000),
          );
          const newRemaining = Math.max(0, prevRemaining + delta);

          // Emit breadcrumb only on real recomputes (not no-ops).
          restResolverBreadcrumb({
            source: inputs.source.kind,
            seconds: newTotal,
            exerciseId,
          });

          if (newRemaining <= 0) {
            // Natural-expiry path — reuse existing timer completion logic.
            endAtRef.current = Date.now(); // set to now so tick fires immediately
            return;
          }

          // Adjust endAt and update state (elapsed preserved — endAt extends/contracts).
          const newEndTimestamp = Date.now() + newRemaining * 1000;
          endAtRef.current = newEndTimestamp;
          setRest(newRemaining);
          setBreakdown(newBreakdown);

          // Persist the recomputed active timer state unconditionally so
          // app-restore always reflects the adjusted timer, regardless of
          // whether the notification path succeeds (mirrors runTimer() pattern).
          if (sessionId) {
            persistActiveTimerState({
              sessionId,
              endTimestamp: newEndTimestamp,
              durationSeconds: newRemaining,
              breakdown: newBreakdown,
              notificationIds: notificationIdsRef.current,
              previewSnapshot: previewRef.current,
              isLastSet: isLastSetRef.current,
              cueSeconds: 10,
              liveEnabled: false,
            });
          }

          // Cancel the stale notification and reschedule with the updated
          // remaining seconds so backgrounded users get the correct alert.
          cancelNotification();
          void scheduleNotification(newRemaining, newEndTimestamp, newBreakdown, previewRef.current, isLastSetRef.current);
        }).catch(() => {
          // Resolver error on recompute — silently skip; timer continues with old value.
        });
      }, 250);
    },
    [restExerciseId, restSource, sessionId, breakdown, cancelNotification, scheduleNotification, persistActiveTimerState],
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

        notificationIdsRef.current = restoredState.notificationIds;
        previewRef.current = restoredState.previewSnapshot;
        isLastSetRef.current = restoredState.isLastSet;
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

        // BLD-1137: Cold-start resume — re-start live countdown if needed.
        if (restoredState.liveEnabled && AppState.currentState === "active") {
          void presentLiveRestCountdown(remaining, restoredState.previewSnapshot, sessionId).catch(() => {});
          const scheduleNext = () => {
            if (endAtRef.current == null) return;
            const rem = Math.max(0, Math.floor((endAtRef.current - Date.now()) / 1000));
            if (rem <= 0) { stopLiveCountdownInterval(); return; }
            void presentLiveRestCountdown(rem, restoredState.previewSnapshot, sessionId).catch(() => {});
            liveCountdownIntervalRef.current = setTimeout(scheduleNext, 5000) as unknown as ReturnType<typeof setInterval>;
          };
          liveCountdownIntervalRef.current = setTimeout(scheduleNext, 5000) as unknown as ReturnType<typeof setInterval>;
        }

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
  }, [clearPersistedActiveTimer, sessionId, startRestInterval, stopLiveCountdownInterval]);

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
      stopLiveCountdownInterval();
      // Clear any pending recompute debounce on unmount to prevent post-unmount
      // state updates.
      if (recomputeDebounceRef.current) {
        clearTimeout(recomputeDebounceRef.current);
        recomputeDebounceRef.current = null;
      }
    };
  }, [stopRestInterval, stopLiveCountdownInterval]);

  // BLD-1100: Pin/unpin per-exercise rest default from the breakdown sheet.
  const handlePinChange = useCallback((exerciseId: string, pinned: boolean, seconds: number) => {
    setUserRestSeconds(exerciseId, pinned ? seconds : null).catch(() => {});
  }, []);

  return {
    rest,
    breakdown,
    restSource,
    restExerciseId,
    handlePinChange,
    persistedDurationSeconds,
    selectedDurationSeconds,
    restFlashStyle,
    startRest,
    startRestWithDuration,
    startRestWithBreakdown,
    recomputeActiveRest,
    dismissRest,
    restRef,
  };
}
