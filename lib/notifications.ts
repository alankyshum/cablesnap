import { Platform } from "react-native";
import Constants from "expo-constants";
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

export function setupHandler(): void {
  const mod = getModule();
  if (!mod) return;
  try {
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
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
 */
export async function scheduleRestComplete(
  seconds: number,
  sessionId: string
): Promise<string | null> {
  const mod = getModule();
  if (!mod) return null;
  try {
    const id = await mod.scheduleNotificationAsync({
      content: {
        title: "Rest complete",
        body: "Time for your next set.",
        sound: "default",
        data: { sessionId, type: "rest_complete" },
      },
      trigger: {
        type: mod.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: false,
      },
    });
    return id;
  } catch {
    return null;
  }
}

/**
 * Cancel a previously scheduled rest-complete notification by its identifier.
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
