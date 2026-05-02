/**
 * Dual-format parser for `exercises.primary_muscles` / `secondary_muscles`.
 *
 * Two storage formats coexist in the database (BLD-925):
 *   - JSON-array string written by `lib/db/exercises.ts` for custom exercises
 *     (e.g. `["chest","triceps"]`).
 *   - Comma-separated string written by `lib/db/csv-import.ts` for the seed /
 *     imported library (e.g. `chest,triceps`).
 *
 * This helper accepts either format and returns a clean string[] of muscle
 * identifiers. JSON is attempted first (anchored on a leading `[`). On any
 * failure (malformed JSON, missing brackets, etc.) it falls back to a CSV
 * split. Empty / whitespace-only / null inputs return `[]`.
 *
 * **NOT a security boundary.** This is purely a defensive read-side parser so
 * the muscle-group filter (and similar callers) can see a unified view across
 * both formats.
 *
 * Tech-debt follow-up: BLD-925 plan §Tech Debt Follow-up — normalize
 * `csv-import.ts` to `JSON.stringify` and run a one-time migration. Once that
 * lands, callers can revert to a plain `JSON.parse`.
 */
export function parseMuscleList(raw: string | null | undefined): string[] {
  if (raw == null) return [];
  const trimmed = raw.trim();
  if (trimmed === "") return [];

  // JSON-array format. Only attempt JSON.parse when the value clearly starts
  // with `[` to avoid eagerly parsing CSV strings whose first token happens to
  // be valid JSON (e.g. `1,2,3`).
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch {
      // Malformed JSON — fall through to CSV.
    }
  }

  // CSV format (or malformed JSON fallback).
  return trimmed
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}
