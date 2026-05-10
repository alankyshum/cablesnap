/**
 * BLD-1130 G1 (closes BLD-1127 AC4): persistence helpers for the one-time
 * "calibrate to log by marker" hint shown on cable rows in gyms that have no
 * stack calibrations yet.
 *
 * Storage: `app_settings` row keyed by STACK_MARKER_HINT_DISMISSED_AT_KEY.
 * Value: ISO-8601 timestamp string of when the user dismissed it (null when
 * never dismissed). Per-device, not synced — this is purely a UI nudge state.
 */
import { getAppSetting, setAppSetting } from "@/lib/db/settings";

export const STACK_MARKER_HINT_DISMISSED_AT_KEY = "stackMarkerHintDismissedAt";

export async function getStackMarkerHintDismissedAt(): Promise<string | null> {
  return getAppSetting(STACK_MARKER_HINT_DISMISSED_AT_KEY);
}

export async function dismissStackMarkerHint(now: Date = new Date()): Promise<void> {
  await setAppSetting(STACK_MARKER_HINT_DISMISSED_AT_KEY, now.toISOString());
}
