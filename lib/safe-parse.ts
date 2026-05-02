/**
 * Defensive JSON.parse wrapper that returns a fallback value on failure.
 *
 * Use this for any runtime JSON.parse of user data or stored state where a
 * corrupted/truncated payload should NOT crash the app.
 *
 * @param raw - The raw string to parse (may be null/undefined/empty/truncated)
 * @param fallback - Value to return when parsing fails
 * @param context - A short label for the console.warn log (e.g. "primary_muscles")
 * @returns The parsed value on success, or `fallback` on any failure
 */
export function safeParse<T>(raw: string | null | undefined, fallback: T, context?: string): T {
  if (raw == null || raw === "") {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    if (__DEV__) {
      const preview = raw.length > 120 ? raw.slice(0, 120) + "…" : raw;
      console.warn(
        `[safeParse] ${context ?? "unknown"}: failed to parse JSON — returning fallback. ` +
        `Raw (${raw.length} chars): ${preview}`,
        e,
      );
    }
    return fallback;
  }
}
