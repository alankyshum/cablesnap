import { Linking, Platform } from "react-native";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import * as Sentry from "@sentry/react-native";
import {
  getStravaConnection,
  saveStravaConnection,
  deleteStravaConnection,
  createSyncLogEntry,
  markSyncSuccess,
  markSyncFailed,
  markSyncPermanentlyFailed,
  getPendingOrFailedSyncs,
  getSessionById,
  getSessionSets,
  getBodySettings,
} from "./db";

// ---- Error classification ----

export type StravaErrorCode =
  | "auth_expired"
  | "auth_revoked"
  | "network"
  | "rate_limit"
  | "server"
  | "config"
  | "unknown";

export class StravaError extends Error {
  public readonly code: StravaErrorCode;
  public readonly status?: number;
  constructor(code: StravaErrorCode, message: string, status?: number) {
    super(message);
    this.name = "StravaError";
    this.code = code;
    this.status = status;
  }
}

function classifyHttpStatus(status: number): StravaErrorCode {
  if (status === 401 || status === 403) return "auth_expired";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  return "unknown";
}

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // React Native fetch surfaces TypeError with "Network request failed"
  // Node/browsers use TypeError with "Failed to fetch".
  const msg = err.message || "";
  return (
    err.name === "TypeError" ||
    /network request failed|failed to fetch|networkerror|timeout|timed out/i.test(msg)
  );
}

/**
 * Maps any thrown value from Strava flows into a user-friendly message.
 * Leaves technical details (status, raw message) for logs only.
 */
export function getStravaUserMessage(err: unknown): string {
  if (err instanceof StravaError) {
    switch (err.code) {
      case "auth_expired":
      case "auth_revoked":
        return "Connection expired. Please try again.";
      case "network":
        return "Check your internet and try again.";
      case "rate_limit":
        return "Too many requests. Please wait a moment and try again.";
      case "server":
        return "Strava is having trouble right now. Please try again soon.";
      case "config":
        return "Strava isn't set up correctly. Please contact support.";
      case "unknown":
      default:
        return "Something went wrong connecting to Strava. Please try again.";
    }
  }
  if (isNetworkError(err)) {
    return "Check your internet and try again.";
  }
  return "Something went wrong connecting to Strava. Please try again.";
}

// Public URL users can open when Strava errors are unactionable in-app
// (e.g. misconfigured build). Points to the project issue tracker so users
// can file a bug or read known issues.
export const STRAVA_SUPPORT_URL =
  "https://github.com/alankyshum/cablesnap/issues";

export interface StravaSupportAction {
  label: string;
  onPress: () => void;
}

/**
 * Returns an optional support CTA to pair with a Strava error toast.
 * Errors the user cannot self-resolve surface a "Get help" link that opens
 * {@link STRAVA_SUPPORT_URL}:
 * - `config`: misconfigured build (client_id / proxy URL missing)
 * - `unknown`: we have no actionable hint — give the user a way to report it
 *
 * For self-recoverable errors (network, rate_limit, server, auth_*) we omit
 * the CTA — retrying resolves them.
 *
 * TODO(BLD-513): generalize if a second integration needs this — extract
 * a `makeSupportAction(url, label)` factory into `lib/support.ts` and
 * keep this function as the Strava-specific caller.
 */
export function getStravaSupportAction(
  err: unknown,
): StravaSupportAction | undefined {
  const isConfig = err instanceof StravaError && err.code === "config";
  const isUnknown = err instanceof StravaError && err.code === "unknown";
  if (isConfig || isUnknown) {
    return {
      label: "Get help",
      onPress: () => {
        void Linking.openURL(STRAVA_SUPPORT_URL).catch((linkErr) => {
          // Do not cascade a second error toast, but log so repeated
          // URL-launch failures are diagnosable in production (e.g. when
          // no browser is registered to handle https:// on the device).
          console.warn("Strava support URL launch failed:", linkErr);
        });
      },
    };
  }
  return undefined;
}

// Strava API constants
const STRAVA_AUTH_URL = "https://www.strava.com/oauth/mobile/authorize";
const STRAVA_API_BASE = "https://www.strava.com/api/v3";

// SecureStore keys
const KEY_ACCESS_TOKEN = "strava_access_token";
const KEY_REFRESH_TOKEN = "strava_refresh_token";
const KEY_TOKEN_EXPIRES_AT = "strava_token_expires_at";

const MAX_RETRIES = 3;

function getClientId(): string {
  return Constants.expoConfig?.extra?.stravaClientId ?? "";
}

function getProxyUrl(): string {
  const url = Constants.expoConfig?.extra?.stravaProxyUrl;
  if (!url) throw new Error("Strava proxy URL not configured");
  return url as string;
}

const redirectUri = AuthSession.makeRedirectUri({
  scheme: "cablesnap",
  path: "strava-callback",
});

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

async function saveTokens(
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
    console.error("Strava token refresh failed:", err);
    captureStravaError(err, "strava_refresh", "token_refresh", { proxyUrl });
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

// ---- Sentry helpers ----

function captureStravaError(
  err: unknown,
  flow: string,
  step: string,
  extra?: Record<string, unknown>,
): void {
  Sentry.captureException(err, { tags: { flow, step }, extra });
}

function stravaBreakcrumb(message: string, data?: Record<string, unknown>): void {
  Sentry.addBreadcrumb({ category: "strava", message, data });
}

/**
 * Emit a structured Sentry log for a Strava lifecycle checkpoint.
 *
 * Unlike `stravaBreakcrumb` (which only attaches to exception events),
 * these calls go to the Sentry logs (`ourlogs`) dataset so we have
 * verifiable happy-path signal. Init config sets `enableLogs: true`
 * (see `app/_layout.tsx`).
 *
 * Never pass secrets (tokens, client_secret, raw auth codes, Authorization
 * headers). Scalars only (IDs, status codes, resultType).
 *
 * Uses optional chaining so older @sentry/react-native SDKs that do not
 * export `logger` do not throw at runtime.
 */
function stravaLog(
  level: "info" | "warn" | "error",
  message: string,
  attrs?: Record<string, unknown>,
): void {
  try {
    const logger = (Sentry as unknown as {
      logger?: {
        info?: (msg: string, attrs?: Record<string, unknown>) => void;
        warn?: (msg: string, attrs?: Record<string, unknown>) => void;
        error?: (msg: string, attrs?: Record<string, unknown>) => void;
      };
    }).logger;
    logger?.[level]?.(message, attrs);
  } catch {
    // Logging must never break the app flow.
  }
}

// ---- Token Exchange ----

async function exchangeCodeForTokens(
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
    captureStravaError(err, "strava_connect", "token_exchange", { redirectUri, proxyUrl, clientId });
    if (isNetworkError(err)) {
      throw new StravaError("network", err instanceof Error ? err.message : "Network request failed");
    }
    throw new StravaError("unknown", err instanceof Error ? err.message : String(err));
  }

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text().catch(() => "");
    const err = new StravaError(
      classifyHttpStatus(tokenResponse.status),
      `Token exchange failed: ${tokenResponse.status}`,
      tokenResponse.status,
    );
    captureStravaError(err, "strava_connect", "token_exchange", { redirectUri, proxyUrl, clientId, status: tokenResponse.status, responseBody: body });
    throw err;
  }

  const tokens = (await tokenResponse.json()) as Record<string, unknown>;
  stravaLog("info", "strava token exchange succeeded", { flow: "strava_connect", step: "token_exchange_ok" });
  return tokens;
}

// ---- OAuth2 Authorization Code Flow ----
// Note: Strava does not support PKCE. Tokens are exchanged via the
// Cloudflare Worker proxy which holds the client_secret server-side.

export async function connectStrava(): Promise<{
  athleteId: number;
  athleteName: string;
} | null> {
  if (Platform.OS === "web") return null;

  const clientId = getClientId();
  if (!clientId) {
    const err = new StravaError("config", "Strava client ID not configured");
    captureStravaError(err, "strava_connect", "config_check");
    throw err;
  }

  let proxyUrl: string;
  try {
    proxyUrl = getProxyUrl();
  } catch (err) {
    const wrapped = new StravaError(
      "config",
      err instanceof Error ? err.message : "Strava proxy URL not configured"
    );
    captureStravaError(wrapped, "strava_connect", "config_check");
    throw wrapped;
  }

  stravaBreakcrumb("connectStrava started", { clientId, redirectUri, proxyUrl });
  stravaLog("info", "strava connect started", { flow: "strava_connect", step: "start" });

  const authRequest = new AuthSession.AuthRequest({
    clientId,
    scopes: ["activity:write"],
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
  });

  const result = await authRequest.promptAsync({
    authorizationEndpoint: STRAVA_AUTH_URL,
  });

  const hasCode = !!(result.type === "success" && result.params?.code);
  stravaBreakcrumb("auth prompt completed", { resultType: result.type, hasCode });
  stravaLog("info", "strava auth prompt completed", {
    flow: "strava_connect",
    step: "auth_prompt",
    resultType: result.type,
    hasCode,
  });

  if (result.type !== "success" || !result.params.code) {
    // "error" surfaces issues like Android deep-link routing failures or
    // a malformed authorization response. Without this branch, the caller
    // silently received null and no toast was shown — the user saw nothing
    // or only the spinner stop. (BLD-547 / GH #333)
    if (result.type === "error") {
      const promptErr = (result as { error?: Error | null }).error;
      const message = promptErr?.message || "Strava authorization failed";
      const wrapped = new StravaError("unknown", message);
      stravaLog("warn", "strava auth prompt errored", {
        flow: "strava_connect",
        step: "auth_prompt_error",
        resultType: result.type,
        errorMessage: message,
      });
      captureStravaError(wrapped, "strava_connect", "auth_prompt_error", { resultType: result.type });
      throw wrapped;
    }
    stravaLog("info", "strava connect user cancelled", {
      flow: "strava_connect",
      step: "user_cancelled",
      resultType: result.type,
    });
    return null;
  }

  // Exchange authorization code for tokens via proxy
  const data = await exchangeCodeForTokens(result.params.code, proxyUrl, clientId);

  await saveTokens(
    data.access_token as string,
    data.refresh_token as string,
    data.expires_at as number,
  );

  const athleteId = (data.athlete as Record<string, unknown>)?.id as number ?? 0;
  const athleteName =
    [(data.athlete as Record<string, unknown>)?.firstname, (data.athlete as Record<string, unknown>)?.lastname].filter(Boolean).join(" ") || "Strava Athlete";

  await saveStravaConnection(athleteId, athleteName);

  stravaBreakcrumb("connectStrava succeeded", { athleteId });
  stravaLog("info", "strava connect succeeded", {
    flow: "strava_connect",
    step: "success",
    athleteId,
  });

  return { athleteId, athleteName };
}

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
  weightUnit: "kg" | "lb"
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

  return lines.join("\n");
}

async function uploadActivity(
  sessionId: string
): Promise<string> {
  const token = await getValidAccessToken();
  if (!token) {
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

  const description = buildActivityDescription(sets, weightUnit);
  // BLD-630: anchor Strava activity start to first-completed-set.
  const startDate = new Date(session.clock_started_at ?? session.started_at).toISOString();
  const elapsedTime = session.duration_seconds ?? 0;

  const response = await fetch(`${STRAVA_API_BASE}/activities`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: session.name || "Strength Training",
      type: "WeightTraining",
      sport_type: "WeightTraining",
      start_date_local: startDate,
      elapsed_time: elapsedTime,
      description,
      external_id: `cablesnap-${sessionId}`,
    }),
  });

  if (response.status === 401) {
    captureStravaError(new Error("Strava access revoked"), "strava_upload", "api_call", { sessionId });
    await disconnect();
    throw new Error("Strava access revoked. Please reconnect.");
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const err = new Error(`Strava API error ${response.status}: ${body}`);
    captureStravaError(err, "strava_upload", "api_call", { sessionId, status: response.status, responseBody: body });
    throw err;
  }

  const activity = await response.json();
  return String(activity.id);
}

// ---- Sync Orchestration ----

export async function syncSessionToStrava(sessionId: string): Promise<boolean> {
  stravaLog("info", "strava upload started", { flow: "strava_upload", step: "start", sessionId });
  const connected = await isStravaConnected();
  if (!connected) return false;

  // Check for completed sets first
  const sets = await getSessionSets(sessionId);
  const completed = sets.filter((s) => s.completed);
  if (completed.length === 0) return false;

  await createSyncLogEntry(sessionId);

  try {
    const activityId = await uploadActivity(sessionId);
    await markSyncSuccess(sessionId, activityId);
    stravaLog("info", "strava upload succeeded", {
      flow: "strava_upload",
      step: "success",
      sessionId,
      activityId,
    });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markSyncFailed(sessionId, message);
    throw err;
  }
}

export async function reconcileStravaQueue(): Promise<void> {
  if (Platform.OS === "web") return;

  const connected = await isStravaConnected();
  if (!connected) return;

  const pendingOrFailed = await getPendingOrFailedSyncs();

  for (const entry of pendingOrFailed) {
    if (entry.retry_count >= MAX_RETRIES) {
      await markSyncPermanentlyFailed(entry.session_id);
      continue;
    }

    try {
      const activityId = await uploadActivity(entry.session_id);
      await markSyncSuccess(entry.session_id, activityId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markSyncFailed(entry.session_id, message);

      // Check if we've now hit max retries
      if (entry.retry_count + 1 >= MAX_RETRIES) {
        await markSyncPermanentlyFailed(entry.session_id);
      }
    }
  }
}
