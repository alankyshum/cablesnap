import { Platform, Linking } from "react-native";
import {
  getAppSetting,
  setAppSetting,
  getSessionById,
  getSessionSets,
} from "./db";
import {
  createHCSyncLogEntry,
  markHCSyncSuccess,
  markHCSyncFailed,
  markHCSyncPermanentlyFailed,
  getHCPendingOrFailedSyncs,
  markAllHCPendingAsFailed,
} from "./db/health-connect";

const MAX_RETRIES = 3;
const HC_PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata";

type SdkStatusResult = "available" | "needs_install" | "needs_update" | "unavailable";

// Lazy-load the native Health Connect SDK (dynamic import prevents iOS/web crashes)
async function getHCModule() {
  const mod = await import("react-native-health-connect");
  return mod;
}

let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  const { initialize } = await getHCModule();
  await initialize();
  initialized = true;
}

// ---- SDK Status ----

export async function getHealthConnectSdkStatus(): Promise<SdkStatusResult> {
  if (Platform.OS !== "android") return "unavailable";
  try {
    await ensureInitialized();
    const { getSdkStatus, SdkAvailabilityStatus } = await getHCModule();
    const status = await getSdkStatus();
    switch (status) {
      case SdkAvailabilityStatus.SDK_AVAILABLE:
        return "available";
      case SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED:
        return "needs_update";
      default:
        return "unavailable";
    }
  } catch {
    return "unavailable";
  }
}

// ---- Permission Handling ----

export async function requestHealthConnectPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    await ensureInitialized();
    const { requestPermission } = await getHCModule();
    const granted = await requestPermission([
      { accessType: "write", recordType: "ExerciseSession" },
    ]);
    return granted.length > 0;
  } catch {
    return false;
  }
}

export async function checkHealthConnectPermissionStatus(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    await ensureInitialized();
    const { getGrantedPermissions } = await getHCModule();
    const granted = await getGrantedPermissions();
    return granted.some(
      (p: { recordType: string; accessType: string }) =>
        p.recordType === "ExerciseSession" && p.accessType === "write"
    );
  } catch {
    return false;
  }
}

// ---- Play Store Link ----

export function openHealthConnectPlayStore(): void {
  Linking.openURL(HC_PLAY_STORE_URL).catch(() => {});
}

// ---- Sync ----

export async function syncToHealthConnect(sessionId: string): Promise<boolean> {
  if (Platform.OS !== "android") return false;

  const enabled = await getAppSetting("health_connect_enabled");
  if (enabled !== "true") return false;

  const sdkStatus = await getHealthConnectSdkStatus();
  if (sdkStatus !== "available") return false;

  const hasPermission = await checkHealthConnectPermissionStatus();
  if (!hasPermission) return false;

  const session = await getSessionById(sessionId);
  if (!session) return false;

  const sets = await getSessionSets(sessionId);
  const completedSets = sets.filter((s) => s.completed);
  if (completedSets.length === 0) {
    await createHCSyncLogEntry(sessionId);
    await markHCSyncPermanentlyFailed(sessionId, "No completed sets");
    return false;
  }

  await createHCSyncLogEntry(sessionId);

  try {
    const { insertRecords } = await getHCModule();

    // Build exercise segments — one per unique exercise
    const exerciseMap = new Map<string, { startTime: string; endTime: string }>();
    const sessionStartMs = session.started_at;
    const sessionEndMs = session.completed_at ?? Date.now();

    for (const set of completedSets) {
      const exerciseId = set.exercise_id;
      if (!exerciseMap.has(exerciseId)) {
        exerciseMap.set(exerciseId, {
          startTime: new Date(sessionStartMs).toISOString(),
          endTime: new Date(sessionEndMs).toISOString(),
        });
      }
    }

    const segments = Array.from(exerciseMap.values()).map((timing) => ({
      startTime: timing.startTime,
      endTime: timing.endTime,
      segmentType: 80, // EXERCISE_SEGMENT_TYPE_WEIGHTLIFTING
      repetitions: 0,
      exerciseType: 80,
    }));

    const record = {
      recordType: "ExerciseSession" as const,
      startTime: new Date(sessionStartMs).toISOString(),
      endTime: new Date(sessionEndMs).toISOString(),
      exerciseType: 80, // EXERCISE_TYPE_WEIGHTLIFTING
      title: session.name || "Strength Training",
      segments,
      metadata: {
        clientRecordId: `fitforge-${sessionId}`,
      },
    };

    const result = await insertRecords([record]);
    const recordId = result?.[0];
    await markHCSyncSuccess(sessionId, recordId);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markHCSyncFailed(sessionId, message);
    return false;
  }
}

// ---- Queue Reconciliation ----

export async function reconcileHealthConnectQueue(): Promise<void> {
  if (Platform.OS !== "android") return;

  const enabled = await getAppSetting("health_connect_enabled");
  if (enabled !== "true") return;

  const sdkStatus = await getHealthConnectSdkStatus();
  if (sdkStatus !== "available") return;

  const hasPermission = await checkHealthConnectPermissionStatus();
  if (!hasPermission) return;

  const pendingOrFailed = await getHCPendingOrFailedSyncs();

  for (const entry of pendingOrFailed) {
    if (entry.retry_count >= MAX_RETRIES) {
      await markHCSyncPermanentlyFailed(entry.session_id, "Max retries exceeded");
      continue;
    }

    try {
      const session = await getSessionById(entry.session_id);
      if (!session) {
        await markHCSyncPermanentlyFailed(entry.session_id, "Session not found");
        continue;
      }

      const sets = await getSessionSets(entry.session_id);
      const completedSets = sets.filter((s) => s.completed);
      if (completedSets.length === 0) {
        await markHCSyncPermanentlyFailed(entry.session_id, "No completed sets");
        continue;
      }

      const { insertRecords } = await getHCModule();
      const sessionStartMs = session.started_at;
      const sessionEndMs = session.completed_at ?? Date.now();

      const exerciseMap = new Map<string, { startTime: string; endTime: string }>();
      for (const set of completedSets) {
        if (!exerciseMap.has(set.exercise_id)) {
          exerciseMap.set(set.exercise_id, {
            startTime: new Date(sessionStartMs).toISOString(),
            endTime: new Date(sessionEndMs).toISOString(),
          });
        }
      }

      const segments = Array.from(exerciseMap.values()).map((timing) => ({
        startTime: timing.startTime,
        endTime: timing.endTime,
        segmentType: 80,
        repetitions: 0,
        exerciseType: 80,
      }));

      const record = {
        recordType: "ExerciseSession" as const,
        startTime: new Date(sessionStartMs).toISOString(),
        endTime: new Date(sessionEndMs).toISOString(),
        exerciseType: 80,
        title: session.name || "Strength Training",
        segments,
        metadata: {
          clientRecordId: `fitforge-${entry.session_id}`,
        },
      };

      const result = await insertRecords([record]);
      const recordId = result?.[0];
      await markHCSyncSuccess(entry.session_id, recordId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markHCSyncFailed(entry.session_id, message);

      if (entry.retry_count + 1 >= MAX_RETRIES) {
        await markHCSyncPermanentlyFailed(entry.session_id, "Max retries exceeded");
      }
    }
  }
}

// ---- Toggle Disable Cleanup ----

export async function disableHealthConnect(): Promise<void> {
  await setAppSetting("health_connect_enabled", "false");
  await markAllHCPendingAsFailed("User disabled Health Connect");
}
