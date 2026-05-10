/**
 * Pure helpers for stack marker quick-pick UX.
 * BLD-1126: Stack Marker Quick-Pick.
 *
 * All functions are side-effect-free (no DB calls, no React).
 */
import type { CableStackRow, StackCalibrationRow, WorkoutSetRow } from "./db/schema";

// ── AC1: Three-state pill render gate ────────────────────────────────────────

/**
 * Determines whether the weight cell for a set should render the marker pill
 * (vs. the numeric WeightInput).
 *
 * Rules (plan §UX Design "Pill render gating"):
 *  - Cable exercise AND gym has ≥ 1 calibrated stack.
 *  - AND row is either:
 *      (a) pristine: weight IS NULL AND stack_marker IS NULL
 *      (b) marker-logged: stack_marker IS NOT NULL
 *  - Rows with weight IS NOT NULL AND stack_marker IS NULL (manual/legacy)
 *    stay numeric — they get an "↕" opt-in affordance instead.
 *
 * @param row - Drizzle or WorkoutSet row (subset with weight + stack_marker).
 * @param isCable - Result of isCableExercise({equipment}).
 * @param hasCalibration - true when useActiveCalibration returns ≥1 stack.
 */
export function shouldRenderMarkerPill(
  row: Pick<WorkoutSetRow, "weight" | "stack_marker">,
  isCable: boolean,
  hasCalibration: boolean
): boolean {
  if (!isCable || !hasCalibration) return false;
  const isPristine = row.weight === null && row.stack_marker === null;
  const isMarkerLogged = row.stack_marker !== null;
  return isPristine || isMarkerLogged;
}

// ── AC14: pickMarker helper ────────────────────────────────────────────────

export type PickMarkerResult = {
  weight: number;
  stackId: string;
  stackName: string;
  stackUnit: string;
  marker: number;
};

/**
 * Resolves a marker selection from a CableStack + its calibrations into the
 * five fields that must be persisted via updateSetStackMarker.
 *
 * Returns null when:
 *  - stack is null/undefined
 *  - no calibration row exists for the given marker
 *
 * The stack row carries `unit` and `name`; the calibration row carries
 * `true_weight`. This is necessary because `lib/cable-stack.ts:resolveMarker`
 * returns `{ weight, unit: "" }` — calibration rows don't carry unit.
 */
export function pickMarker(
  stack: CableStackRow | null | undefined,
  calibrations: StackCalibrationRow[],
  marker: number
): PickMarkerResult | null {
  if (!stack) return null;
  const cal = calibrations.find((c) => c.marker === marker);
  if (!cal) return null;
  return {
    weight: cal.true_weight,
    stackId: stack.id,
    stackName: stack.name,
    stackUnit: stack.unit,
    marker,
  };
}
