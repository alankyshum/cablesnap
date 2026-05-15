/**
 * Shared timer formatting utilities — extracted to break the SetRow ↔ SetTimerCell
 * module cycle (BLD-1235 nit fix).
 */

/**
 * Formats a duration in seconds as "M:SS" or "H:MM:SS".
 * Returns "0:00" for null, zero, or negative values.
 */
export function formatDurationDisplay(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "0:00";
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
