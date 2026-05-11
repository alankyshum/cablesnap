/**
 * Typed accessor for all `app_settings.macro_coach.*` keys.
 *
 * This is the ONLY module allowed to read/write macro coach settings.
 * No parseFloat() outside this module.
 *
 * Safety floor invariant (psych verdict 076d3d4c §3):
 *   getFloorKcal() ALWAYS returns max(1500F/1800M, mifflin_st_jeor_RMR(user)).
 *   A persisted value can only RAISE the floor above this minimum, never lower it.
 */

import { getAppSetting, setAppSetting } from "./settings";
import { calculateBMR } from "../nutrition-calc";
import type { Sex } from "../nutrition-calc";

// ─── Constants ────────────────────────────────────────────────────────────────

const PREFIX = "macro_coach.";

/** Absolute minimum safety floors by biological sex (psych verdict §3). */
export const SAFETY_FLOOR_FEMALE = 1500;
export const SAFETY_FLOOR_MALE = 1800;

// ─── Types ────────────────────────────────────────────────────────────────────

export type CoachMode = "full" | "info_only";
export type RightWhyAnswer = "strong" | "ok" | "drained";
export type IfThenChoice = "before_lunch" | "after_workout" | "whenever";
export type ScoffAnswer = "yes" | "no" | "prefer_not_to_say";

export interface RightWhyEntry {
  weekIso: string;      // ISO date of the Sunday for this entry
  answer: RightWhyAnswer;
}

export interface UserFloorProfile {
  sex: Sex;
  weight_kg: number;
  height_cm: number;
  age: number;
}

// ─── Computed safety floor ─────────────────────────────────────────────────────

/**
 * Compute the minimum allowed kcal floor for a given user.
 * floor = max(1500F / 1800M, mifflin_st_jeor_RMR(user))
 */
export function computeSafetyFloor(profile: UserFloorProfile): number {
  const bmr = calculateBMR(profile.weight_kg, profile.height_cm, profile.age, profile.sex);
  const sexFloor = profile.sex === "female" ? SAFETY_FLOOR_FEMALE : SAFETY_FLOOR_MALE;
  return Math.max(sexFloor, Math.round(bmr));
}

// ─── Getters ──────────────────────────────────────────────────────────────────

export async function getEnabled(): Promise<boolean> {
  const v = await getAppSetting(`${PREFIX}enabled`);
  return v === "1";
}

export async function getMode(): Promise<CoachMode> {
  const v = await getAppSetting(`${PREFIX}mode`);
  return v === "full" ? "full" : "info_only";
}

/**
 * Returns the effective floor kcal for this user.
 * The persisted user override can only RAISE the computed floor, never lower it.
 * Even if the persisted value is corrupted, this always returns ≥ computeSafetyFloor(profile).
 */
export async function getFloorKcal(profile: UserFloorProfile): Promise<number> {
  const computedFloor = computeSafetyFloor(profile);
  const stored = await getAppSetting(`${PREFIX}floor_kcal_user_override`);
  if (stored === null) return computedFloor;
  const parsed = parseInt(stored, 10);
  if (isNaN(parsed)) return computedFloor;
  // User can raise the floor, but not lower it below the safety minimum.
  return Math.max(computedFloor, parsed);
}

export async function getLastDismissedAt(): Promise<number | null> {
  const v = await getAppSetting(`${PREFIX}last_dismissed_at`);
  if (!v) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

export async function getDismissalCount(): Promise<number> {
  const v = await getAppSetting(`${PREFIX}dismissal_count`);
  if (!v) return 0;
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : Math.max(0, n);
}

export async function getPausedUntil(): Promise<number | null> {
  const v = await getAppSetting(`${PREFIX}paused_until`);
  if (!v) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

export async function getDeficitSuppressedUntil(): Promise<number | null> {
  const v = await getAppSetting(`${PREFIX}deficit_suppressed_until`);
  if (!v) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

export async function getRightWhyHistory(): Promise<RightWhyEntry[]> {
  // Last 4 weeks: macro_coach.right_why_w-0 through w-3 (w-0 = most recent)
  const entries: RightWhyEntry[] = [];
  for (let i = 0; i < 4; i++) {
    const raw = await getAppSetting(`${PREFIX}right_why_w-${i}`);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as RightWhyEntry;
      if (parsed.weekIso && parsed.answer) entries.push(parsed);
    } catch {
      // ignore corrupted entries
    }
  }
  return entries;
}

export async function getIdentitySentence(): Promise<string | null> {
  return getAppSetting(`${PREFIX}identity_sentence`);
}

export async function getIfThenChoice(): Promise<IfThenChoice | null> {
  const v = await getAppSetting(`${PREFIX}if_then_choice`);
  if (v === "before_lunch" || v === "after_workout" || v === "whenever") return v;
  return null;
}

export async function getScreeningAnswer(): Promise<ScoffAnswer | null> {
  const v = await getAppSetting(`${PREFIX}screening_answer`);
  if (v === "yes" || v === "no" || v === "prefer_not_to_say") return v;
  return null;
}

export async function getScreeningCompletedAt(): Promise<number | null> {
  const v = await getAppSetting(`${PREFIX}screening_completed_at`);
  if (!v) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

// ─── Setters ──────────────────────────────────────────────────────────────────

export async function setEnabled(enabled: boolean): Promise<void> {
  await setAppSetting(`${PREFIX}enabled`, enabled ? "1" : "0");
}

export async function setMode(mode: CoachMode): Promise<void> {
  await setAppSetting(`${PREFIX}mode`, mode);
}

/**
 * Persist user's preferred floor override. The value is clamped to the safety minimum on
 * READ (getFloorKcal), so persisting a value below the minimum is silently corrected at
 * read time — the UI should prevent this from happening.
 */
export async function setFloorKcalOverride(kcal: number, profile: UserFloorProfile): Promise<void> {
  const computedFloor = computeSafetyFloor(profile);
  const clamped = Math.max(computedFloor, Math.round(kcal));
  await setAppSetting(`${PREFIX}floor_kcal_user_override`, String(clamped));
}

export async function setLastDismissedAt(ts: number): Promise<void> {
  await setAppSetting(`${PREFIX}last_dismissed_at`, String(ts));
}

export async function setDismissalCount(count: number): Promise<void> {
  await setAppSetting(`${PREFIX}dismissal_count`, String(Math.max(0, count)));
}

export async function resetDismissalCount(): Promise<void> {
  await setAppSetting(`${PREFIX}dismissal_count`, "0");
}

export async function setPausedUntil(ts: number | null): Promise<void> {
  if (ts === null) {
    await setAppSetting(`${PREFIX}paused_until`, "");
  } else {
    await setAppSetting(`${PREFIX}paused_until`, String(ts));
  }
}

export async function setDeficitSuppressedUntil(ts: number | null): Promise<void> {
  if (ts === null) {
    await setAppSetting(`${PREFIX}deficit_suppressed_until`, "");
  } else {
    await setAppSetting(`${PREFIX}deficit_suppressed_until`, String(ts));
  }
}

export async function setRightWhyEntry(weekIso: string, answer: RightWhyAnswer): Promise<void> {
  // Shift history: w-0 becomes w-1, etc. Insert new entry at w-0.
  const current: Array<RightWhyEntry | null> = [];
  for (let i = 0; i < 3; i++) {
    const raw = await getAppSetting(`${PREFIX}right_why_w-${i}`);
    if (!raw) { current.push(null); continue; }
    try { current.push(JSON.parse(raw) as RightWhyEntry); } catch { current.push(null); }
  }

  const newEntry: RightWhyEntry = { weekIso, answer };
  await setAppSetting(`${PREFIX}right_why_w-0`, JSON.stringify(newEntry));
  for (let i = 0; i < 3; i++) {
    const entry = current[i];
    if (entry) {
      await setAppSetting(`${PREFIX}right_why_w-${i + 1}`, JSON.stringify(entry));
    }
  }
}

export async function setIdentitySentence(sentence: string | null): Promise<void> {
  await setAppSetting(`${PREFIX}identity_sentence`, sentence ?? "");
}

export async function setIfThenChoice(choice: IfThenChoice | null): Promise<void> {
  await setAppSetting(`${PREFIX}if_then_choice`, choice ?? "");
}

export async function setScreeningAnswer(answer: ScoffAnswer, now: number): Promise<void> {
  await setAppSetting(`${PREFIX}screening_answer`, answer);
  await setAppSetting(`${PREFIX}screening_completed_at`, String(now));
}

// ─── Derived state helpers ─────────────────────────────────────────────────────

/**
 * Check if a cooldown is active. Returns true if the user should not see the card.
 * First decline: 14-day cooldown. Second+ consecutive decline: 28-day cooldown.
 */
export async function isCooldownActive(now: number): Promise<boolean> {
  const lastDismissed = await getLastDismissedAt();
  if (lastDismissed === null) return false;

  const count = await getDismissalCount();
  const cooldownDays = count >= 2 ? 28 : 14;
  const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
  return now - lastDismissed < cooldownMs;
}

/**
 * Check if coach is paused.
 */
export async function isPaused(now: number): Promise<boolean> {
  const until = await getPausedUntil();
  if (!until) return false;
  return now < until;
}

/**
 * Check if deficit suggestions are suppressed.
 */
export async function isDeficitSuppressed(now: number): Promise<boolean> {
  const until = await getDeficitSuppressedUntil();
  if (!until) return false;
  return now < until;
}

/**
 * Suppress deficit suggestions for 14 days (post-decision Drained check-in).
 */
export async function suppressDeficitFor14Days(now: number): Promise<void> {
  const until = now + 14 * 24 * 60 * 60 * 1000;
  await setDeficitSuppressedUntil(until);
}

/**
 * Pause the coach for N months (1 month ≈ 30 days).
 */
export async function pauseForMonths(months: number, now: number): Promise<void> {
  const until = now + months * 30 * 24 * 60 * 60 * 1000;
  await setPausedUntil(until);
}

/**
 * Check if two consecutive weeks had Drained answers.
 */
export async function hasTwoConsecutiveDrained(): Promise<boolean> {
  const history = await getRightWhyHistory();
  if (history.length < 2) return false;
  return history[0].answer === "drained" && history[1].answer === "drained";
}
