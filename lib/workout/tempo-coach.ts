/**
 * BLD-1158: Tempo Coach — parser/validator (PR1).
 *
 * HAPTIC GUARDRAIL: This module (PR1) contains ONLY the parser surface.
 * The coach engine (startCoach, expo-haptics, expo-keep-awake, AppState) lives
 * in PR2 (BLD-1158b). Any PR adding the following to this file requires a fresh
 * psychologist review (classification flip to YES):
 *   - streak / adherence / badge tracking
 *   - out-of-set notifications
 *   - Notifications.scheduleNotificationAsync
 *   - Persuasive copy on discouragement moments (tempo trends, plateau hints)
 */

export type ParsedTempo = {
  e: number; // eccentric (lowering) phase, seconds
  b: number; // bottom pause, seconds
  c: number; // concentric (lifting) phase, seconds
  t: number; // top pause, seconds
};

/**
 * Parse and validate a tempo string into its four phase components.
 *
 * Accepted formats:
 *   - Canonical:  "E-B-C-T" (e.g. "3-1-2-0", "0-60-0-0")
 *   - Compact:    "EBCT" (4 single digits, e.g. "3010" → "3-0-1-0")
 *
 * Rules (v1 locked grammar):
 *   - All phases must be integers in [0, 60].
 *   - All-zero ("0-0-0-0") is rejected — meaningless.
 *   - "X" and any non-integer characters are rejected.
 *   - Free-text is rejected.
 *
 * Returns ParsedTempo on success, null on any validation failure.
 */
export function parseTempo(input: string): ParsedTempo | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  let parts: string[];

  if (/^\d{4}$/.test(trimmed)) {
    // Compact form: "3010" → ["3","0","1","0"]
    parts = trimmed.split("");
  } else if (/^[\d]+-[\d]+-[\d]+-[\d]+$/.test(trimmed)) {
    // Canonical form: "3-1-2-0"
    parts = trimmed.split("-");
  } else {
    return null;
  }

  if (parts.length !== 4) return null;

  const values = parts.map((p) => {
    const n = Number(p);
    return Number.isInteger(n) ? n : NaN;
  });

  if (values.some((v) => isNaN(v) || v < 0 || v > 60)) return null;

  const [e, b, c, t] = values as [number, number, number, number];

  // All-zero is meaningless — reject.
  if (e === 0 && b === 0 && c === 0 && t === 0) return null;

  return { e, b, c, t };
}

/**
 * Canonicalize a parsed tempo back to "E-B-C-T" string form.
 */
export function formatTempo(parsed: ParsedTempo): string {
  return `${parsed.e}-${parsed.b}-${parsed.c}-${parsed.t}`;
}

/**
 * Validate and canonicalize a user-entered tempo string.
 * Returns the canonical "E-B-C-T" string on success, null on failure.
 * Compact form "3010" is accepted and returned as "3-0-1-0".
 */
export function canonicalizeTempo(input: string): string | null {
  const parsed = parseTempo(input);
  if (!parsed) return null;
  return formatTempo(parsed);
}

/**
 * Human-readable accessibility label for a parsed tempo.
 * Used by SetTempoChip accessibilityLabel.
 */
export function tempoAccessibilityLabel(parsed: ParsedTempo): string {
  const phase = (seconds: number, name: string) =>
    `${seconds} second${seconds !== 1 ? "s" : ""} ${name}`;
  return [
    phase(parsed.e, "eccentric"),
    phase(parsed.b, "pause"),
    phase(parsed.c, "concentric"),
    phase(parsed.t, "pause"),
  ].join(", ");
}
