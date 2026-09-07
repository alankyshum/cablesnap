import { get as getStoredKey } from "./key-vault";
import { fetch as expoFetch } from "expo/fetch";

export const OPENROUTER_KEY_STATUS_URL = "https://openrouter.ai/api/v1/key";

export type KeyStatus =
  | { readonly kind: "missing_key" }
  | {
      readonly kind: "available";
      readonly limitRemaining: number | null;
      readonly usageDaily: number | null;
      readonly usageMonthly: number | null;
    };

type RawKeyStatus = {
  limit_remaining?: unknown;
  usage_daily?: unknown;
  usage_monthly?: unknown;
};

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function getKeyStatus(): Promise<KeyStatus> {
  const key = await getStoredKey();
  if (key === null) return { kind: "missing_key" };

  const response = await expoFetch(OPENROUTER_KEY_STATUS_URL, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`OpenRouter key status HTTP ${response.status}`);

  const payload: unknown = await response.json();
  const data = payload && typeof payload === "object" && "data" in payload
    ? (payload as { data?: unknown }).data
    : payload;
  const raw = data && typeof data === "object" ? data as RawKeyStatus : {};

  return {
    kind: "available",
    limitRemaining: asNumber(raw.limit_remaining),
    usageDaily: asNumber(raw.usage_daily),
    usageMonthly: asNumber(raw.usage_monthly),
  };
}
