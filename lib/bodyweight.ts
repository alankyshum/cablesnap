/**
 * Bodyweight load modifier helpers (BLD-541).
 *
 * The `workout_sets.bodyweight_modifier_kg` column holds a signed load modifier
 * on bodyweight exercises (equipment === 'bodyweight'):
 *   - NULL  → pure bodyweight         → chip "BW"
 *   - > 0   → added weight (belt/vest) → chip "+15 kg" / "+5 lb"
 *   - < 0   → assistance (band/machine)→ chip "Assist −20 kg" (U+2212)
 *
 * Storage is always kg — display uses kg/lb via `lib/units.ts`.
 *
 * The Unicode minus `−` (U+2212) is used in visual copy (never ASCII '-').
 * Accessibility labels never say "hyphen"/"minus": the mode word ("Added" /
 * "Assisted") carries the sign semantic.
 */

import { toDisplay } from "./units";

/** Unicode minus sign (U+2212), used instead of ASCII '-' in display copy. */
export const UNICODE_MINUS = "\u2212";

export type BodyweightModifierMode = "bodyweight" | "added" | "assisted";

/**
 * Classify a modifier value into one of the 3 UX modes.
 * NULL / undefined → "bodyweight".
 */
export function modeOfModifier(
  modifierKg: number | null | undefined
): BodyweightModifierMode {
  if (modifierKg == null || modifierKg === 0) return "bodyweight";
  return modifierKg > 0 ? "added" : "assisted";
}

/**
 * Normalize any modifier input to canonical storage form.
 * ±0 and non-finite values collapse to null (pure BW).
 * Duplicated intentionally at the helper boundary — belt-and-braces
 * alongside the DB write invariant and the sheet-level normalization.
 */
export function normalizeModifier(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return null;
  if (value === 0) return null;
  return value;
}

/**
 * Format a bodyweight modifier for display in a chip / row.
 *
 *   null → "BW"
 *   15   → "+15 kg" (or "+33 lb")
 *   -20  → "Assist −20 kg" (U+2212 minus, with the word "Assist" as disambiguator)
 *
 * When `unit === 'lb'`, the stored kg value is converted via `toDisplay`.
 */
export function formatBodyweightLoad(
  modifierKg: number | null | undefined,
  unit: "kg" | "lb" = "kg"
): string {
  const n = normalizeModifier(modifierKg);
  if (n === null) return "BW";
  const magnitude = Math.abs(n);
  const displayed = toDisplay(magnitude, unit);
  const unitLabel = unit === "lb" ? "lb" : "kg";
  // toDisplay already rounds; render without a trailing ".0" so "15" stays tidy.
  const numText = Number.isInteger(displayed)
    ? displayed.toFixed(0)
    : String(displayed);
  if (n > 0) return `+${numText} ${unitLabel}`;
  return `Assist ${UNICODE_MINUS}${numText} ${unitLabel}`;
}

/**
 * Accessibility label for a modifier chip (and PR / celebration surfaces).
 * Never speaks "hyphen" / "minus" — uses the mode word instead.
 */
export function accessibilityLabelForModifier(
  modifierKg: number | null | undefined,
  unit: "kg" | "lb" = "kg"
): string {
  const n = normalizeModifier(modifierKg);
  const unitWord = unit === "lb" ? "pounds" : "kilograms";
  if (n === null) return "Bodyweight only, no modifier";
  const magnitude = Math.abs(n);
  const displayed = toDisplay(magnitude, unit);
  if (n > 0) return `Weighted, plus ${displayed} ${unitWord}`;
  return `Assisted, minus ${displayed} ${unitWord}`;
}

/**
 * Effective-load resolver for e1RM / strength-score calculations.
 *
 * For bodyweight exercises, effective external load = userBodyweight + modifier.
 * A fully-deloaded assisted set (modifier more negative than bodyweight) floors
 * at 0 — the user is not lifting less than nothing.
 *
 * Returns null when bodyweight is unknown (profile not set) — callers should
 * hide the e1RM line and surface a "Set bodyweight → Profile" CTA.
 */
export function resolveEffectiveLoad(
  modifierKg: number | null | undefined,
  userBodyweightKg: number | null | undefined
): number | null {
  if (userBodyweightKg == null || userBodyweightKg <= 0) return null;
  const n = normalizeModifier(modifierKg);
  const effective = userBodyweightKg + (n ?? 0);
  return Math.max(0, effective);
}

/**
 * PR delta copy for weighted-bodyweight PR celebrations and PRCard rows.
 * Handles 4 cases per UX REV-7:
 *   - first-ever weighted   → "First weighted: +N kg"
 *   - added-weight PR       → "+N kg"
 *   - assisted reduction    → "Assistance reduced by N kg"
 *   - sign-crossing         → "From Assist −M kg → Added +N kg"
 */
export function formatBodyweightPRDelta(
  previousModifierKg: number | null,
  currentModifierKg: number,
  unit: "kg" | "lb" = "kg"
): string {
  const prev = normalizeModifier(previousModifierKg);
  const curr = normalizeModifier(currentModifierKg);
  if (curr === null) {
    return ""; // not a weighted-BW PR
  }
  const unitLabel = unit === "lb" ? "lb" : "kg";
  if (prev === null) {
    const displayed = toDisplay(Math.abs(curr), unit);
    const prefix = curr > 0 ? "+" : `Assist ${UNICODE_MINUS}`;
    return `First weighted: ${prefix}${displayed} ${unitLabel}`;
  }
  const crossing = Math.sign(prev) !== Math.sign(curr);
  if (crossing) {
    return `From ${formatBodyweightLoad(prev, unit)} \u2192 ${formatBodyweightLoad(curr, unit)}`;
  }
  if (curr > 0 && prev > 0) {
    const delta = curr - prev;
    const displayed = toDisplay(Math.abs(delta), unit);
    return `+${displayed} ${unitLabel}`;
  }
  // Both negative: assistance reduction (closer to 0 = better).
  const reduction = Math.abs(prev) - Math.abs(curr);
  const displayed = toDisplay(Math.abs(reduction), unit);
  return `Assistance reduced by ${displayed} ${unitLabel}`;
}
