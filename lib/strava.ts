/* eslint-disable max-lines, complexity */
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
import { GITHUB_REPO_URL } from "@/constants/github";
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
      const body = await response.text().catch(() => "");
      const truncatedBody = body.substring(0, 500);

      if (isStravaAppInactive(body)) {
        stravaLog("warn", "strava refresh blocked — app inactive", {
          flow: "strava_refresh",
          step: "token_refresh",
          status: response.status,
          body: truncatedBody,
        });
        await disconnect();
        throw new StravaError("app_inactive", "Strava app is inactive. Please contact support.", response.status);
      } else if (response.status === 400 || response.status === 401) {
        stravaLog("warn", "strava refresh failed — token revoked or invalid (invalid_grant)", {
          flow: "strava_refresh",
          step: "token_refresh",
          status: response.status,
          body: truncatedBody,
        });
        await disconnect();
        throw new StravaError("auth_revoked", "Strava session expired. Please reconnect.", response.status);
      } else {
        const classifiedCode = classifyHttpStatus(response.status);
        stravaLog("warn", `strava refresh failed — unexpected HTTP status (${response.status})`, {
          flow: "strava_refresh",
          step: "token_refresh",
          status: response.status,
          body: truncatedBody,
        });
        throw new StravaError(
          classifiedCode,
          `Token refresh failed: ${response.status}. Body: ${truncatedBody}`,
          response.status
        );
      }
    }

    const data = await response.json();
    await saveTokens(data.access_token, data.refresh_token, data.expires_at);
    stravaLog("info", "strava refresh succeeded", { flow: "strava_refresh", step: "success" });
    return data.access_token;
  } catch (err) {
    if (err instanceof StravaError && (err.code === "auth_revoked" || err.code === "app_inactive")) {
      // BLD-3178: Propagate terminal authentication and app-inactive errors instead of swallowing
      // to null so the upstream caller (uploadActivity / syncSessionToStrava) receives a clear signal
      // to permanently fail the sync session instead of infinite queuing. Do not capture to Sentry.
      throw err;
    }

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

export { completeStravaCallback, connectStrava, resetOAuthConnectionSucceeded } from "./strava-callback";

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

export const DEFAULT_STRAVA_ATTRIBUTION = `Powered by CableSnap — plan & track your workouts\n${GITHUB_REPO_URL}`;

function formatSetDesc(s: { weight: number | null; reps: number | null }, weightUnit: string): string {
  if (s.weight && s.reps) return `${s.weight}${weightUnit} × ${s.reps}`;
  if (s.reps) return `${s.reps} reps`;
  if (s.weight) return `${s.weight}${weightUnit}`;
  return "1 set";
}

function formatSetLine(s: { weight: number | null; reps: number | null }, weightUnit: string): string {
  if (s.weight != null && s.weight > 0 && s.reps != null && s.reps > 0) {
    return `  ${s.weight}${weightUnit} × ${s.reps}`;
  }
  if (s.reps != null && s.reps > 0) {
    return `  ${s.reps} reps`;
  }
  if (s.weight != null && s.weight > 0) {
    return `  ${s.weight}${weightUnit}`;
  }
  return `  1 set`;
}

function collapseSetsForStrava<T extends {
  exercise_name?: string | null;
  weight: number | null;
  reps: number | null;
  completed: boolean;
  set_type: string;
  set_number?: number | null;
  side?: string | null;
}>(sets: T[]): T[] {
  const result: T[] = [];
  const unilateralGroups = new Map<string, T[]>();
  const bilateralSets: T[] = [];

  for (const s of sets) {
    if (s.side === "left" || s.side === "right") {
      const key = `${s.exercise_name ?? "Unknown Exercise"}_${s.set_number ?? 0}`;
      if (!unilateralGroups.has(key)) {
        unilateralGroups.set(key, []);
      }
      unilateralGroups.get(key)!.push(s);
    } else {
      bilateralSets.push(s);
    }
  }

  for (const group of unilateralGroups.values()) {
    if (group.length === 1) {
      result.push({
        ...group[0],
        volume: (group[0].weight ?? 0) * (group[0].reps ?? 0),
      });
    } else {
      const left = group.find(s => s.side === "left");
      const right = group.find(s => s.side === "right");
      
      const leftWeight = left?.weight ?? 0;
      const leftReps = left?.reps ?? 0;
      const rightWeight = right?.weight ?? 0;
      const rightReps = right?.reps ?? 0;

      const collapsedWeight = Math.max(leftWeight, rightWeight);
      const collapsedReps = Math.max(leftReps, rightReps);
      const collapsedVolume = (leftWeight * leftReps) + (rightWeight * rightReps);
      
      const base = left ?? right ?? group[0];
      const collapsedSet = {
        ...base,
        weight: collapsedWeight > 0 ? collapsedWeight : null,
        reps: collapsedReps > 0 ? collapsedReps : null,
        completed: group.some(s => s.completed),
        volume: collapsedVolume,
      };
      result.push(collapsedSet);
    }
  }

  return [...bilateralSets, ...result];
}

function buildSimpleDescription(
  sets: Array<{
    exercise_name?: string | null;
    weight: number | null;
    reps: number | null;
    completed: boolean;
    set_type: string;
    set_number?: number | null;
    side?: string | null;
  }>,
  weightUnit: "kg" | "lb"
): string {
  const completedSets = collapseSetsForStrava(sets.filter((s) => s.completed));
  if (completedSets.length === 0) return "";

  const byExercise = new Map<string, Array<{ weight: number | null; reps: number | null; volume?: number }>>();
  for (const s of completedSets) {
    const name = s.exercise_name ?? "Unknown Exercise";
    if (!byExercise.has(name)) byExercise.set(name, []);
    byExercise.get(name)!.push({ weight: s.weight, reps: s.reps, volume: (s as unknown as { volume?: number }).volume });
  }

  const lines: string[] = [];
  for (const [name, exerciseSets] of byExercise) {
    const setDescs = exerciseSets.map((s) => formatSetDesc(s, weightUnit));
    lines.push(`${name}: ${setDescs.join(", ")}`);
  }

  return lines.join("\n");
}

export function buildActivityDescription(
  sets: Array<{
    exercise_name?: string | null;
    weight: number | null;
    reps: number | null;
    completed: boolean;
    set_type: string;
    set_number?: number | null;
    side?: string | null;
  }>,
  weightUnit: "kg" | "lb",
  promoCaption?: string
): string {
  const completedSets = collapseSetsForStrava(sets.filter((s) => s.completed));
  if (completedSets.length === 0) return "";

  // If promoCaption is undefined (description disabled), skip ASCII recap and return simple text
  if (promoCaption === undefined) {
    return buildSimpleDescription(sets, weightUnit);
  }

  // Group sets by exercise
  const byExercise = new Map<string, Array<{ weight: number | null; reps: number | null; volume?: number }>>();
  for (const s of completedSets) {
    const name = s.exercise_name ?? "Unknown Exercise";
    if (!byExercise.has(name)) byExercise.set(name, []);
    byExercise.get(name)!.push({ weight: s.weight, reps: s.reps, volume: (s as unknown as { volume?: number }).volume });
  }

  // Calculate volumes and reps per exercise
  const exerciseData = Array.from(byExercise.entries()).map(([name, exerciseSets]) => {
    const isWeightBased = exerciseSets.some((s) => s.weight != null && s.weight > 0);
    const volume = exerciseSets.reduce((sum, s) => sum + ((s as unknown as { volume?: number }).volume ?? ((s.weight ?? 0) * (s.reps ?? 0))), 0);
    const reps = exerciseSets.reduce((sum, s) => sum + (s.reps ?? 0), 0);
    return { name, exerciseSets, isWeightBased, volume, reps };
  });

  // Find max volume and max reps for scaling
  const maxVolume = Math.max(...exerciseData.filter((e) => e.isWeightBased).map((e) => e.volume), 0);
  const maxReps = Math.max(...exerciseData.filter((e) => !e.isWeightBased).map((e) => e.reps), 0);

  const lines: string[] = [
    "CABLESNAP WORKOUT RECAP",
    "=======================",
  ];

  for (let i = 0; i < exerciseData.length; i++) {
    const data = exerciseData[i];
    if (i > 0) lines.push("");
    lines.push(data.name);
    for (const s of data.exerciseSets) {
      lines.push(formatSetLine(s, weightUnit));
    }
    
    // Draw bar line
    if (data.isWeightBased) {
      const barWidth = maxVolume > 0 ? Math.max(1, Math.round((data.volume / maxVolume) * 12)) : 0;
      const bar = "█".repeat(barWidth);
      lines.push(`  ${bar}  ${data.volume} ${weightUnit}`);
    } else {
      const barWidth = maxReps > 0 ? Math.max(1, Math.round((data.reps / maxReps) * 12)) : 0;
      const bar = "█".repeat(barWidth);
      lines.push(`  ${bar}  ${data.reps} reps`);
    }
  }

  lines.push("-----------------------");

  const totalVolume = completedSets.reduce((sum, s) => sum + ((s as unknown as { volume?: number }).volume ?? ((s.weight ?? 0) * (s.reps ?? 0))), 0);
  if (totalVolume > 0) {
    lines.push(`Total: ${totalVolume} ${weightUnit}  ·  ${completedSets.length} sets  ·  ${byExercise.size} exercises`);
  } else {
    lines.push(`Total: ${completedSets.length} sets  ·  ${byExercise.size} exercises`);
  }

  lines.push("");
  lines.push(DEFAULT_STRAVA_ATTRIBUTION);

  if (promoCaption && promoCaption.trim().length > 0 && promoCaption.trim() !== DEFAULT_STRAVA_ATTRIBUTION) {
    lines.push(promoCaption.trim());
  }

  return lines.join("\n");
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

  let session;
  let sets;
  try {
    session = await getSessionById(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    sets = await getSessionSets(sessionId);
  } catch (err) {
    throw new StravaError("local_read", err instanceof Error ? err.message : String(err));
  }

  const completedSets = sets.filter((s) => s.completed);
  if (completedSets.length === 0) {
    throw new Error("No completed sets to sync");
  }

  let bodySettings;
  let uploadSettings;
  try {
    bodySettings = await getBodySettings();
    uploadSettings = await getShareSettingsForUpload();
  } catch (err) {
    throw new StravaError("local_read", err instanceof Error ? err.message : String(err));
  }

  const weightUnit = bodySettings.weight_unit as "kg" | "lb";
  const { promoCaption, stravaDescriptionEnabled } = uploadSettings;
  const description = buildActivityDescription(
    sets,
    weightUnit,
    stravaDescriptionEnabled ? promoCaption : undefined
  );

  // BLD-630: anchor Strava activity start to first-completed-set.
  const startDate = new Date(session.clock_started_at ?? session.started_at).toISOString();
  const elapsedTime = session.duration_seconds ?? 0;

  const fields: Record<string, string> = {
    name: session.name || "Strength Training",
    type: "WeightTraining",
    sport_type: "WeightTraining",
    start_date_local: startDate,
    elapsed_time: String(elapsedTime),
    external_id: `cablesnap-${sessionId}`,
  };
  if (description && description.trim().length > 0) {
    fields.description = description;
  }

  const body = Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const response = await fetch(`${STRAVA_API_BASE}/activities`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
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

  const raw = await response.text();
  let activityId: string | null = null;
  if (raw && raw.trim().length > 0) {
    try {
      const activity = JSON.parse(raw);
      if (activity && activity.id != null) activityId = String(activity.id);
    } catch { /* fall through to resolve */ }
  }
  if (!activityId) {
    activityId = await resolveExistingActivityId(accessToken, sessionId).catch(() => null);
  }

  // BLD-3064: Always call updateActivityDescription after upload/resolve to guarantee the recap/attribution lands.
  if (activityId && description && description.trim().length > 0) {
    try {
      await updateActivityDescription(activityId, description);
    } catch (putErr) {
      stravaLog("warn", "strava description PUT post-upload failed — non-blocking", {
        flow: "strava_upload",
        step: "post_upload_description_failed",
        sessionId,
        activityId,
        error: putErr instanceof Error ? putErr.message : String(putErr),
      });
    }
  }

  return activityId; // may be null = synced without id; caller must treat as success, never throw
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
 * It is called:
 * (a) post-upload/resolve to guarantee the description lands,
 * (b) on 409 resolution, and
 * (c) on explicit post-sync caption edits.
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
    const session = await getSessionById(sessionId);
    if (!session) {
      return null;
    }
    const elapsedTime = session.duration_seconds ?? 0;
    const activityName = session.name || "Strength Training";

    const url = `${STRAVA_API_BASE}/athlete/activities?per_page=30`;
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
    const activities: Array<{
      id: number | string;
      name?: string;
      start_date_local?: string;
      start_date?: string;
      elapsed_time?: number;
      type?: string;
      sport_type?: string;
    }> = await res.json();
    if (!Array.isArray(activities) || activities.length === 0) {
      stravaLog("warn", "strava 409 duplicate — lookup returned no matching activity, treating as synced-skipped", {
        flow: "strava_upload",
        step: "duplicate_409_lookup_empty",
        sessionId,
      });
      return null;
    }

    // Match by same name, and type/sport_type is WeightTraining if available
    const matches = activities.filter((activity) => {
      if (!activity) return false;
      const nameMatch = activity.name === activityName;
      const type = activity.type || activity.sport_type;
      const typeMatch = !type || type === "WeightTraining";
      return nameMatch && typeMatch;
    });

    if (matches.length > 0) {
      // Pick the most recently created one (max start_date)
      // Tie-breaker: prefer one whose elapsed_time is within ~120s of ours
      matches.sort((a, b) => {
        const epochA = a.start_date
          ? Date.parse(a.start_date)
          : a.start_date_local
          ? Date.parse(a.start_date_local)
          : 0;
        const epochB = b.start_date
          ? Date.parse(b.start_date)
          : b.start_date_local
          ? Date.parse(b.start_date_local)
          : 0;

        if (epochA !== epochB) {
          return epochB - epochA;
        }

        const closeA = Math.abs((a.elapsed_time ?? 0) - elapsedTime) <= 120;
        const closeB = Math.abs((b.elapsed_time ?? 0) - elapsedTime) <= 120;

        if (closeA !== closeB) {
          return closeA ? -1 : 1;
        }

        return 0;
      });
      return String(matches[0].id);
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

export type StravaSyncSource = "post_workout" | "manual_detail";

/** Returns true if the upload error represents a permanent config or auth failure. */
function isPermanentError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message.includes("Strava access revoked")) return true;
  if (err instanceof StravaError) {
    return (
      err.code === "app_inactive" ||
      err.code === "config" ||
      err.code === "auth_revoked" ||
      err.code === "local_read"
    );
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

export async function syncSessionToStrava(
  sessionId: string,
  source: StravaSyncSource = "post_workout"
): Promise<SyncResult> {
  stravaLog("info", "strava upload started", { flow: "strava_upload", step: "start", sessionId, source });

  let stravaConnected = false;
  let completedSetCount = 0;

  const logOutcome = (result: SyncResult) => {
    let activityId: string | null = null;
    let errorCode: string | null = null;
    let errorClass: string | null = null;
    let httpStatus: number | null = null;
    let retryInfo: string | null = null;
    let errorMessage: string | null = null;

    if (result.status === "synced") {
      activityId = result.activityId;
    } else if (result.status === "failed" || result.status === "queued") {
      const err = result.error;
      if (err) {
        errorClass = err.constructor?.name || (err instanceof StravaError ? "StravaError" : "Error");
        errorMessage = err.message ? String(err.message).slice(0, 300) : null;
        if (err instanceof StravaError) {
          errorCode = err.code || null;
          httpStatus = err.status ?? null;
        } else {
          errorCode = null;
          httpStatus = null;
        }
        const permanent = isPermanentError(err);
        retryInfo = permanent ? "permanent" : "will_retry";
      }
    }

    let level: "info" | "warn" | "error" = "info";
    if (result.status === "queued") {
      level = "warn";
    } else if (result.status === "failed") {
      level = "error";
    }

    stravaLog(level, "strava sync outcome", {
      source,
      sessionId,
      connected: stravaConnected,
      completedSetCount,
      status: result.status,
      activityId,
      errorCode,
      errorClass,
      errorMessage,
      httpStatus,
      retryInfo,
    });
  };

  if (Platform.OS === "web") {
    const res: SyncResult = { status: "skipped" };
    logOutcome(res);
    return res;
  }

  let connection;
  try {
    connection = await getStravaConnection();
    stravaConnected = !!connection;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const res: SyncResult = { status: "failed", error };
    logOutcome(res);
    return res;
  }

  if (!connection) {
    const res: SyncResult = { status: "skipped" };
    logOutcome(res);
    return res;
  }

  let sets = [];
  try {
    sets = await getSessionSets(sessionId);
    completedSetCount = sets.filter((s) => s.completed).length;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const res: SyncResult = { status: "failed", error };
    logOutcome(res);
    return res;
  }

  if (completedSetCount === 0) {
    const res: SyncResult = { status: "skipped" };
    logOutcome(res);
    return res;
  }

  // Check if already synced and potentially edited post-sync
  let syncLog;
  try {
    syncLog = await getSyncLogForSession(sessionId);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const res: SyncResult = { status: "failed", error };
    logOutcome(res);
    return res;
  }
  if (syncLog && syncLog.status === "synced" && syncLog.strava_activity_id) {
    let res: SyncResult;
    try {
      res = await handlePostSyncDescriptionUpdate(
        sessionId,
        syncLog as { strava_activity_id: string; synced_at: number | null },
        sets
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      res = { status: "failed", error };
    }
    logOutcome(res);
    return res;
  }

  await Promise.resolve(createSyncLogEntry(sessionId)).catch(() => {});

  const setCount = sets.length;
  const completedCount = completedSetCount;

  let activityId: string | null;
  try {
    activityId = await uploadActivity(sessionId);
  } catch (err) {
    const res = await handleUploadFailure(sessionId, err, setCount, completedCount);
    logOutcome(res);
    return res;
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
    const res: SyncResult = { status: "skipped" };
    logOutcome(res);
    return res;
  }

  stravaLog("info", "strava upload succeeded", {
    flow: "strava_upload",
    step: "success",
    sessionId,
    activityId,
  });
  const res: SyncResult = { status: "synced", activityId };
  logOutcome(res);
  return res;
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
