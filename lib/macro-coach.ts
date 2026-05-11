/**
 * Adaptive Macro Coach — pure computation module.
 *
 * DESIGN INVARIANTS (enforced by property tests in __tests__/macro-coach.test.ts):
 *   1. No Date.now() / new Date() calls — clock is injected via `now: Date`.
 *   2. suggestTarget never returns a value below the safety floor.
 *   3. Weekly delta is always capped at ±300 kcal.
 *   4. No DB / React Native imports — fully unit-testable in Node.
 *
 * PROHIBITION: No celebration-of-direction copy in this module or its callers.
 * This is a code-level enforcement item per the psychologist verdict (076d3d4c).
 * Color coding of direction (green-down / red-up) is PROHIBITED in all UI
 * that displays values returned from this module.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type Goal = "cut" | "maintain" | "bulk";

export type SkipReason =
  | "insufficient_window"   // days < 7
  | "insufficient_weights"  // fewer than 14 weigh-ins in 21 days
  | "insufficient_logs"     // fewer than 10 food-log days in window
  | "weight_stable"         // |Δweight| / window_kg < 0.002
  | "implausible_balance"   // |estimatedTDEE − avgIntake| > 750 kcal/day
  | "coach_disabled"
  | "cooldown_active"
  | "paused"
  | "suppressed_deficit";   // Drained suppression active for deficit

export interface BodyWeightRow {
  id: string;
  weight: number; // kg
  date: string;   // ISO date "YYYY-MM-DD"
}

export interface DailyLogRow {
  date: string;
  total_calories: number;
}

export interface DateRange {
  startIso: string;
  endIso: string;
}

export interface ClampResult {
  value: number;
  capped: boolean;
}

export type StabilityClass = "stable" | "loss" | "gain";

export interface CoachSuggestion {
  trendWeight: number;         // kg, EWMA result
  avgIntake: number;           // kcal/day (rounded to nearest 50)
  estimatedTDEELow: number;    // kcal (rounded to nearest 50)
  estimatedTDEEHigh: number;   // kcal (rounded to nearest 50)
  suggestedTarget: number;     // kcal/day (rounded to nearest 50)
  currentTarget: number;       // kcal/day
  floorActive: boolean;        // was the safety floor the binding constraint?
  capActive: boolean;          // was the ±300 kcal/week cap the binding constraint?
  stabilityClass: StabilityClass;
  loggingConsistencyDays: number; // days logged in last 30 days
}

export interface SuggestOpts {
  weights: BodyWeightRow[];         // all weigh-ins in last 21 days (raw; filtering done here)
  logs: DailyLogRow[];              // daily logs in last 14 days
  currentTargetKcal: number;
  safetyFloorKcal: number;
  goal: Goal;
  now: Date;                        // injected — never call Date.now() inside
  loggingConsistencyDays?: number;  // days logged in last 30; defaults to logs.length
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** EWMA smoothing parameter (Hacker's Diet / MacroFactor baseline). ~10-day half-life. */
export const EWMA_ALPHA = 0.1;

/** Energy density of fat tissue (kcal/kg). MacroFactor-style energy balance formula. */
const KCAL_PER_KG_FAT = 7700;

/** Maximum weekly suggestion delta (kcal/week). */
const MAX_WEEKLY_DELTA_KCAL = 300;

/** Maximum plausible |TDEE − avgIntake| before rejecting as noise artifact. */
const MAX_PLAUSIBLE_TDEE_DEVIATION = 750;

/** Valid body-weight range (kg). Outlier filter. */
const MIN_WEIGHT_KG = 30;
const MAX_WEIGHT_KG = 300;

/** Minimum weighins required in the 21-day window. */
const MIN_WEIGHINS = 14;

/** Minimum food-log days required in the 14-day window. */
const MIN_LOG_DAYS = 10;

/** Minimum window days for energy-balance computation. */
const MIN_WINDOW_DAYS = 7;

/** Weight stability threshold: |Δ| < 0.2% bodyweight → no suggestion. */
const STABILITY_THRESHOLD_PCT = 0.002;

/** TDEE range half-width for display (±N kcal each side, before rounding). */
const TDEE_RANGE_HALF = 125;

/** Goal adjustment table (kcal/day). Keep in sync with nutrition-calc.ts. */
const GOAL_ADJUSTMENTS: Record<Goal, number> = {
  cut: -500,
  maintain: 0,
  bulk: 300,
};

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

/**
 * Add N calendar days to a Date using epoch arithmetic.
 * This is the ONLY place in this module allowed to call `new Date(…)`.
 * All other helpers must use addDays() so that the module remains grep-enforceable
 * as clock-injection-compliant (tightened regex: /\bnew Date\(/).
 */
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/**
 * Round to nearest N (e.g. nearest 50 for user-facing kcal display).
 */
export function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Compute EWMA (Hacker's Diet formula) over a sorted array of weight rows.
 * Filters implausible weights ([30, 300] kg). Requires at least 1 valid entry.
 * Returns null if no valid rows.
 *
 * The seed is the first valid weight observation.
 */
export function computeTrendWeight(
  weights: BodyWeightRow[],
  windowDays: number,
  now: Date
): number | null {
  const cutoff = addDays(now, -windowDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const valid = weights
    .filter(
      (w) =>
        w.date >= cutoffIso &&
        w.date <= now.toISOString().slice(0, 10) &&
        w.weight >= MIN_WEIGHT_KG &&
        w.weight <= MAX_WEIGHT_KG
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  if (valid.length === 0) return null;

  let trend = valid[0].weight;
  for (let i = 1; i < valid.length; i++) {
    trend = trend + EWMA_ALPHA * (valid[i].weight - trend);
  }
  return trend;
}

/**
 * Compute average daily calorie intake over a date range.
 * Returns null if fewer than MIN_LOG_DAYS days are present.
 */
export function computeAvgIntake(
  logs: DailyLogRow[],
  range: DateRange
): number | null {
  const inRange = logs.filter(
    (l) => l.date >= range.startIso && l.date <= range.endIso && l.total_calories >= 0
  );
  if (inRange.length < MIN_LOG_DAYS) return null;
  const sum = inRange.reduce((acc, l) => acc + l.total_calories, 0);
  return sum / inRange.length;
}

/**
 * Estimate observed TDEE from energy-balance equation.
 *
 * observed_TDEE = avgIntake + (Δweight_kg × 7700) / days
 *
 * Guards:
 *  - days < MIN_WINDOW_DAYS → "insufficient_window"
 *  - |Δweight| / trendStart < STABILITY_THRESHOLD → "weight_stable"
 *  - |estimatedTDEE − avgIntake| > MAX_PLAUSIBLE_TDEE_DEVIATION → "implausible_balance"
 */
export function estimateTDEE(
  avgIntake: number,
  weightDeltaKg: number,
  days: number,
  trendStartKg: number
): number | { reason: SkipReason } {
  if (days < MIN_WINDOW_DAYS) return { reason: "insufficient_window" };

  const relDelta = Math.abs(weightDeltaKg) / trendStartKg;
  if (relDelta < STABILITY_THRESHOLD_PCT) return { reason: "weight_stable" };

  const tdee = avgIntake + (weightDeltaKg * KCAL_PER_KG_FAT) / days;
  const deviation = Math.abs(tdee - avgIntake);
  if (deviation > MAX_PLAUSIBLE_TDEE_DEVIATION) return { reason: "implausible_balance" };

  return tdee;
}

/**
 * Clamp a target to a safety floor.
 */
export function clampToFloor(
  target: number,
  floor: number
): ClampResult {
  if (target < floor) return { value: floor, capped: true };
  return { value: target, capped: false };
}

/**
 * Clamp the change between current and proposed target to ±maxDelta per week.
 */
export function clampToWeeklyDelta(
  current: number,
  proposed: number,
  maxDelta: number = MAX_WEEKLY_DELTA_KCAL
): ClampResult {
  const delta = proposed - current;
  if (Math.abs(delta) <= maxDelta) return { value: proposed, capped: false };
  const clamped = current + Math.sign(delta) * maxDelta;
  return { value: clamped, capped: true };
}

/**
 * Classify weight trend direction (stable / loss / gain).
 */
export function classifyStability(
  deltaKg: number,
  trendStartKg: number
): StabilityClass {
  const relDelta = deltaKg / trendStartKg;
  if (Math.abs(relDelta) < STABILITY_THRESHOLD_PCT) return "stable";
  return deltaKg < 0 ? "loss" : "gain";
}

/**
 * Count unique dates with food logs in last N days.
 */
export function countLoggingDays(logs: DailyLogRow[], windowDays: number, now: Date): number {
  const cutoff = addDays(now, -windowDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const todayIso = now.toISOString().slice(0, 10);
  const dates = new Set(
    logs.filter((l) => l.date >= cutoffIso && l.date <= todayIso).map((l) => l.date)
  );
  return dates.size;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Main entry point. Returns a CoachSuggestion or a SkipReason.
 *
 * No Date.now() / new Date() inside. Clock is injected via opts.now.
 */
export function suggestTarget(
  opts: SuggestOpts
): CoachSuggestion | { reason: SkipReason } {
  const { weights, logs, currentTargetKcal, safetyFloorKcal, goal, now } = opts;

  const todayIso = now.toISOString().slice(0, 10);
  const window21 = addDays(now, -21);
  const window14 = addDays(now, -14);

  // Filter valid weights in window
  const validWeights = weights.filter(
    (w) =>
      w.date >= window21.toISOString().slice(0, 10) &&
      w.date <= todayIso &&
      w.weight >= MIN_WEIGHT_KG &&
      w.weight <= MAX_WEIGHT_KG
  );

  if (validWeights.length < MIN_WEIGHINS) return { reason: "insufficient_weights" };

  // Compute EWMA trend weight
  const trendNow = computeTrendWeight(weights, 21, now);
  if (trendNow === null) return { reason: "insufficient_weights" };

  // Trend 14 days ago (for delta)
  const trendStart = computeTrendWeight(weights, 35, window14);
  if (trendStart === null) return { reason: "insufficient_weights" };

  const deltaKg = trendNow - trendStart;
  const days = 14; // window for energy balance

  // Compute average intake
  const range: DateRange = {
    startIso: window14.toISOString().slice(0, 10),
    endIso: todayIso,
  };
  const avgIntake = computeAvgIntake(logs, range);
  if (avgIntake === null) return { reason: "insufficient_logs" };

  // Estimate TDEE
  const tdeeResult = estimateTDEE(avgIntake, deltaKg, days, trendStart);
  if (typeof tdeeResult === "object" && "reason" in tdeeResult) return tdeeResult;
  const estimatedTDEE = tdeeResult as number;

  // Classify stability
  const stabilityClass = classifyStability(deltaKg, trendStart);

  // Compute raw suggestion: TDEE + goal adjustment
  const rawSuggestion = estimatedTDEE + GOAL_ADJUSTMENTS[goal];

  // Clamp to safety floor
  const floorResult = clampToFloor(rawSuggestion, safetyFloorKcal);

  // Clamp to ±300 kcal/week from current
  const deltaResult = clampToWeeklyDelta(currentTargetKcal, floorResult.value);

  // Round to nearest 50 for display
  const suggestedTarget = roundToNearest(deltaResult.value, 50);
  const avgIntakeRounded = roundToNearest(avgIntake, 50);

  const loggingConsistencyDays = opts.loggingConsistencyDays ?? countLoggingDays(logs, 30, now);

  return {
    trendWeight: Math.round(trendNow * 10) / 10,
    avgIntake: avgIntakeRounded,
    estimatedTDEELow: roundToNearest(estimatedTDEE - TDEE_RANGE_HALF, 50),
    estimatedTDEEHigh: roundToNearest(estimatedTDEE + TDEE_RANGE_HALF, 50),
    suggestedTarget,
    currentTarget: currentTargetKcal,
    floorActive: floorResult.capped,
    capActive: deltaResult.capped,
    stabilityClass,
    loggingConsistencyDays,
  };
}
