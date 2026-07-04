import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import { uuid } from "./uuid";
import { saveStravaConnection } from "./db";
import { StravaError } from "./strava-error";
import {
  captureStravaError,
  stravaBreakcrumb,
  stravaLog,
} from "./strava-telemetry";
import {
  getClientId,
  getProxyUrl,
  saveTokens,
  exchangeCodeForTokens,
  APP_DEEP_LINK,
  KEY_PENDING_OAUTH_STATE,
  REDIRECT_URI_FOR_STRAVA,
} from "./strava";

const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
const DEEP_LINK_GRACE_MS = 500;

function parseCallbackUrl(rawUrl: string, expectedState: string): string | null {
  if (!rawUrl.startsWith(APP_DEEP_LINK)) return null;
  let params: URLSearchParams;
  try {
    params = new URL(rawUrl).searchParams;
  } catch {
    return null;
  }
  if (params.get("state") !== expectedState) {
    const wrapped = new StravaError("unknown", "OAuth state mismatch");
    stravaLog("warn", "strava auth state mismatch", { flow: "strava_connect", step: "auth_prompt_error" });
    captureStravaError(wrapped, "strava_connect", "auth_prompt_error", { resultType: "deep_link" });
    throw wrapped;
  }
  return params.get("code");
}

async function runAuthPrompt(
  authorizeUrl: string,
  expectedState: string,
): Promise<{ result: WebBrowser.WebBrowserAuthSessionResult; code: string | undefined }> {
  let settled = false;

  let subscription: { remove(): void } | null = null;
  const deepLinkPromise = new Promise<{ result: WebBrowser.WebBrowserAuthSessionResult; code: string | undefined }>(
    (resolve, reject) => {
      subscription = Linking.addEventListener("url", ({ url }) => {
        if (settled) return;
        if (!url.startsWith(APP_DEEP_LINK)) return;
        settled = true;
        try {
          const code = parseCallbackUrl(url, expectedState) ?? undefined;
          WebBrowser.dismissAuthSession?.();
          resolve({ result: { type: "success", url } as WebBrowser.WebBrowserAuthSessionResult, code });
        } catch (err) {
          reject(err);
        }
      });
    },
  );

  const browserPromise = WebBrowser.openAuthSessionAsync(authorizeUrl, APP_DEEP_LINK)
    .then(async (result): Promise<{ result: WebBrowser.WebBrowserAuthSessionResult; code: string | undefined }> => {
      if (settled) {
        return { result: { type: "cancel" } as WebBrowser.WebBrowserAuthSessionResult, code: undefined };
      }
      if (result.type !== "success") {
        await new Promise<void>((r) => setTimeout(r, DEEP_LINK_GRACE_MS));
        if (settled) {
          return { result: { type: "cancel" } as WebBrowser.WebBrowserAuthSessionResult, code: undefined };
        }
        settled = true;
        return { result, code: undefined };
      }
      settled = true;
      const code = parseCallbackUrl(result.url, expectedState) ?? undefined;
      return { result, code };
    })
    .catch((err: unknown) => {
      if (!settled) settled = true;
      if (err instanceof StravaError) throw err;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const wrapped = new StravaError("unknown", errorMessage);
      stravaLog("warn", "strava auth prompt errored", { flow: "strava_connect", step: "auth_prompt_error", errorMessage });
      captureStravaError(wrapped, "strava_connect", "auth_prompt_error", { resultType: "error" });
      throw wrapped;
    });

  try {
    return await Promise.race([browserPromise, deepLinkPromise]);
  } finally {
    (subscription as { remove(): void } | null)?.remove();
  }
}

let stravaCallbackInFlight = false;

export async function completeStravaCallback(
  url: string,
): Promise<{ athleteId: number; athleteName: string } | null> {
  if (Platform.OS === "web") return null;
  if (!url.startsWith(APP_DEEP_LINK)) return null;

  if (stravaCallbackInFlight) return null;
  stravaCallbackInFlight = true;

  try {
    const pendingState = await SecureStore.getItemAsync(KEY_PENDING_OAUTH_STATE);
    if (!pendingState) return null;

    let code: string | null;
    try {
      code = parseCallbackUrl(url, pendingState);
    } catch (err) {
      await SecureStore.deleteItemAsync(KEY_PENDING_OAUTH_STATE);
      throw err;
    }

    if (!code) {
      await SecureStore.deleteItemAsync(KEY_PENDING_OAUTH_STATE);
      const wrapped = new StravaError("unknown", "Strava authorization failed: no code in callback URL");
      stravaLog("warn", "strava auth prompt errored", {
        flow: "strava_connect",
        step: "auth_prompt_error",
        resultType: "deep_link",
        errorMessage: wrapped.message,
      });
      captureStravaError(wrapped, "strava_connect", "auth_prompt_error", { resultType: "deep_link" });
      throw wrapped;
    }

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

    await SecureStore.deleteItemAsync(KEY_PENDING_OAUTH_STATE);

    const data = await exchangeCodeForTokens(code, proxyUrl, clientId);

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
  } finally {
    stravaCallbackInFlight = false;
  }
}

// eslint-disable-next-line complexity
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

  stravaBreakcrumb("connectStrava started", { clientId, redirectUri: REDIRECT_URI_FOR_STRAVA, proxyUrl });
  stravaLog("info", "strava connect started", { flow: "strava_connect", step: "start" });

  const oauthState = uuid();

  const initialUrl = await Linking.getInitialURL();
  if (initialUrl?.startsWith(APP_DEEP_LINK)) {
    stravaLog("info", "strava cold-start deep link detected", { flow: "strava_connect", step: "cold_start_check" });
    const completed = await completeStravaCallback(initialUrl);
    if (completed) return completed;
  }

  const authorizeUrl = new URL(STRAVA_AUTH_URL);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI_FOR_STRAVA);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("approval_prompt", "auto");
  authorizeUrl.searchParams.set("scope", "activity:write");
  authorizeUrl.searchParams.set("state", oauthState);

  await SecureStore.setItemAsync(KEY_PENDING_OAUTH_STATE, oauthState);

  const { result, code } = await runAuthPrompt(authorizeUrl.toString(), oauthState);

  const hasCode = !!(result.type === "success" && code);
  stravaBreakcrumb("auth prompt completed", { resultType: result.type, hasCode });
  stravaLog("info", "strava auth prompt completed", {
    flow: "strava_connect",
    step: "auth_prompt",
    resultType: result.type,
    hasCode,
  });

  if (result.type === "success" && result.url) {
    const completed = await completeStravaCallback(result.url);
    if (completed) return completed;
    return null;
  }

  if (result.type !== "success") {
    await SecureStore.deleteItemAsync(KEY_PENDING_OAUTH_STATE);
    stravaLog("info", "strava connect user cancelled", {
      flow: "strava_connect",
      step: "user_cancelled",
      resultType: result.type,
    });
    return null;
  }

  const pendingStateExists = await SecureStore.getItemAsync(KEY_PENDING_OAUTH_STATE);
  if (pendingStateExists && !code) {
    await SecureStore.deleteItemAsync(KEY_PENDING_OAUTH_STATE);
    const wrapped = new StravaError("unknown", "Strava authorization failed: no code in callback URL");
    stravaLog("warn", "strava auth prompt errored", {
      flow: "strava_connect",
      step: "auth_prompt_error",
      resultType: result.type,
      errorMessage: wrapped.message,
    });
    captureStravaError(wrapped, "strava_connect", "auth_prompt_error", { resultType: result.type });
    throw wrapped;
  }

  return null;
}
