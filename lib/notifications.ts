import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { getSchedule, getTemplateById } from "./db";

type ExpoNotifications = typeof import("expo-notifications");

let _mod: ExpoNotifications | null = null;
let _unavailable = false;

function isExpoGo(): boolean {
  return Constants.executionEnvironment === "storeClient";
}

function getModule(): ExpoNotifications | null {
  if (_unavailable) return null;
  if (_mod) return _mod;
  if (Platform.OS !== "web" && isExpoGo()) {
    _unavailable = true;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _mod = require("expo-notifications") as ExpoNotifications;
    return _mod;
  } catch {
    _unavailable = true;
    return null;
  }
}

export const isAvailable = (): boolean => getModule() !== null;

// ─── BLD-1137: Smart Rest Coach ─────────────────────────────────────────────

/** Android channel for the 5-second live ongoing countdown notification. */
export const REST_ONGOING_CHANNEL = "rest-ongoing";

/** Android channel for the pre-end cue notification (silent, LOW priority). */
export const REST_CUE_CHANNEL = "rest-cue";

/**
 * Android channel for the rest-complete notification.
 * HIGH importance so Wear OS Companion bridges it to the watch (BLD-1208).
 */
export const REST_COMPLETE_CHANNEL = "rest-complete";

/**
 * Preview of the next set to display on the lock screen.
 * null means no preview available (no next set, or preview disabled by user).
 */
export type NextSetPreview = {
  exerciseName: string;
  exerciseKind: "weighted" | "bodyweight" | "time_based" | "distance";
  plannedWeight: number | null;
  weightUnit: "lb" | "kg";
  repRange: string | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
} | null;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Render a human-readable notification body for the next set preview.
 * Returns null when the preview is null or fields are insufficient to render a
 * valid body — callers must use no-preview fallback copy in that case.
 * Hard rule: output MUST NOT contain null/undefined/NaN/bare unit or bare separator.
 */
export function formatPreviewBody(p: NextSetPreview | null): string | null {
  if (!p) return null;
  const { exerciseName, exerciseKind, plannedWeight, weightUnit, repRange, durationSeconds, distanceMeters } = p;
  if (!exerciseName || typeof exerciseName !== "string") return null;
  try {
    return formatBodyByKind(exerciseName, exerciseKind, plannedWeight, weightUnit, repRange, durationSeconds, distanceMeters);
  } catch {
    return null;
  }
}

function formatBodyByKind(
  exerciseName: string,
  exerciseKind: string,
  plannedWeight: number | null,
  weightUnit: string,
  repRange: string | null,
  durationSeconds: number | null,
  distanceMeters: number | null,
): string | null {
  if (exerciseKind === "time_based") {
    if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
    return `${exerciseName} — ${formatDuration(Math.round(durationSeconds))}`;
  }
  if (exerciseKind === "distance") {
    if (typeof distanceMeters !== "number" || !Number.isFinite(distanceMeters) || distanceMeters <= 0) return null;
    const dist = distanceMeters >= 1000
      ? `${(distanceMeters / 1000).toFixed(1)} km`
      : `${Math.round(distanceMeters)} m`;
    return `${exerciseName} — ${dist}`;
  }
  return formatBodyWeighted(exerciseName, exerciseKind, plannedWeight, weightUnit, repRange);
}

function formatBodyWeighted(
  exerciseName: string,
  exerciseKind: string,
  plannedWeight: number | null,
  weightUnit: string,
  repRange: string | null,
): string | null {
  const reps = repRange && typeof repRange === "string" && repRange.trim() ? repRange.trim() : null;
  const hasWeight = typeof plannedWeight === "number" && Number.isFinite(plannedWeight) && plannedWeight > 0;
  if (exerciseKind === "bodyweight" || !hasWeight) {
    if (!reps) return null;
    return `${exerciseName} — bodyweight × ${reps}`;
  }
  if (!reps) return null;
  const unit = weightUnit === "kg" ? "kg" : "lb";
  return `${exerciseName} — ${plannedWeight} ${unit} × ${reps}`;
}

/**
 * Register Android notification channels for the Smart Rest Coach (BLD-1137/BLD-1208).
 * Three channels: ongoing (LOW), cue (LOW), complete (HIGH — bridges to Wear OS).
 * Idempotent — safe to call on every cold start. No-op on iOS.
 */
export async function ensureRestChannelsRegistered(): Promise<void> {
  if (Platform.OS !== "android") return;
  const mod = getModule();
  if (!mod) return;
  try {
    if (typeof mod.setNotificationChannelAsync !== "function") return;
    const AndroidImportance = mod.AndroidImportance ?? { LOW: 2, HIGH: 4 };
    await mod.setNotificationChannelAsync(REST_ONGOING_CHANNEL, {
      name: "Rest timer (ongoing)",
      importance: AndroidImportance.LOW ?? 2,
      sound: null,
      vibrationPattern: [],
      showBadge: false,
    });
    await mod.setNotificationChannelAsync(REST_CUE_CHANNEL, {
      name: "Rest pre-end cue",
      importance: AndroidImportance.LOW ?? 2,
      sound: null,
      vibrationPattern: [],
      showBadge: false,
    });
    // HIGH importance required so Wear OS Companion bridges this to the watch (BLD-1208).
    // rest-ongoing stays LOW (unobtrusive ticker — bridging to Wear would be obnoxious).
    await mod.setNotificationChannelAsync(REST_COMPLETE_CHANNEL, {
      name: "Rest complete",
      importance: AndroidImportance.HIGH ?? 4,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      showBadge: false,
      enableVibrate: true,
    });
  } catch {
    // Non-critical — channel registration is best-effort
  }
}

/**
 * Schedule the pre-end cue notification.
 * @param secondsUntilCue - Seconds until the cue fires (rest duration - cueSeconds).
 * @param preview - Next set preview (may be null).
 * @param isLastSet - Whether this is the last set of the session.
 * @param cueSeconds - How many seconds before rest end (for the title).
 * @param sessionId - Session identifier for notification ID scoping.
 * @returns Notification identifier or null if scheduling failed/unavailable.
 */
export async function schedulePreEndCue(
  secondsUntilCue: number,
  preview: NextSetPreview,
  isLastSet: boolean,
  cueSeconds: number,
  sessionId: string,
): Promise<string | null> {
  const mod = getModule();
  if (!mod) return null;
  if (secondsUntilCue <= 0) return null;
  try {
    const previewBody = formatPreviewBody(preview);
    let body: string;
    if (isLastSet) {
      body = `Workout ending in ${cueSeconds}s`;
    } else if (previewBody) {
      body = `Next: ${previewBody}`;
    } else {
      body = `Next set in ${cueSeconds}s`;
    }

    const content: Record<string, unknown> = {
      title: `Rest ending in ${cueSeconds}s`,
      body,
      sound: null,
      data: { sessionId, type: "rest_preend" },
    };
    if (Platform.OS === "android") {
      content.channelId = REST_CUE_CHANNEL;
    } else {
      // iOS passive — no heads-up banner
      content.interruptionLevel = "passive";
    }

    const id = await mod.scheduleNotificationAsync({
      identifier: `rest-preend-${sessionId}`,
      content,
      trigger: {
        type: mod.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntilCue,
        repeats: false,
      },
    } as Parameters<typeof mod.scheduleNotificationAsync>[0]);
    return id ?? `rest-preend-${sessionId}`;
  } catch {
    return null;
  }
}

/**
 * Present (or re-present) the live ongoing countdown notification on Android.
 * Dismisses the previous shade entry before posting a new one (BLD-1208) —
 * Android does not replace trigger:null notifications in-place even with a
 * stable identifier, so without the dismiss step every tick stacks a new entry.
 * No-op on iOS.
 * @param secondsRemaining - Current remaining rest seconds (for display).
 * @param preview - Next set preview (may be null).
 * @param sessionId - Session identifier.
 */
export async function presentLiveRestCountdown(
  secondsRemaining: number,
  preview: NextSetPreview,
  sessionId: string,
): Promise<string | null> {
  if (Platform.OS !== "android") return null;
  const mod = getModule();
  if (!mod) return null;
  try {
    const liveId = `rest-live-${sessionId}`;
    // Dismiss the previous shade entry before posting a new one to prevent stacking.
    if (typeof mod.dismissNotificationAsync === "function") {
      try { await mod.dismissNotificationAsync(liveId); } catch { /* not in shade on first call */ }
    }

    const m = Math.floor(secondsRemaining / 60);
    const s = secondsRemaining % 60;
    const timeStr = `${m}:${String(s).padStart(2, "0")}`;
    const previewBody = formatPreviewBody(preview);
    const body = previewBody ?? "Resting\u2026";

    const id = await mod.scheduleNotificationAsync({
      identifier: liveId,
      content: {
        title: `Resting \u00b7 ${timeStr} remaining`,
        body,
        channelId: REST_ONGOING_CHANNEL,
        data: { sessionId, type: "rest_live" },
      },
      trigger: null,
    } as Parameters<typeof mod.scheduleNotificationAsync>[0]);
    return id ?? liveId;
  } catch {
    return null;
  }
}

/**
 * Cancel all rest-related notifications for a session:
 * - Pre-end cue (rest-preend-{sessionId})
 * - Rest complete (rest-complete-{sessionId})
 * - Live ongoing countdown (rest-live-{sessionId})
 *
 * Also dismisses the live notification from the shade if it's showing.
 */
export async function cancelAllRestNotifications(sessionId: string): Promise<void> {
  const mod = getModule();
  if (!mod) return;
  const ids = [
    `rest-preend-${sessionId}`,
    `rest-complete-${sessionId}`,
    `rest-live-${sessionId}`,
  ];
  await Promise.all(ids.map(async (id) => {
    try { await mod.cancelScheduledNotificationAsync(id); } catch { /* already fired or never scheduled */ }
    try {
      if (typeof mod.dismissNotificationAsync === "function") {
        await mod.dismissNotificationAsync(id);
      }
    } catch { /* may not exist in shade */ }
  }));
}

export async function requestPermission(): Promise<boolean> {
  const mod = getModule();
  if (!mod) return false;
  try {
    const { status: existing } = await mod.getPermissionsAsync();
    if (existing === "granted") return true;
    const { status } = await mod.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

export async function getPermissionStatus(): Promise<string> {
  const mod = getModule();
  if (!mod) return "unavailable";
  try {
    const { status } = await mod.getPermissionsAsync();
    return status;
  } catch {
    return "unavailable";
  }
}

export async function scheduleReminders(time: {
  hour: number;
  minute: number;
}): Promise<number> {
  const mod = getModule();
  if (!mod) return 0;
  await mod.cancelAllScheduledNotificationsAsync();
  const entries = await getSchedule();
  if (entries.length === 0) return 0;
  for (const entry of entries) {
    // expo weekday: 1=Sunday..7=Saturday; our day_of_week: 0=Mon..6=Sun
    const weekday = ((entry.day_of_week + 1) % 7) + 1;
    await mod.scheduleNotificationAsync({
      content: {
        title: "Time to train!",
        body: `${entry.template_name} is scheduled for today`,
        data: { templateId: entry.template_id },
      },
      trigger: {
        type: mod.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour: time.hour,
        minute: time.minute,
      },
    });
  }
  return entries.length;
}

export async function cancelAll(): Promise<void> {
  const mod = getModule();
  if (!mod) return;
  await mod.cancelAllScheduledNotificationsAsync();
}

export async function handleResponse(
  response: { notification: { request: { content: { data?: unknown } } } },
  navigate: (path: string, params?: Record<string, string>) => void,
  showSnackbar: (msg: string) => void
): Promise<void> {
  const data = response.notification.request.content.data as
    | Record<string, unknown>
    | undefined;

  // Handle rest-complete notification: navigate to active session
  if (data?.type === "rest_complete" && typeof data.sessionId === "string") {
    navigate(`/session/${data.sessionId}`);
    return;
  }

  const id = data?.templateId;
  if (typeof id !== "string") {
    navigate("/");
    return;
  }
  const tpl = await getTemplateById(id);
  if (!tpl) {
    navigate("/");
    showSnackbar("Scheduled template no longer exists");
    return;
  }
  navigate("/workout/new", { templateId: id });
}

/**
 * Set up the global notification handler.
 *
 * BLD-1137: The global setNotificationHandler slot is single-assignment.
 * This function installs a dispatcher that:
 * - Suppresses the banner/sound for `rest_preend` notifications when the app
 *   is foregrounded, and fires a haptic instead.
 * - Delegates all other notification types to the default show-alert behavior.
 *
 * Slot ownership: notifications.ts owns this slot. If future code needs to
 * add handlers, extend the dispatcher here rather than calling setNotificationHandler
 * elsewhere — overwriting this registration will break the foreground cue suppression.
 *
 * Note on chaining: expo-notifications does NOT expose a getter for any
 * previously-registered handler, so true chaining is not possible. This
 * implementation intentionally overwrites. All notification-type routing
 * is handled inside this dispatcher to keep the single slot self-contained.
 */
export function setupHandler(): void {
  const mod = getModule();
  if (!mod) return;
  try {
    mod.setNotificationHandler({
      handleNotification: async (notification: { request: { content: { data?: unknown } } }) => {
        const data = notification?.request?.content?.data as Record<string, unknown> | undefined;
        if (data?.type === "rest_preend") {
          // Suppress banner; fire haptic feedback as the foreground cue substitute.
          void Haptics.selectionAsync().catch(() => {});
          return {
            shouldShowAlert: false,
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowBanner: false,
            shouldShowList: false,
          };
        }
        // Suppress live countdown banner in foreground — shade managed by dismiss-before-present.
        if (data?.type === "rest_live") {
          return {
            shouldShowAlert: false,
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowBanner: false,
            shouldShowList: false,
          };
        }
        return {
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        };
      },
    });
  } catch {
    _unavailable = true;
  }
}

export function addNotificationResponseReceivedListener(
  listener: (response: { notification: { request: { content: { data?: unknown } } } }) => void
): { remove: () => void } | null {
  const mod = getModule();
  if (!mod) return null;
  try {
    return mod.addNotificationResponseReceivedListener(listener);
  } catch {
    return null;
  }
}

/**
 * Schedule a "Rest Complete" notification to fire after `seconds` seconds.
 * Returns the notification identifier for later cancellation, or null if unavailable.
 *
 * BLD-1137: extended with optional preview and isLastSet for lock-screen body.
 * Backward-compatible: callers that omit preview/isLastSet get original behavior.
 */
export async function scheduleRestComplete(
  seconds: number,
  sessionId: string,
  preview?: NextSetPreview,
  isLastSet?: boolean,
): Promise<string | null> {
  const mod = getModule();
  if (!mod) return null;
  try {
    const previewBody = formatPreviewBody(preview ?? null);
    let body: string;
    if (isLastSet) {
      body = "Last set complete";
    } else if (previewBody) {
      body = previewBody;
    } else {
      body = "Time for your next set.";
    }

    const id = await mod.scheduleNotificationAsync({
      identifier: `rest-complete-${sessionId}`,
      content: {
        title: "Rest complete",
        body,
        sound: "default",
        data: { sessionId, type: "rest_complete" },
        ...(Platform.OS === "android" ? { channelId: REST_COMPLETE_CHANNEL } : {}),
      },
      trigger: {
        type: mod.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: false,
      },
    } as Parameters<typeof mod.scheduleNotificationAsync>[0]);
    return id ?? `rest-complete-${sessionId}`;
  } catch {
    return null;
  }
}

/**
 * Cancel a previously scheduled rest-complete notification by its identifier.
 * @deprecated Prefer cancelAllRestNotifications(sessionId) which cancels all
 * three Smart Rest Coach notifications atomically (BLD-1137).
 */
export async function cancelRestComplete(
  notificationId: string
): Promise<void> {
  const mod = getModule();
  if (!mod) return;
  try {
    await mod.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // Notification may already have fired or been dismissed
  }
}
