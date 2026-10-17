import { Linking } from "react-native";
import { t as linguiT } from "@lingui/core/macro";

type TranslationDescriptor = { id: string; message: string };
type TranslationValues = Record<string, string | number>;

function t(descriptor: TranslationDescriptor, values?: TranslationValues): string {
  try {
    return (linguiT as unknown as (descriptor: TranslationDescriptor, values?: TranslationValues) => string)(descriptor, values);
  } catch {
    return values
      ? descriptor.message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`))
      : descriptor.message;
  }
}

// ---- Error classification ----

export type StravaErrorCode =
  | "auth_expired"
  | "auth_revoked"
  | "network"
  | "rate_limit"
  | "server"
  | "config"
  | "app_inactive"
  | "local_read"
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

export function classifyHttpStatus(status: number): StravaErrorCode {
  if (status === 401 || status === 403) return "auth_expired";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  return "unknown";
}

export function isNetworkError(err: unknown): boolean {
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
        return t({ id: "stravaError.connectionExpired", message: "Connection expired. Please try again." });
      case "network":
        return t({ id: "stravaError.network", message: "Check your internet and try again." });
      case "rate_limit":
        return t({ id: "stravaError.rateLimit", message: "Too many requests. Please wait a moment and try again." });
      case "server":
        return t({ id: "stravaError.server", message: "Strava is having trouble right now. Please try again soon." });
      case "config":
        return t({ id: "stravaError.config", message: "Strava isn't set up correctly. Please contact support." });
      case "app_inactive":
        return t({ id: "stravaError.appInactive", message: "Strava integration is temporarily unavailable. Please try again later." });
      case "local_read":
        return t({ id: "stravaError.localRead", message: "Failed to read workout data. Please try again." });
      case "unknown":
      default:
        return t({ id: "stravaError.unknown", message: "Something went wrong connecting to Strava. Please try again." });
    }
  }
  if (isNetworkError(err)) {
    return t({ id: "stravaError.network", message: "Check your internet and try again." });
  }
  return t({ id: "stravaError.unknown", message: "Something went wrong connecting to Strava. Please try again." });
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
  const isAppInactive = err instanceof StravaError && err.code === "app_inactive";
  if (isConfig || isUnknown || isAppInactive) {
    return {
      label: t({ id: "stravaError.getHelp", message: "Get help" }),
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
