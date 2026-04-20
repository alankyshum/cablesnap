import { Platform } from "react-native";
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

// Strava API constants
const STRAVA_AUTH_URL = "https://www.strava.com/oauth/mobile/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_API_BASE = "https://www.strava.com/api/v3";

// SecureStore keys
const KEY_ACCESS_TOKEN = "strava_access_token";
const KEY_REFRESH_TOKEN = "strava_refresh_token";
const KEY_TOKEN_EXPIRES_AT = "strava_token_expires_at";

const MAX_RETRIES = 3;

function getClientId(): string {
  return Constants.expoConfig?.extra?.stravaClientId ?? "";
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

  const clientId = getClientId();
  if (!clientId) return null;

  try {
    const response = await fetch(STRAVA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Refresh token revoked — disconnect
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

// ---- OAuth2 PKCE Flow ----

export async function connectStrava(): Promise<{
  athleteId: number;
  athleteName: string;
} | null> {
  if (Platform.OS === "web") return null;

  const clientId = getClientId();
  if (!clientId) {
    throw new Error("Strava client ID not configured");
  }

  const authRequest = new AuthSession.AuthRequest({
    clientId,
    scopes: ["activity:write"],
    redirectUri,
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
  });

  const result = await authRequest.promptAsync({
    authorizationEndpoint: STRAVA_AUTH_URL,
  });

  if (result.type !== "success" || !result.params.code) {
    return null;
  }

  // Exchange authorization code for tokens
  const tokenResponse = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      code: result.params.code,
      grant_type: "authorization_code",
      code_verifier: authRequest.codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed: ${tokenResponse.status}`);
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
