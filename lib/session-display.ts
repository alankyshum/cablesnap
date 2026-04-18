/**
 * Utility functions for formatting session display values.
 */

/** Convert duration in seconds to a spoken phrase for accessibility. */
export function durationSpoken(durationSeconds: number | undefined | null): string {
  if (!durationSeconds) return "0 minutes";
  const h = Math.floor(durationSeconds / 3600);
  const m = Math.floor((durationSeconds % 3600) / 60);
  if (h > 0) return `${h} hour${h > 1 ? "s" : ""} ${m} minute${m !== 1 ? "s" : ""}`;
  return `${m} minute${m !== 1 ? "s" : ""}`;
}

/** Format a numeric change with arrow indicators. */
export function delta(cur: number, prev: number): string {
  const diff = cur - prev;
  if (diff > 0) return `↑ ${diff}`;
  if (diff < 0) return `↓ ${Math.abs(diff)}`;
  return "—";
}

/** Format a time change in minutes with arrow indicators. */
export function deltaTime(cur: number, prev: number): string {
  const diff = cur - prev;
  const m = Math.floor(Math.abs(diff) / 60);
  if (diff > 0) return `↑ ${m}m`;
  if (diff < 0) return `↓ ${m}m`;
  return "—";
}
