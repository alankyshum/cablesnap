/*
 * WHY WE USE A WORKER BOUNCE FOR STRAVA OAUTH
 * --------------------------------------------
 * Strava's /oauth/authorize endpoint rejects custom URI scheme redirect_uris
 * (e.g. cablesnap://strava-callback) with an HTTP 302 → "invalid redirect_uri".
 * It only accepts http(s):// URLs whose host matches the registered
 * "Authorization Callback Domain".
 *
 * Fix: We send redirect_uri=https://strava-proxy.alankyshum.workers.dev/callback
 * (accepted by Strava). The worker's GET /callback handler reads the code/scope/
 * state query params and 302-redirects to cablesnap://strava-callback?<params>.
 * WebBrowser.openAuthSessionAsync intercepts that cablesnap:// redirect (matches
 * its second argument), closes the in-app browser, and returns the deep-link URL
 * to the app. We then parse the code from the URL and POST to the proxy /token.
 */
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import {
  getStravaConnection,
  deleteStravaConnection,
  createSyncLogEntry,
  markSyncSuccess,
  markSyncSkippedDuplicate,
  markSyncFailed,
  markSyncPermanentlyFailed,
  getPendingOrFailedSyncs,
  getSessionById,
  getSessionSets,
  getBodySettings,
  getEffectivePromoCaption,
  getShareSettings,
  getSyncLogForSession,
} from "./db";
export {
  StravaError,
  getStravaUserMessage,
  getStravaSupportAction,
  STRAVA_SUPPORT_URL,
} from "./strava-error";
export type { StravaErrorCode, StravaSupportAction } from "./strava-error";
import {
  StravaError,
  classifyHttpStatus,
  isNetworkError,
} from "./strava-error";
import {
  captureStravaError,
  stravaBreakcrumb,
  stravaLog,
} from "./strava-telemetry";

// Strava API constants
const STRAVA_API_BASE = "https://www.strava.com/api/v3";

// SecureStore keys
const KEY_ACCESS_TOKEN = "strava_access_token";
const KEY_REFRESH_TOKEN = "strava_refresh_token";
const KEY_TOKEN_EXPIRES_AT = "strava_token_expires_at";
// Persisted before opening the OAuth browser so cold-start recovery can match
// the deep-link state against the state from the prior process.
export const KEY_PENDING_OAUTH_STATE = "strava_pending_oauth_state";

const MAX_RETRIES = 3;

export function getClientId(): string {
  return Constants.expoConfig?.extra?.stravaClientId ?? "";
}

export function getProxyUrl(): string {
  const url = Constants.expoConfig?.extra?.stravaProxyUrl;
  if (!url) throw new Error("Strava proxy URL not configured");
  return url as string;
}

// OAuth redirect constants
// redirect_uri sent to Strava — must be an https:// URL matching the registered domain.
// The worker's GET /callback bounces this to the cablesnap:// deep link below.
export const REDIRECT_URI_FOR_STRAVA = `${Constants.expoConfig?.extra?.stravaProxyUrl ?? "https://strava-proxy.alankyshum.workers.dev"}/callback`;
// Deep link that WebBrowser.openAuthSessionAsync watches for to close the browser.
export const APP_DEEP_LINK = "cablesnap://strava-callback";
// On bare Android, Custom Tabs may dismiss and report `cancel`/`dismiss` one
// macrotask before the OS delivers the `cablesnap://strava-callback` deep-link
// event. This grace window keeps the Linking listener alive after a browser
// cancel so a valid callback that arrives within this window still wins.

WebBrowser.maybeCompleteAuthSession();

// ---- Token Management (SecureStore only) ----

async function getAccessToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    return await SecureStore.getItemAsync(KEY_ACCESS_TOKEN);
  } catch {
    return null;
  }
}

async function getRefreshToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    return await SecureStore.getItemAsync(KEY_REFRESH_TOKEN);
  } catch {
    return null;
  }
}

async function getTokenExpiresAt(): Promise<number> {
  if (Platform.OS === "web") return 0;
  try {
    const val = await SecureStore.getItemAsync(KEY_TOKEN_EXPIRES_AT);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

export async function saveTokens(
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): Promise<void> {
  await SecureStore.setItemAsync(KEY_ACCESS_TOKEN, accessToken);
  await SecureStore.setItemAsync(KEY_REFRESH_TOKEN, refreshToken);
  await SecureStore.setItemAsync(KEY_TOKEN_EXPIRES_AT, String(expiresAt));
}

async function clearTokens(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_ACCESS_TOKEN);
    await SecureStore.deleteItemAsync(KEY_REFRESH_TOKEN);
    await SecureStore.deleteItemAsync(KEY_TOKEN_EXPIRES_AT);
  } catch {
    // Best-effort cleanup
  }
}

// ---- Token Refresh ----

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  let proxyUrl: string;
  try {
    proxyUrl = getProxyUrl();
  } catch {
    return null;
  }

  try {
    const response = await fetch(`${proxyUrl}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      // Token revoked or invalid — disconnect
      if (response.status === 401 || response.status === 400) await disconnect();
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data = await response.json();
    await saveTokens(data.access_token, data.refresh_token, data.expires_at);
    stravaLog("info", "strava refresh succeeded", { flow: "strava_refresh", step: "success" });
    return data.access_token;
  } catch (err) {
    if (isNetworkError(err)) {
      // Network outage during token refresh is a benign transient (device offline /
      // proxy unreachable). Do NOT report to Sentry — it is expected in an offline-
      // first app and was causing false-positive noise (Sentry REACT-NATIVE-B /
      // BLD-1652). Just log at warn level so the lifecycle is still observable.
      stravaLog("warn", "Strava token refresh skipped (network offline)", {
        flow: "strava_refresh",
        step: "token_refresh",
      });
    } else {
      console.error("Strava token refresh failed:", err);
      captureStravaError(err, "strava_refresh", "token_refresh", { proxyUrl });
    }
    return null;
  }
}

async function getValidAccessToken(): Promise<string | null> {
  const expiresAt = await getTokenExpiresAt();
  const now = Math.floor(Date.now() / 1000);

  // Refresh if expiring within 5 minutes
  if (expiresAt > 0 && expiresAt - now > 300) {
    return await getAccessToken();
  }

  return await refreshAccessToken();
}

// ---- Token Exchange ----

export async function exchangeCodeForTokens(
  code: string,
  proxyUrl: string,
  clientId: string,
): Promise<Record<string, unknown>> {
  stravaBreakcrumb("token exchange starting", { proxyUrl });
  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(`${proxyUrl}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
  } catch (err) {
    captureStravaError(err, "strava_connect", "token_exchange", { redirectUri: REDIRECT_URI_FOR_STRAVA, proxyUrl, clientId });
    if (isNetworkError(err)) {
      throw new StravaError("network", err instanceof Error ? err.message : "Network request failed");
    }
    throw new StravaError("unknown", err instanceof Error ? err.message : String(err));
  }

  if (!tokenResponse.ok) {
    const err = new StravaError(
      classifyHttpStatus(tokenResponse.status),
      `Token exchange failed: ${tokenResponse.status}`,
      tokenResponse.status,
    );
    captureStravaError(err, "strava_connect", "token_exchange", { redirectUri: REDIRECT_URI_FOR_STRAVA, proxyUrl, clientId, status: tokenResponse.status });
    throw err;
  }

  const tokens = (await tokenResponse.json()) as Record<string, unknown>;
  stravaLog("info", "strava token exchange succeeded", { flow: "strava_connect", step: "token_exchange_ok" });
  return tokens;
}

export { completeStravaCallback, connectStrava } from "./strava-callback";

export async function disconnect(): Promise<void> {
  stravaLog("info", "strava disconnect started", { flow: "strava_disconnect", step: "start" });
  // Attempt to revoke on Strava (best-effort)
  try {
    const token = await getAccessToken();
    if (token) {
      await fetch("https://www.strava.com/oauth/deauthorize", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } catch {
    // Best-effort revocation
  }

  await clearTokens();
  await deleteStravaConnection();
  stravaLog("info", "strava disconnect succeeded", { flow: "strava_disconnect", step: "success" });
}

export async function isStravaConnected(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const connection = await getStravaConnection();
  return connection !== null;
}

// ---- Activity Upload ----

function formatSetDesc(s: { weight: number | null; reps: number | null }, weightUnit: string): string {
  if (s.weight && s.reps) return `${s.weight}${weightUnit} × ${s.reps}`;
  if (s.reps) return `${s.reps} reps`;
  if (s.weight) return `${s.weight}${weightUnit}`;
  return "1 set";
}

function buildActivityDescription(
  sets: Array<{
    exercise_name?: string | null;
    weight: number | null;
    reps: number | null;
    completed: boolean;
    set_type: string;
  }>,
  weightUnit: "kg" | "lb",
  promoCaption?: string
): string {
  const completedSets = sets.filter((s) => s.completed);
  if (completedSets.length === 0) return "";

  // Group sets by exercise
  const byExercise = new Map<string, Array<{ weight: number | null; reps: number | null }>>();
  for (const s of completedSets) {
    const name = s.exercise_name ?? "Unknown Exercise";
    if (!byExercise.has(name)) byExercise.set(name, []);
    byExercise.get(name)!.push({ weight: s.weight, reps: s.reps });
  }

  const lines: string[] = [];
  for (const [name, exerciseSets] of byExercise) {
    const setDescs = exerciseSets.map((s) => formatSetDesc(s, weightUnit));
    lines.push(`${name}: ${setDescs.join(", ")}`);
  }

  const description = lines.join("\n");
  if (promoCaption && promoCaption.trim().length > 0) {
    return description + "\n\n\n—\n" + promoCaption.trim();
  }
  return description;
}

function isStravaAppInactive(body: string): boolean {
  if (!body) return false;
  try {
    const parsed = JSON.parse(body);
    return !!(
      parsed &&
      Array.isArray(parsed.errors) &&
      parsed.errors.some(
        (e: { code?: string; resource?: string }) =>
          e &&
          (e.code === "Inactive" || e.code === "inactive") &&
          (e.resource === "Application" || e.resource === "application")
      )
    );
  } catch {
    return false;
  }
}

async function handleUpload403(response: Response, sessionId: string): Promise<never> {
  const body = await response.text().catch(() => "");
  if (isStravaAppInactive(body)) {
    stravaLog("warn", "strava upload blocked — app inactive (known permanent 403)", {
      flow: "strava_upload",
      step: "api_call",
      sessionId,
      status: 403,
      source: "strava_activity_sync",
      phase: "post-connect",
    });
    throw new StravaError("app_inactive", "Strava app is inactive. Please contact support.", 403);
  }
  const err = new StravaError("auth_expired", "Strava API error 403", 403);
  captureStravaError(err, "strava_upload", "api_call", { sessionId, status: 403 });
  throw err;
}

async function handleUpload409(accessToken: string, sessionId: string, description: string | undefined): Promise<string | null> {
  stravaLog("info", "strava upload duplicate (409) — resolving existing activity", {
    flow: "strava_upload",
    step: "duplicate_409",
    sessionId,
  });
  const resolvedId = await resolveExistingActivityId(accessToken, sessionId);
  if (resolvedId && description !== undefined) {
    try {
      const activity = await getActivity(resolvedId);
      if (activity && activity.description !== description) {
        await updateActivityDescription(resolvedId, description);
        stravaLog("info", "strava_description_updated", { sessionId, activityId: resolvedId });
      }
    } catch (err) {
      stravaLog("warn", "strava 409 description update failed — non-blocking", {
        flow: "strava_upload",
        step: "409_description_update_failed",
        sessionId,
        activityId: resolvedId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return resolvedId;
}

/**
 * Returns the Strava activity ID on success, or null when the activity
 * already exists on Strava (HTTP 409) but we cannot resolve its ID.
 * Callers must treat null as an idempotent "already synced" result.
 * */
async function uploadActivity(
  sessionId: string
): Promise<string | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    throw new Error("No valid Strava access token");
  }

  const session = await getSessionById(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const sets = await getSessionSets(sessionId);
  const completedSets = sets.filter((s) => s.completed);
  if (completedSets.length === 0) {
    throw new Error("No completed sets to sync");
  }

  const bodySettings = await getBodySettings();
  const weightUnit = bodySettings.weight_unit as "kg" | "lb";

  const { promoCaption, stravaDescriptionEnabled } = await getShareSettingsForUpload();
  const description = buildActivityDescription(
    sets,
    weightUnit,
    stravaDescriptionEnabled ? promoCaption : undefined
  );

  // BLD-630: anchor Strava activity start to first-completed-set.
  const startDate = new Date(session.clock_started_at ?? session.started_at).toISOString();
  const elapsedTime = session.duration_seconds ?? 0;

  const bodyPayload: Record<string, unknown> = {
    name: session.name || "Strength Training",
    type: "WeightTraining",
    sport_type: "WeightTraining",
    start_date_local: startDate,
    elapsed_time: elapsedTime,
    external_id: `cablesnap-${sessionId}`,
  };
  if (description && description.trim().length > 0) {
    bodyPayload.description = description;
  }

  const response = await fetch(`${STRAVA_API_BASE}/activities`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bodyPayload),
  });

  if (response.status === 401) {
    captureStravaError(new Error("Strava access revoked"), "strava_upload", "api_call", { sessionId });
    await disconnect();
    throw new Error("Strava access revoked. Please reconnect.");
  }

  // BLD-3063: 403 with "Application Status Inactive" is a known permanent
  // failure (client_id deactivated on Strava dashboard). Do NOT re-pollute
  // Sentry with this unactionable error. Log at warn level for signal,
  // throw so the caller treats it as a permanent failure.
  if (response.status === 403) {
    return handleUpload403(response, sessionId);
  }

  // BLD-1240: 409 = activity with this external_id already exists on Strava.
  // Treat as an idempotent re-sync: attempt to resolve the existing activity ID
  // so the queue entry can be marked `synced`. If resolution fails, return null
  // (caller marks synced with no activityId — still success, never an error).
  if (response.status === 409) {
    return handleUpload409(accessToken, sessionId, description);
  }

  if (!response.ok) {
    const err = new StravaError(
      classifyHttpStatus(response.status),
      `Strava API error ${response.status}`,
      response.status,
    );
    captureStravaError(err, "strava_upload", "api_call", { sessionId, status: response.status });
    throw err;
  }

  const activity = await response.json();
  return String(activity.id);
}

async function getShareSettingsForUpload(): Promise<{ promoCaption: string; stravaDescriptionEnabled: boolean }> {
  try {
    const promoCaption = await getEffectivePromoCaption();
    const raw = await getShareSettings();
    return {
      promoCaption,
      stravaDescriptionEnabled: raw.strava_description_enabled === 1,
    };
  } catch {
    return { promoCaption: "", stravaDescriptionEnabled: true };
  }
}

/**
 * Update the description of an existing Strava activity.
 * Used when user edits promo caption AFTER an activity was already synced,
 * or when a 409 resolves to an existing activity.
 * Do NOT call automatically on fresh upload — POST /activities already includes description.
 */
export async function updateActivityDescription(
  activityId: string,
  description: string
): Promise<void> {
  if (!description || description.trim().length === 0) {
    return;
  }
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    throw new Error("No valid Strava access token");
  }

  const response = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ description }),
  });

  if (response.status === 401) {
    captureStravaError(new Error("Strava access revoked"), "strava_update_description", "api_call", { activityId });
    await disconnect();
    throw new Error("Strava access revoked. Please reconnect.");
  }

  if (response.status === 403) {
    const body = await response.text().catch(() => "");
    if (isStravaAppInactive(body)) {
      stravaLog("warn", "strava description update blocked — app inactive (known permanent 403)", {
        flow: "strava_update_description",
        step: "api_call",
        activityId,
        status: 403,
      });
      throw new StravaError("app_inactive", "Strava app is inactive. Please contact support.", 403);
    }
    const err = new StravaError("auth_expired", "Strava API error 403", 403);
    captureStravaError(err, "strava_update_description", "api_call", { activityId, status: 403 });
    throw err;
  }

  if (!response.ok) {
    const err = new StravaError(
      classifyHttpStatus(response.status),
      `Strava API error ${response.status}`,
      response.status,
    );
    captureStravaError(err, "strava_update_description", "api_call", { activityId, status: response.status });
    throw err;
  }
}

/**
 * Fetches the activity details from Strava.
 */
async function getActivity(
  activityId: string
): Promise<{ description: string } | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    throw new Error("No valid Strava access token");
  }

  const response = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 401) {
    captureStravaError(new Error("Strava access revoked"), "strava_get_activity", "api_call", { activityId });
    await disconnect();
    throw new Error("Strava access revoked. Please reconnect.");
  }

  if (response.status === 403) {
    const body = await response.text().catch(() => "");
    if (isStravaAppInactive(body)) {
      stravaLog("warn", "strava get activity blocked — app inactive (known permanent 403)", {
        flow: "strava_get_activity",
        step: "api_call",
        activityId,
        status: 403,
      });
      throw new StravaError("app_inactive", "Strava app is inactive. Please contact support.", 403);
    }
    const err = new StravaError("auth_expired", "Strava API error 403", 403);
    captureStravaError(err, "strava_get_activity", "api_call", { activityId, status: 403 });
    throw err;
  }

  if (!response.ok) {
    const err = new StravaError(
      classifyHttpStatus(response.status),
      `Strava API error ${response.status}`,
      response.status,
    );
    captureStravaError(err, "strava_get_activity", "api_call", { activityId, status: response.status });
    throw err;
  }

  const data = await response.json();
  return { description: data.description ?? "" };
}

/**
 * Attempts to find the Strava activityId for a session that was already
 * uploaded (caused a 409). Returns the activityId string if found, or null
 * if the lookup returns no results or fails.
 */
async function resolveExistingActivityId(
  token: string,
  sessionId: string
): Promise<string | null> {
  try {
    const url = `${STRAVA_API_BASE}/athlete/activities?external_id_eq=cablesnap-${encodeURIComponent(sessionId)}&per_page=1`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      stravaLog("warn", "strava 409 duplicate — lookup returned non-OK, treating as synced-skipped", {
        flow: "strava_upload",
        step: "duplicate_409_lookup_failed",
        sessionId,
        lookupStatus: res.status,
      });
      return null;
    }
    const activities: Array<{ id: number | string }> = await res.json();
    if (Array.isArray(activities) && activities.length > 0) {
      return String(activities[0].id);
    }
    // API returned OK but no matching activity — treat as synced with no ID
    stravaLog("warn", "strava 409 duplicate — lookup returned no matching activity, treating as synced-skipped", {
      flow: "strava_upload",
      step: "duplicate_409_lookup_empty",
      sessionId,
    });
  } catch (lookupErr) {
    stravaLog("warn", "strava 409 duplicate — lookup threw, treating as synced-skipped", {
      flow: "strava_upload",
      step: "duplicate_409_lookup_threw",
      sessionId,
      error: lookupErr instanceof Error ? lookupErr.message : String(lookupErr),
    });
  }
  return null;
}

// ---- Sync Orchestration ----

export type SyncResult =
  | { status: "synced"; activityId: string | null }
  | { status: "queued"; error: Error }
  | { status: "failed"; error: Error }
  | { status: "skipped" };

/** Returns true if the upload error represents a permanent config or auth failure. */
function isPermanentError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message.includes("Strava access revoked")) return true;
  if (err instanceof StravaError) {
    return err.code === "app_inactive" || err.code === "config" || err.code === "auth_revoked";
  }
  return false;
}

async function handlePostSyncDescriptionUpdate(
  sessionId: string,
  syncLog: { strava_activity_id: string; synced_at: number | null },
  sets: Array<{
    exercise_name?: string | null;
    weight: number | null;
    reps: number | null;
    completed: boolean;
    set_type: string;
  }>
): Promise<SyncResult> {
  const shareSettings = await getShareSettings();
  const isEditedPostSync = syncLog.synced_at && shareSettings.updated_at > syncLog.synced_at;
  if (!isEditedPostSync) {
    return { status: "synced", activityId: syncLog.strava_activity_id };
  }

  const bodySettings = await getBodySettings();
  const weightUnit = bodySettings.weight_unit as "kg" | "lb";
  const promoCaption = await getEffectivePromoCaption();
  const newDesc = buildActivityDescription(
    sets,
    weightUnit,
    shareSettings.strava_description_enabled ? promoCaption : undefined
  );

  if (!newDesc) {
    stravaLog("info", "strava description update skipped — empty description", {
      flow: "strava_update_description",
      step: "skip_empty",
      sessionId,
      activityId: syncLog.strava_activity_id,
    });
    await markSyncSuccess(sessionId, syncLog.strava_activity_id);
    return { status: "synced", activityId: syncLog.strava_activity_id };
  }

  try {
    const activity = await getActivity(syncLog.strava_activity_id);
    if (activity && activity.description === newDesc) {
      stravaLog("info", "strava description update skipped — unchanged", {
        flow: "strava_update_description",
        step: "skip_unchanged",
        sessionId,
        activityId: syncLog.strava_activity_id,
      });
      await markSyncSuccess(sessionId, syncLog.strava_activity_id);
      return { status: "synced", activityId: syncLog.strava_activity_id };
    }

    await updateActivityDescription(syncLog.strava_activity_id, newDesc);
    stravaLog("info", "strava_description_updated", { sessionId, activityId: syncLog.strava_activity_id });
    await markSyncSuccess(sessionId, syncLog.strava_activity_id);
  } catch (err) {
    stravaLog("warn", "strava description update failed — non-blocking", {
      flow: "strava_update_description",
      step: "update_failed",
      sessionId,
      activityId: syncLog.strava_activity_id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return { status: "synced", activityId: syncLog.strava_activity_id };
}

async function handleUploadFailure(
  sessionId: string,
  err: unknown,
  setCount: number,
  completedCount: number
): Promise<SyncResult> {
  const error = err instanceof Error ? err : new Error(String(err));
  await markSyncFailed(sessionId, error.message);
  const isPermanent = isPermanentError(err);

  stravaLog(isPermanent ? "error" : "warn", "strava upload failed post-connect", {
    source: "strava_activity_sync",
    phase: "post-connect",
    sessionId,
    setCount,
    completedCount,
    status: isPermanent ? "failed" : "queued",
    errorCode: error instanceof StravaError ? error.code : undefined,
    retryInfo: isPermanent ? "permanent" : "will_retry",
  });

  if (isPermanent) {
    await markSyncPermanentlyFailed(sessionId);
    return { status: "failed", error };
  }

  return { status: "queued", error };
}

export async function syncSessionToStrava(sessionId: string): Promise<SyncResult> {
  stravaLog("info", "strava upload started", { flow: "strava_upload", step: "start", sessionId });
  if (Platform.OS === "web") return { status: "skipped" };
  const connection = await getStravaConnection();
  if (!connection) return { status: "skipped" };

  // Check for completed sets first
  const sets = await getSessionSets(sessionId);
  const completed = sets.filter((s) => s.completed);
  if (completed.length === 0) return { status: "skipped" };

  // Check if already synced and potentially edited post-sync
  const syncLog = await getSyncLogForSession(sessionId);
  if (syncLog && syncLog.status === "synced" && syncLog.strava_activity_id) {
    return handlePostSyncDescriptionUpdate(
      sessionId,
      syncLog as { strava_activity_id: string; synced_at: number | null },
      sets
    );
  }

  await createSyncLogEntry(sessionId);

  const setCount = sets.length;
  const completedCount = completed.length;

  let activityId: string | null;
  try {
    activityId = await uploadActivity(sessionId);
  } catch (err) {
    return handleUploadFailure(sessionId, err, setCount, completedCount);
  }

  // Upload succeeded (or 409 duplicate) -- activity exists on Strava.
  // For unresolved 409 (activityId === null), mark the entry as a terminal synced state
  // but return { status: "skipped" } so the UI suppresses the "Synced to Strava ✓" toast.
  // For a resolved 409 or 200, proceed with normal success bookkeeping and toast.
  try {
    await markSyncSuccess(sessionId, activityId);
  } catch (bookkeepingErr) {
    captureStravaError(
      bookkeepingErr instanceof Error ? bookkeepingErr : new Error(String(bookkeepingErr)),
      "strava_upload",
      "db_write",
      { sessionId, activityId }
    );
  }

  if (activityId === null) {
    // Unresolved duplicate — activity is on Strava but we couldn't look up its ID.
    // Queue entry is now terminal (synced). Do NOT show a success toast.
    stravaLog("info", "strava upload duplicate (409) — unresolved, skipping toast", {
      flow: "strava_upload",
      step: "duplicate_409_skipped",
      sessionId,
      source: "strava_activity_sync",
      phase: "post-connect",
    });
    return { status: "skipped" };
  }

  stravaLog("info", "strava upload succeeded", {
    flow: "strava_upload",
    step: "success",
    sessionId,
    activityId,
  });
  return { status: "synced", activityId };
}

export async function reconcileStravaQueue(): Promise<void> {
  if (Platform.OS === "web") return;

  const connection = await getStravaConnection();
  if (!connection) return;

  const pendingOrFailed = await getPendingOrFailedSyncs();

  for (const entry of pendingOrFailed) {
    if (entry.retry_count >= MAX_RETRIES) {
      await markSyncPermanentlyFailed(entry.session_id);
      continue;
    }

    try {
      const activityId = await uploadActivity(entry.session_id);
      if (activityId === null) {
        // Unresolved 409 duplicate — activity exists on Strava but lookup failed.
        // Mark as a terminal skipped-duplicate state so this entry is never retried.
        await markSyncSkippedDuplicate(entry.session_id);
      } else {
        await markSyncSuccess(entry.session_id, activityId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markSyncFailed(entry.session_id, message);

      const isPermanent = isPermanentError(err);

      // BLD-3063: structured Sentry log for queue-reconcile failures post-connect
      stravaLog("warn", "strava queue reconciliation failed for entry", {
        source: "strava_activity_sync",
        phase: "reconcile",
        sessionId: entry.session_id,
        status: entry.status,
        retryCount: entry.retry_count,
        retryInfo: isPermanent ? "permanent" : "will_retry",
      });

      if (isPermanent) {
        await markSyncPermanentlyFailed(entry.session_id);
        continue;
      }

      // Check if we've now hit max retries
      if (entry.retry_count + 1 >= MAX_RETRIES) {
        await markSyncPermanentlyFailed(entry.session_id);
      }
    }
  }
}
