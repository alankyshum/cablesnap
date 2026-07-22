/**
 * stepWeight — pure, float-safe weight increment helper.
 *
 * BLD-2674: Shared between NumericStepper (goal forms) and SessionWeightStepper
 * (active session rows) so both use the same rounding + clamp logic.
 *
 * Rules:
 *  - dir +1 → add step, dir -1 → subtract step
 *  - Result rounded to 1 decimal via integer-scale trick (`Math.round(x*10)/10`)
 *    to prevent float drift (2.5 × 4 from 0 = 10.0 exactly)
 *  - Off-grid values: step is ADDED/SUBTRACTED without snapping to a grid
 *    (47.5 + step 5 → 52.5, not 50)
 *  - Null/undefined value with dir +1: treated as 0, first tap yields step
 *  - Result clamped to [min, max]; returns existing (or 0) if already at bound
 */
export type StepWeightOptions = {
  min?: number;
  max?: number;
};

export function stepWeight(
  value: number | null | undefined,
  step: number,
  dir: 1 | -1,
  { min = 0, max = 9999 }: StepWeightOptions = {},
): number {
  // Treat null/undefined as 0 for the purpose of stepping
  const current = value ?? 0;
  // Use integer-scaled arithmetic to avoid float drift
  const next = Math.round((current + dir * step) * 100) / 100;
  // Clamp to [min, max]
  if (next < min) return min;
  if (next > max) return max;
  return next;
}
