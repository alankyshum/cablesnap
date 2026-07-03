import type { MutableRefObject } from "react";
import { defaultBreakdown, type RestBreakdown } from "../lib/rest";
import {
  presentLiveRestCountdown,
  scheduleRestComplete,
  schedulePreEndCue,
  isAvailable,
  requestPermission,
  type NextSetPreview,
} from "../lib/notifications";
import { getAppSetting } from "../lib/db";

/**
 * Interval between live countdown shade updates (ms).
 * 15s is frequent enough for human perception during a rest and minimises
 * shade churn vs the previous 5s cadence (BLD-1208).
 */
export const LIVE_COUNTDOWN_TICK_MS = 15_000;

export const DEFAULT_REST_SECONDS = 30;
export const REST_DEFAULT_SECONDS_KEY = "rest_timer_default_seconds";
export const ACTIVE_REST_TIMER_KEY = "rest_timer_active_state";

export type PersistedRestTimerState = {
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

export function sanitizeRestSeconds(value: string | null): number {
  const parsed = value == null ? Number.NaN : parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REST_SECONDS;
}

export function parsePersistedRestTimerState(value: string | null): PersistedRestTimerState | null {
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

/**
 * BLD-1137/BLD-1208: Self-correcting setTimeout chain that re-presents the
 * Android live rest countdown every LIVE_COUNTDOWN_TICK_MS until the rest
 * ends. Shared by scheduleNotification (fresh start) and the cold-start
 * resume effect so the two paths never drift. No-op on iOS (presentLive… is).
 */
export function startLiveCountdownLoop(params: {
  endAtRef: MutableRefObject<number | null>;
  intervalRef: MutableRefObject<ReturnType<typeof setInterval> | null>;
  preview: NextSetPreview;
  sessionId: string;
  stop: () => void;
}): void {
  const { endAtRef, intervalRef, preview, sessionId, stop } = params;
  const scheduleNext = () => {
    if (endAtRef.current == null) return;
    const remaining = Math.max(0, Math.floor((endAtRef.current - Date.now()) / 1000));
    if (remaining <= 0) {
      stop();
      return;
    }
    void presentLiveRestCountdown(remaining, preview, sessionId).catch(() => {});
    intervalRef.current = setTimeout(scheduleNext, LIVE_COUNTDOWN_TICK_MS) as unknown as ReturnType<typeof setInterval>;
  };
  intervalRef.current = setTimeout(scheduleNext, LIVE_COUNTDOWN_TICK_MS) as unknown as ReturnType<typeof setInterval>;
}

/**
 * BLD-1137 AC12: On cold-start resume (app active), re-arm the OS notifications
 * that an Android force-kill or device restart can drop. scheduleNotificationAsync
 * uses stable identifiers, so these duplicate calls replace-in-place safely.
 */
export function rescheduleResumeNotifications(
  restoredState: PersistedRestTimerState,
  remaining: number,
  sessionId: string,
): void {
  void scheduleRestComplete(remaining, sessionId, restoredState.previewSnapshot, restoredState.isLastSet).catch(() => {});
  if (restoredState.cueSeconds > 0 && remaining > restoredState.cueSeconds + 2) {
    void schedulePreEndCue(
      remaining - restoredState.cueSeconds,
      restoredState.previewSnapshot,
      restoredState.isLastSet,
      restoredState.cueSeconds,
      sessionId,
    ).catch(() => {});
  }
}

/**
 * True for rest sources whose seconds are the user's actual chosen value
 * (history replay or a pinned per-exercise default) and therefore must NOT be
 * re-multiplied by resolveRestSeconds — doing so double-counts the multiplier.
 */
export function isPresetRestSource(kind: string | null | undefined): boolean {
  return kind === "history" || kind === "pinned";
}

/**
 * BLD-1137: Schedule the pre-end cue, rest-complete, and (Android) live-countdown
 * notifications for a fresh rest, persisting the resulting IDs. Extracted from
 * useRestTimer.scheduleNotification to keep that hook under the FTA complexity
 * cap. Smart-Rest-Coach behavior is hardcoded (5s pre-end cue, live countdown on,
 * next-set preview shown) since the per-setting controls were removed from the UI.
 * Returns the scheduled notification IDs ({} if disabled/unavailable/failed).
 */
export async function scheduleRestNotifications(params: {
  sessionId: string;
  seconds: number;
  endTimestamp: number;
  nextBreakdown: RestBreakdown;
  preview: NextSetPreview;
  isLastSet: boolean;
  endAtRef: MutableRefObject<number | null>;
  intervalRef: MutableRefObject<ReturnType<typeof setInterval> | null>;
  stopInterval: () => void;
  persist: (state: PersistedRestTimerState | null) => void;
}): Promise<PersistedRestTimerState["notificationIds"]> {
  const { sessionId, seconds, endTimestamp, nextBreakdown, preview, isLastSet, endAtRef, intervalRef, stopInterval, persist } = params;
  if (!sessionId || seconds <= 0) return {};
  try {
    if ((await getAppSetting("rest_notification_enabled")) === "false") return {};
    if (!isAvailable()) return {};
    if (!(await requestPermission())) return {};

    const cueSeconds = 5;
    const liveEnabled = true;
    const ids: PersistedRestTimerState["notificationIds"] = {};

    if (seconds > cueSeconds + 2) {
      ids.preEnd = await schedulePreEndCue(seconds - cueSeconds, preview, isLastSet, cueSeconds, sessionId);
    }
    ids.complete = await scheduleRestComplete(seconds, sessionId, preview, isLastSet);

    if (liveEnabled) {
      const liveId = await presentLiveRestCountdown(seconds, preview, sessionId);
      ids.liveOngoing = liveId;
      if (liveId) {
        stopInterval();
        startLiveCountdownLoop({ endAtRef, intervalRef, preview, sessionId, stop: stopInterval });
      }
    }

    persist({
      sessionId,
      endTimestamp,
      durationSeconds: seconds,
      breakdown: nextBreakdown,
      notificationIds: ids,
      previewSnapshot: preview,
      isLastSet,
      cueSeconds,
      liveEnabled,
    });
    return ids;
  } catch {
    return {};
  }
}
