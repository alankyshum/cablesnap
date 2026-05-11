/**
 * Adaptive Macro Coach — DB orchestrator + memoization layer.
 *
 * This module bridges the pure `lib/macro-coach.ts` functions with the database.
 * It owns data fetching, memoization, and the useMacroCoach() hook interface.
 *
 * Memo key: `${todayIso}|${latestWeightRowId}|${latestLogDate}|${settingsHash}`
 * Map cleared on settings change.
 */

import { eq, desc, asc, sql, gte } from "drizzle-orm";
import { getDrizzle } from "./helpers";
import { bodyWeight, dailyLog, foodEntries, macroTargets, appSettings } from "./schema";
import { getAppSetting } from "./settings";
import { safeParse } from "../safe-parse";
import { convertToMetric, migrateProfile } from "../nutrition-calc";
import type { NutritionProfile } from "../nutrition-calc";
import {
  suggestTarget,
  type CoachSuggestion,
  type SkipReason,
  type BodyWeightRow,
  type DailyLogRow,
} from "../macro-coach";
import {
  getEnabled,
  getMode,
  getFloorKcal,
  getLastAcceptedSuggestion,
  isCooldownActive,
  isPaused,
  isDeficitSuppressed,
  hasTwoConsecutiveDrained,
  type UserFloorProfile,
  type LastAcceptedSuggestion,
} from "./macro-coach-settings";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CoachStatus = "loading" | "hidden" | "ready" | "info_only";

export interface MacroCoachResult {
  status: CoachStatus;
  suggestion?: CoachSuggestion;
  skipReason?: SkipReason;
  /** Safety floor kcal for the current user (max(sexFloor, RMR)). Present when status=ready|info_only. */
  safetyFloorKcal?: number;
  /** User's current body weight in kg (for macro recompute on custom-kcal input). */
  userWeightKg?: number;
  /** Most recently accepted suggestion, if any. Used to wire post-decision check-in. */
  lastAccepted?: LastAcceptedSuggestion;
}

// ─── Memo cache ───────────────────────────────────────────────────────────────

const memo = new Map<string, MacroCoachResult>();

/** Clear the memo cache (call when settings change). */
export function clearMacroCoachMemo(): void {
  memo.clear();
}

// ─── Data fetching helpers ────────────────────────────────────────────────────

async function fetchWeightRows(windowDays: number, now: Date): Promise<BodyWeightRow[]> {
  const db = await getDrizzle();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const rows = await db
    .select({ id: bodyWeight.id, weight: bodyWeight.weight, date: bodyWeight.date })
    .from(bodyWeight)
    .where(gte(bodyWeight.date, cutoffIso))
    .orderBy(asc(bodyWeight.date));
  return rows as BodyWeightRow[];
}

async function fetchDailyLogRows(windowDays: number, now: Date): Promise<DailyLogRow[]> {
  const db = await getDrizzle();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const rows = await db
    .select({
      date: dailyLog.date,
      total_calories: sql<number>`SUM(${foodEntries.calories} * COALESCE(${dailyLog.servings}, 1))`,
    })
    .from(dailyLog)
    .innerJoin(foodEntries, eq(dailyLog.food_entry_id, foodEntries.id))
    .where(gte(dailyLog.date, cutoffIso))
    .groupBy(dailyLog.date)
    .orderBy(asc(dailyLog.date));
  return rows as DailyLogRow[];
}

async function fetchCurrentTargetKcal(): Promise<number> {
  const db = await getDrizzle();
  const row = await db
    .select({ calories: macroTargets.calories })
    .from(macroTargets)
    .limit(1)
    .get();
  return (row?.calories ?? 2000) as number;
}

async function fetchUserFloorProfile(): Promise<UserFloorProfile | null> {
  const saved = await getAppSetting("nutrition_profile");
  if (!saved) return null;
  const raw = safeParse<Record<string, unknown> | null>(saved, null, "macro-coach.nutrition_profile");
  if (!raw) return null;
  const profile = migrateProfile(raw) as NutritionProfile;
  const { weight_kg, height_cm } = convertToMetric(
    profile.weight,
    profile.weightUnit,
    profile.height,
    profile.heightUnit
  );
  const age = new Date().getFullYear() - profile.birthYear;
  return { sex: profile.sex, weight_kg, height_cm, age };
}

async function buildSettingsHash(): Promise<string> {
  const keys = [
    "macro_coach.enabled",
    "macro_coach.mode",
    "macro_coach.floor_kcal_user_override",
    "macro_coach.paused_until",
    "macro_coach.last_dismissed_at",
    "macro_coach.dismissal_count",
    "macro_coach.deficit_suppressed_until",
    "macro_coach.right_why_w-0",
    "macro_coach.right_why_w-1",
  ];
  const db = await getDrizzle();
  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(sql`${appSettings.key} IN (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})`);
  return rows.map((r) => `${r.key}=${r.value ?? ""}`).join("|");
}

// ─── Main compute function ────────────────────────────────────────────────────

/**
 * Compute the macro coach suggestion for the current user.
 * Uses memoization — call clearMacroCoachMemo() when settings change.
 */
export async function computeMacroCoach(now?: Date): Promise<MacroCoachResult> {
  const effectiveNow = now ?? new Date();
  const todayIso = effectiveNow.toISOString().slice(0, 10);

  // Check enabled flag first (cheap)
  const enabled = await getEnabled();
  if (!enabled) return { status: "hidden", skipReason: "coach_disabled" };

  // Build memo key
  const db = await getDrizzle();
  const latestWeight = await db
    .select({ id: bodyWeight.id })
    .from(bodyWeight)
    .orderBy(desc(bodyWeight.date))
    .limit(1)
    .get();
  const latestLog = await db
    .select({ date: dailyLog.date })
    .from(dailyLog)
    .orderBy(desc(dailyLog.date))
    .limit(1)
    .get();
  const settingsHash = await buildSettingsHash();
  const memoKey = `${todayIso}|${latestWeight?.id ?? ""}|${latestLog?.date ?? ""}|${settingsHash}`;

  const cached = memo.get(memoKey);
  if (cached) return cached;

  const result = await _computeUncached(effectiveNow);
  memo.set(memoKey, result);
  return result;
}

async function _computeUncached(now: Date): Promise<MacroCoachResult> {
  const nowMs = now.getTime();

  // Check pause / cooldown
  if (await isPaused(nowMs)) return { status: "hidden", skipReason: "paused" };
  if (await isCooldownActive(nowMs)) return { status: "hidden", skipReason: "cooldown_active" };

  const mode = await getMode();
  const userFloorProfile = await fetchUserFloorProfile();

  if (!userFloorProfile) {
    // No profile → no floor → cannot safely proceed
    return { status: "hidden", skipReason: "insufficient_weights" };
  }

  const safetyFloor = await getFloorKcal(userFloorProfile);
  const currentTarget = await fetchCurrentTargetKcal();
  const lastAccepted = await getLastAcceptedSuggestion() ?? undefined;

  // Fetch data
  const weights = await fetchWeightRows(35, now);
  const logs = await fetchDailyLogRows(30, now);

  // Count 30-day logging consistency
  const todayIso = now.toISOString().slice(0, 10);
  const cutoff30 = new Date(now);
  cutoff30.setDate(cutoff30.getDate() - 30);
  const cutoff30Iso = cutoff30.toISOString().slice(0, 10);
  const logDates = new Set(logs.filter((l) => l.date >= cutoff30Iso && l.date <= todayIso).map((l) => l.date));
  const loggingConsistencyDays = logDates.size;

  if (mode === "info_only") {
    // Info-only: compute TDEE but don't suggest target changes
    const suggestion = suggestTarget({
      weights,
      logs,
      currentTargetKcal: currentTarget,
      safetyFloorKcal: safetyFloor,
      goal: "maintain", // neutral — we won't apply adjustment in info_only
      now,
      loggingConsistencyDays,
    });
    if ("reason" in suggestion) return { status: "hidden", skipReason: suggestion.reason };
    return { status: "info_only", suggestion, safetyFloorKcal: safetyFloor, userWeightKg: userFloorProfile.weight_kg, lastAccepted };
  }

  // Full mode — check deficit suppression
  const goal = await _fetchGoal();
  const deficitSuppressed = await isDeficitSuppressed(nowMs);
  const twoDrained = await hasTwoConsecutiveDrained();

  // If goal is a cut (deficit direction) and suppressed → info_only for this week
  const effectiveGoal = (deficitSuppressed || twoDrained) && goal === "cut" ? "maintain" : goal;

  const suggestion = suggestTarget({
    weights,
    logs,
    currentTargetKcal: currentTarget,
    safetyFloorKcal: safetyFloor,
    goal: effectiveGoal,
    now,
    loggingConsistencyDays,
  });

  if ("reason" in suggestion) return { status: "hidden", skipReason: suggestion.reason };

  if ((deficitSuppressed || twoDrained) && goal === "cut") {
    return { status: "info_only", suggestion, safetyFloorKcal: safetyFloor, userWeightKg: userFloorProfile.weight_kg, lastAccepted };
  }

  return { status: "ready", suggestion, safetyFloorKcal: safetyFloor, userWeightKg: userFloorProfile.weight_kg, lastAccepted };
}

async function _fetchGoal(): Promise<"cut" | "maintain" | "bulk"> {
  const saved = await getAppSetting("nutrition_profile");
  if (!saved) return "maintain";
  const raw = safeParse<Record<string, unknown> | null>(saved, null, "macro-coach.goal");
  if (!raw) return "maintain";
  const profile = migrateProfile(raw) as NutritionProfile;
  return profile.goal;
}
