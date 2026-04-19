import { solve, KG_PLATES, LB_PLATES } from "./plates";

export type WarmupSet = {
  weight: number;
  reps: number;
  set_type: "warmup";
};

/**
 * Round a target weight to the nearest achievable plate-friendly weight.
 * Uses the plate solver to find achievable per-side weight, then reconstructs total.
 */
export function roundToPlates(
  target: number,
  barWeight: number,
  unit: "kg" | "lb"
): number {
  if (target <= barWeight) return barWeight;
  const plates = unit === "kg" ? KG_PLATES : LB_PLATES;
  const perSide = (target - barWeight) / 2;
  const result = solve(perSide, plates);
  return (perSide - result.remainder) * 2 + barWeight;
}

/**
 * Generate warmup sets for a given working weight.
 *
 * Default scheme: bar × 10, 50% × 5, 70% × 3, 85% × 2
 * Light weight (< 2× bar): bar × 10, ~75% × 3
 */
export function generateWarmupSets(
  workingWeight: number,
  barWeight: number,
  unit: "kg" | "lb"
): WarmupSet[] {
  if (workingWeight <= barWeight) return [];

  const isLight = workingWeight <= 2 * barWeight;

  if (isLight) {
    const mid = roundToPlates(workingWeight * 0.75, barWeight, unit);
    const sets: WarmupSet[] = [
      { weight: barWeight, reps: 10, set_type: "warmup" },
    ];
    if (mid > barWeight) {
      sets.push({ weight: mid, reps: 3, set_type: "warmup" });
    }
    return sets;
  }

  const rawSets: { pct: number; reps: number }[] = [
    { pct: 0, reps: 10 },   // bar only
    { pct: 0.5, reps: 5 },
    { pct: 0.7, reps: 3 },
    { pct: 0.85, reps: 2 },
  ];

  const result: WarmupSet[] = [];
  for (const { pct, reps } of rawSets) {
    if (pct === 0) {
      result.push({ weight: barWeight, reps, set_type: "warmup" });
      continue;
    }
    const target = workingWeight * pct;
    const rounded = roundToPlates(target, barWeight, unit);
    // Filter out duplicate bar-weight sets
    if (rounded <= barWeight) continue;
    result.push({ weight: rounded, reps, set_type: "warmup" });
  }

  return result;
}
