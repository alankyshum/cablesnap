/**
 * Typed accessor for all `app_settings.training_day_macros.*` keys.
 *
 * This is the ONLY module allowed to read/write training-day macro settings.
 *
 * Backup behavior: all `training_day_macros.*` keys are stored in the
 * `app_settings` table and are automatically included in the `app_preferences`
 * backup category via `getAppSettingsCategory()` in import-export.ts:239.
 * No changes to import-export.ts are required.
 *
 * Design invariants:
 *   1. PREFIX is "training_day_macros." — unique namespace, no collisions.
 *   2. No `model` key — Model 2 (frequency-balanced) is the only shipped model.
 *   3. splitPercent is always stored clamped to [5, 25].
 *   4. trainingDaysPerWeek is always stored clamped to [1, 6] (÷0 guard — AC22).
 *   5. Default OFF — enabled defaults to false (psychologist C5, AC19).
 */

import { getAppSetting, setAppSetting } from "./settings";
import {
  SPLIT_PERCENT_MIN,
  SPLIT_PERCENT_MAX,
  SPLIT_PERCENT_DEFAULT,
  TRAINING_DAYS_MIN,
  TRAINING_DAYS_MAX,
  TRAINING_DAYS_DEFAULT,
  clamp,
} from "../training-day-macros";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Unique key namespace — ONLY this module reads/writes these keys. */
export const PREFIX = "training_day_macros.";

// ─── Getters ──────────────────────────────────────────────────────────────────

/**
 * Whether the Training-Day Macro Adjustment feature is enabled.
 * Default: false (OFF — psychologist C5, AC1/AC19).
 */
export async function getEnabled(): Promise<boolean> {
  const v = await getAppSetting(`${PREFIX}enabled`);
  return v === "1";
}

/**
 * The user-configured split percentage (5–25, default 10).
 * Controls how many extra calories training days get (S = base × splitPercent/100).
 */
export async function getSplitPercent(): Promise<number> {
  const v = await getAppSetting(`${PREFIX}split_percent`);
  if (v === null) return SPLIT_PERCENT_DEFAULT;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return SPLIT_PERCENT_DEFAULT;
  return clamp(Math.round(n), SPLIT_PERCENT_MIN, SPLIT_PERCENT_MAX);
}

/**
 * The user-configured training days per week (1–6, default 4).
 * Used by Model 2 for calorie-neutral weekly distribution.
 * Clamped to [1, 6] — n=7 would cause ÷0 in the Model 2 formula (AC22).
 */
export async function getTrainingDaysPerWeek(): Promise<number> {
  const v = await getAppSetting(`${PREFIX}training_days_per_week`);
  if (v === null) return TRAINING_DAYS_DEFAULT;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return TRAINING_DAYS_DEFAULT;
  return clamp(Math.round(n), TRAINING_DAYS_MIN, TRAINING_DAYS_MAX);
}

/**
 * Read all training-day macro settings in a single call.
 * Convenience for hook consumers that need all three values.
 */
export async function getAllSettings(): Promise<{
  enabled: boolean;
  splitPercent: number;
  trainingDaysPerWeek: number;
}> {
  const [enabled, splitPercent, trainingDaysPerWeek] = await Promise.all([
    getEnabled(),
    getSplitPercent(),
    getTrainingDaysPerWeek(),
  ]);
  return { enabled, splitPercent, trainingDaysPerWeek };
}

// ─── Setters ──────────────────────────────────────────────────────────────────

export async function setEnabled(enabled: boolean): Promise<void> {
  await setAppSetting(`${PREFIX}enabled`, enabled ? "1" : "0");
}

/**
 * Persist the split percentage. Clamped to [5, 25] at write time.
 */
export async function setSplitPercent(value: number): Promise<void> {
  const clamped = clamp(Math.round(value), SPLIT_PERCENT_MIN, SPLIT_PERCENT_MAX);
  await setAppSetting(`${PREFIX}split_percent`, String(clamped));
}

/**
 * Persist the training days per week. Clamped to [1, 6] at write time (AC22).
 */
export async function setTrainingDaysPerWeek(value: number): Promise<void> {
  const clamped = clamp(Math.round(value), TRAINING_DAYS_MIN, TRAINING_DAYS_MAX);
  await setAppSetting(`${PREFIX}training_days_per_week`, String(clamped));
}
