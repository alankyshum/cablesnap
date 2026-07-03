/**
 * lib/intensity.ts — BLD-2701: Intensity Metric Choice (RPE | RIR)
 *
 * ARCHITECTURAL INVARIANT: `workout_sets.rpe` is ALWAYS stored in RPE scale
 * (6–10). RIR is a presentation-only transform applied at the UI boundary:
 *
 *   display: rir = 10 − rpe
 *   input:   rpe = 10 − rir
 *
 * No downstream consumer (rest recompute, plateau/deload, overreaching, rm.ts,
 * useSessionData.maxRpeSafe, analytics) reads RIR. All conversion lives here.
 *
 * Centralises scale constants so RpeChipStrip and RpeSheet never duplicate them.
 */

/** The two modes supported. Default is "rpe" (backward-compatible). */
export type IntensityMode = "rpe" | "rir";

// ─── Canonical scale constants ────────────────────────────────────
/** Minimum RPE value on the capture scale (applied when clamping live input). */
export const RPE_MIN = 6;
/** Maximum RPE value. */
export const RPE_MAX = 10;
/** Step between discrete RPE options (0.5 granularity). */
export const RPE_STEP = 0.5;

// ─── Conversion functions ─────────────────────────────────────────

/**
 * Convert stored RPE (6–10) to RIR for display.
 * RPE 10 → 0 RIR (hardest), RPE 6 → 4 RIR (easiest).
 * Does NOT clamp — legacy sets with rpe < 6 are still converted (rpe=5 → "5 RIR").
 */
export function rpeToRir(rpe: number): number {
  return 10 - rpe;
}

/**
 * Convert RIR (user input in RIR mode) back to RPE for storage.
 * RIR 0 → 10 RPE, RIR 4 → 6 RPE.
 */
export function rirToRpe(rir: number): number {
  return 10 - rir;
}

// ─── Display formatters ───────────────────────────────────────────

/**
 * Format a stored RPE value for display in the active mode.
 *
 * @param rpe Stored RPE value (e.g. 8 or 7.5). null → empty string.
 * @param mode Active display mode.
 * @returns "RPE 8" | "2 RIR" | "" (never "-0 RIR" — special-cases exactly 0)
 *
 * @example
 * formatIntensity(8, "rpe")  // "RPE 8"
 * formatIntensity(8, "rir")  // "2 RIR"
 * formatIntensity(10, "rir") // "0 RIR"
 * formatIntensity(7.5, "rir") // "2.5 RIR"
 * formatIntensity(null, "rpe") // ""
 */
export function formatIntensity(rpe: number | null, mode: IntensityMode): string {
  if (rpe == null) return "";
  if (mode === "rpe") {
    // Format: whole numbers without .0 decimal (RPE 8 not RPE 8.0),
    // half-steps with .5 preserved (RPE 7.5).
    const formatted = rpe % 1 === 0 ? String(rpe) : String(rpe);
    return `RPE ${formatted}`;
  }
  // RIR mode: convert and display "N RIR" where N = 10 − rpe
  const rir = rpeToRir(rpe);
  // Guard against floating-point weirdness: rir = -0 → 0
  const displayRir = rir === 0 ? 0 : rir;
  const formattedRir = displayRir % 1 === 0 ? String(displayRir) : String(displayRir);
  return `${formattedRir} RIR`;
}

/**
 * Return the unit label string for the active mode.
 * Used for TextInput placeholders and column headers.
 *
 * @example
 * intensityUnitLabel("rpe") // "RPE"
 * intensityUnitLabel("rir") // "RIR"
 */
export function intensityUnitLabel(mode: IntensityMode): string {
  return mode === "rpe" ? "RPE" : "RIR";
}
