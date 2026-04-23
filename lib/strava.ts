import { Linking, Platform } from "react-native";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
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
        return "Something went wrong connecting to Strava.";
    }
  }
  if (isNetworkError(err)) {
    return "Check your internet and try again.";
  }
  return "Something went wrong connecting to Strava.";
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
 * Only errors the user cannot self-resolve (currently `config`) surface
 * a "Get help" link that opens {@link STRAVA_SUPPORT_URL}. For all other
 * error codes, returns undefined so the toast shows no CTA.
 *
 * TODO(BLD-513): generalize if a second integration needs this — extract
 * a `makeSupportAction(url, label)` factory into `lib/support.ts` and
 * keep this function as the Strava-specific caller.
 */
export function getStravaSupportAction(
  err: unknown,
): StravaSupportAction | undefined {
  if (err instanceof StravaError && err.code === "config") {
    return {
      label: "Get help",
      onPress: () => {
        void Linking.openURL(STRAVA_SUPPORT_URL).catch(() => {
          // Swallow: user is already seeing an error toast, no need to cascade.
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
      if (response.status === 401 || response.status === 400) {
        // Token revoked or invalid — disconnect
        await disconnect();
        return null;
      }
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data = await response.json();
    await saveTokens(data.access_token, data.refresh_token, data.expires_at);
    return data.access_token;
  } catch (err) {
    console.error("Strava token refresh failed:", err);
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
    throw new StravaError("config", "Strava client ID not configured");
  }

  let proxyUrl: string;
  try {
    proxyUrl = getProxyUrl();
  } catch (err) {
    throw new StravaError(
      "config",
      err instanceof Error ? err.message : "Strava proxy URL not configured"
    );
  }

  const authRequest = new AuthSession.AuthRequest({
    clientId,
    scopes: ["activity:write"],
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
  });

  const result = await authRequest.promptAsync({
    authorizationEndpoint: STRAVA_AUTH_URL,
  });

  if (result.type !== "success" || !result.params.code) {
    return null;
  }

  // Exchange authorization code for tokens via proxy
  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(`${proxyUrl}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: result.params.code,
      }),
    });
  } catch (err) {
    if (isNetworkError(err)) {
      throw new StravaError(
        "network",
        err instanceof Error ? err.message : "Network request failed"
      );
    }
    throw new StravaError(
      "unknown",
      err instanceof Error ? err.message : String(err)
    );
  }

  if (!tokenResponse.ok) {
    throw new StravaError(
      classifyHttpStatus(tokenResponse.status),
      `Token exchange failed: ${tokenResponse.status}`,
      tokenResponse.status
    );
  }

  const data = await tokenResponse.json();

  await saveTokens(data.access_token, data.refresh_token, data.expires_at);

  const athleteId = data.athlete?.id ?? 0;
  const athleteName =
    [data.athlete?.firstname, data.athlete?.lastname].filter(Boolean).join(" ") || "Strava Athlete";

  await saveStravaConnection(athleteId, athleteName);

  return { athleteId, athleteName };
}

export async function disconnect(): Promise<void> {
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
}

export async function isStravaConnected(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const connection = await getStravaConnection();
  return connection !== null;
}

// ---- Activity Upload ----

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
    const setDescs = exerciseSets.map((s) => {
      if (s.weight && s.reps) return `${s.weight}${weightUnit} × ${s.reps}`;
      if (s.reps) return `${s.reps} reps`;
      if (s.weight) return `${s.weight}${weightUnit}`;
      return "1 set";
    });
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
  const startDate = new Date(session.started_at).toISOString();
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
    // Token revoked on Strava
    await disconnect();
    throw new Error("Strava access revoked. Please reconnect.");
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Strava API error ${response.status}: ${body}`);
  }

  const activity = await response.json();
  return String(activity.id);
}

// ---- Sync Orchestration ----

export async function syncSessionToStrava(sessionId: string): Promise<boolean> {
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
