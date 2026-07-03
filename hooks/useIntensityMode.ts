/**
 * hooks/useIntensityMode.ts — BLD-2701: Intensity Metric Choice (RPE | RIR)
 *
 * Single source of truth for the `session.intensityMode` preference.
 * Backed by react-query so a mode change (via setAppSetting) can invalidate
 * this query and all surfaces re-render consistently without prop-drilling.
 *
 * Usage:
 *   const intensityMode = useIntensityMode();  // "rpe" | "rir"
 *
 * Invalidation:
 *   After calling setAppSetting("session.intensityMode", ...) call:
 *   queryClient.invalidateQueries({ queryKey: ["intensityMode"] })
 *   — or import and call invalidateIntensityMode(queryClient).
 */
import { useQuery, QueryClient } from "@tanstack/react-query";
import { getAppSetting } from "@/lib/db";
import type { IntensityMode } from "@/lib/intensity";

const QUERY_KEY = ["intensityMode"] as const;

/**
 * Fetch the raw stored setting and normalise it to IntensityMode.
 * Null / unknown values default to "rpe" (backward-compatible).
 */
async function fetchIntensityMode(): Promise<IntensityMode> {
  const raw = await getAppSetting("session.intensityMode");
  return raw === "rir" ? "rir" : "rpe";
}

/**
 * React-query hook that returns the active intensity mode.
 * Returns "rpe" immediately (while loading) to avoid a flash.
 */
export function useIntensityMode(): IntensityMode {
  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchIntensityMode,
    // Keep mode cached for 5 minutes — only invalidated on explicit writes.
    staleTime: 1000 * 60 * 5,
  });
  return data ?? "rpe";
}

/**
 * Invalidate the intensity mode cache after updating the setting.
 * Call this in the same tick as setAppSetting so consumers re-render.
 */
export function invalidateIntensityMode(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: QUERY_KEY });
}
