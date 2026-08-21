/**
 * Training Insights — pure functions that compute contextual insights from home screen data.
 * Each generator returns Insight | null. The prioritizer picks the top one.
 */

import type { MuscleGroup } from "./types";
import { MUSCLE_LABELS } from "./types";
import { t as linguiT } from "@lingui/core/macro";

type TranslationDescriptor = { id: string; message: string };
type TranslationValues = Record<string, string | number>;

function t(descriptor: TranslationDescriptor, values?: TranslationValues): string {
  try {
    return (linguiT as unknown as (descriptor: TranslationDescriptor, values?: TranslationValues) => string)(descriptor, values);
  } catch {
    return values
      ? descriptor.message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`))
      : descriptor.message;
  }
}

export type InsightType = "strength" | "volume" | "consistency" | "returning" | "goal_progress" | "balance";

export type Insight = {
  type: InsightType;
  title: string;
  icon: "trending-up" | "bar-chart" | "star" | "heart" | "bullseye-arrow";
  /** exercise ID for strength trend navigation */
  exerciseId?: string;
  /** muscle group for balance navigation */
  muscle?: MuscleGroup;
  accessibilityLabel: string;
};

export type E1RMTrendRow = {
  exercise_id: string;
  name: string;
  current_e1rm: number;
  previous_e1rm: number;
};

export type WeeklyVolumeRow = {
  week: string;
  volume: number;
};

export type GoalInsightRow = {
  exercise_id: string;
  exercise_name: string;
  progressPct: number;
};

export type VolumeStatus = "below_mev" | "optimal" | "above_mrv";

export type MuscleBalanceRow = {
  muscle: MuscleGroup;
  sets: number;
  status: VolumeStatus;
};

export const MIN_MEANINGFUL_SETS = 2;

export type InsightData = {
  totalSessions: number;
  timestamps: number[];
  e1rmTrends: E1RMTrendRow[];
  weeklyVolume: WeeklyVolumeRow[];
  goalInsights?: GoalInsightRow[];
  balanceRows?: MuscleBalanceRow[];
};

/**
 * Generate the highest-priority insight from home screen data.
 * Priority: goal → strength → volume → consistency → balance → returning.
 * Returns null if no qualifying insight or fewer than 5 sessions.
 */
export function generateInsight(data: InsightData): Insight | null {
  if (data.totalSessions < 5) return null;

  return (
    generateGoalInsight(data.goalInsights) ??
    generateStrengthInsight(data.e1rmTrends) ??
    generateVolumeInsight(data.weeklyVolume) ??
    generateConsistencyInsight(data.timestamps) ??
    generateBalanceInsight(data.balanceRows) ??
    generateReturningInsight(data.timestamps) ??
    null
  );
}

function generateGoalInsight(goals?: GoalInsightRow[]): Insight | null {
  if (!goals || goals.length === 0) return null;

  // Pick the goal with the highest progress
  let best: GoalInsightRow | null = null;
  for (const g of goals) {
    if (g.progressPct > 0 && (!best || g.progressPct > best.progressPct)) {
      best = g;
    }
  }

  if (!best || best.progressPct <= 0) return null;

  const title = t(
    { id: "insights.goal.title", message: "You're {progressPct}% of the way to your {exerciseName} goal!" },
    { progressPct: best.progressPct, exerciseName: best.exercise_name },
  );
  return {
    type: "goal_progress",
    title,
    icon: "bullseye-arrow",
    exerciseId: best.exercise_id,
    accessibilityLabel: t(
      { id: "insights.goal.accessibilityLabel", message: "Training insight: {title}. Tap to view details." },
      { title },
    ),
  };
}

function generateStrengthInsight(trends: E1RMTrendRow[]): Insight | null {
  if (trends.length === 0) return null;

  // Pick the exercise with the biggest absolute e1RM improvement
  let best: E1RMTrendRow | null = null;
  let bestDelta = 0;
  for (const row of trends) {
    const delta = row.current_e1rm - row.previous_e1rm;
    if (delta > 0 && delta > bestDelta) {
      best = row;
      bestDelta = delta;
    }
  }

  if (!best) return null;

  const deltaRounded = Math.round(bestDelta * 10) / 10;
  const title = t(
    { id: "insights.strength.title", message: "Your {exerciseName} is up {delta}kg this month" },
    { exerciseName: best.name, delta: deltaRounded },
  );
  return {
    type: "strength",
    title,
    icon: "trending-up",
    exerciseId: best.exercise_id,
    accessibilityLabel: t(
      { id: "insights.strength.accessibilityLabel", message: "Training insight: {title}. Tap to view details." },
      { title },
    ),
  };
}

function generateVolumeInsight(weeklyVolume: WeeklyVolumeRow[]): Insight | null {
  if (weeklyVolume.length < 5) return null;

  // Compare last 4 weeks average to previous 4 weeks average
  const recent = weeklyVolume.slice(-4);
  const previous = weeklyVolume.slice(-8, -4);

  if (previous.length === 0) return null;

  const recentAvg = recent.reduce((s, w) => s + w.volume, 0) / recent.length;
  const previousAvg = previous.reduce((s, w) => s + w.volume, 0) / previous.length;

  if (previousAvg <= 0 || recentAvg <= previousAvg) return null;

  const pct = Math.round(((recentAvg - previousAvg) / previousAvg) * 100);
  if (pct < 1) return null;

  const title = t({ id: "insights.volume.title", message: "Training volume up {pct}% vs last month" }, { pct });
  return {
    type: "volume",
    title,
    icon: "bar-chart",
    accessibilityLabel: t(
      { id: "insights.volume.accessibilityLabel", message: "Training insight: {title}. Tap to view details." },
      { title },
    ),
  };
}

/**
 * Group timestamps by ISO week number and return per-week counts.
 * Handles year boundaries correctly via ISO week calculation.
 */
export function groupByISOWeek(timestamps: number[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const ts of timestamps) {
    const key = isoWeekKey(new Date(ts));
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function isoWeekKey(d: Date): string {
  // ISO week: Monday-based. Use the Thursday of the same week to determine year+week.
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const jan1 = new Date(thursday.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((thursday.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return `${thursday.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function generateConsistencyInsight(timestamps: number[]): Insight | null {
  if (timestamps.length < 5) return null;

  const weeklyCounts = groupByISOWeek(timestamps);
  // Get sorted week keys
  const sortedWeeks = [...weeklyCounts.keys()].sort();
  if (sortedWeeks.length < 2) return null;

  const currentWeekKey = isoWeekKey(new Date());
  const currentCount = weeklyCounts.get(currentWeekKey) ?? 0;

  if (currentCount === 0) return null;

  // Get up to 4 previous weeks (excluding current)
  const prevWeeks = sortedWeeks.filter((w) => w < currentWeekKey).slice(-4);
  if (prevWeeks.length === 0) return null;

  const prevAvg = prevWeeks.reduce((s, w) => s + (weeklyCounts.get(w) ?? 0), 0) / prevWeeks.length;

  if (currentCount <= prevAvg) return null;

  // Find how many weeks back the current count was last exceeded
  let bestInWeeks = prevWeeks.length;
  for (let i = prevWeeks.length - 1; i >= 0; i--) {
    if ((weeklyCounts.get(prevWeeks[i]) ?? 0) >= currentCount) {
      bestInWeeks = prevWeeks.length - 1 - i;
      break;
    }
  }

  if (bestInWeeks < 1) return null;

  const title = t(
    { id: "insights.consistency.title", message: "{count} workouts this week — your best in {weeks} weeks!" },
    { count: currentCount, weeks: bestInWeeks },
  );
  return {
    type: "consistency",
    title,
    icon: "star",
    accessibilityLabel: t({ id: "insights.consistency.accessibilityLabel", message: "Training insight: {title}" }, { title }),
  };
}

function generateReturningInsight(timestamps: number[]): Insight | null {
  if (timestamps.length < 2) return null;

  // Sort descending
  const sorted = [...timestamps].sort((a, b) => b - a);
  const latest = sorted[0];
  const secondLatest = sorted[1];

  const fourteenDays = 14 * 24 * 60 * 60 * 1000;
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

  // Latest session was within the last 24 hours and previous was 14+ days before it
  if (latest >= oneDayAgo && (latest - secondLatest) >= fourteenDays) {
    const title = t({ id: "insights.returning.title", message: "Welcome back! You crushed it today." });
    return {
      type: "returning",
      title,
      icon: "heart",
      accessibilityLabel: t(
        { id: "insights.returning.accessibilityLabel", message: "Training insight: {title}" },
        { title },
      ),
    };
  }

  return null;
}

export function formatMuscleName(muscle: MuscleGroup): string {
  if (muscle === "full_body") return t({ id: "insights.muscle.fullBody", message: "full body" });
  return MUSCLE_LABELS[muscle]?.toLowerCase() ?? muscle;
}

export function generateBalanceInsight(balanceRows?: MuscleBalanceRow[]): Insight | null {
  if (!balanceRows || balanceRows.length < 3) return null;

  const under = balanceRows.filter((r) => r.status === "below_mev");
  const over = balanceRows.filter((r) => r.status === "above_mrv");

  const underCount = under.length;
  const overCount = over.length;

  if (underCount === 0 && overCount === 0) return null;

  // Pick first flagged muscle (under first, then over) for deep-link
  const firstFlaggedRow = under[0] ?? over[0];
  const firstFlaggedMuscle = firstFlaggedRow?.muscle;

  let title = "";
  if (underCount > 0 && overCount === 0) {
    title = underCount === 1
      ? t({ id: "insights.balance.underOne", message: "1 muscle is below this week's target" })
      : t({ id: "insights.balance.underMany", message: "{count} muscles are below this week's target" }, { count: underCount });
  } else if (overCount > 0 && underCount === 0) {
    title = overCount === 1
      ? t({ id: "insights.balance.overOne", message: "1 muscle is above this week's cap" })
      : t({ id: "insights.balance.overMany", message: "{count} muscles are above this week's cap" }, { count: overCount });
  } else {
    title = t(
      { id: "insights.balance.mixed", message: "{underCount} below target, {overCount} above cap this week." },
      { underCount, overCount },
    );
  }

  return {
    type: "balance",
    title,
    icon: "bar-chart",
    muscle: firstFlaggedMuscle,
    accessibilityLabel: t(
      { id: "insights.balance.accessibilityLabel", message: "{title}. Tap to view muscle volume details." },
      { title },
    ),
  };
}
