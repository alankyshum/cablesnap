/**
 * Training Insights — pure functions that compute contextual insights from home screen data.
 * Each generator returns Insight | null. The prioritizer picks the top one.
 */

export type InsightType = "strength" | "volume" | "consistency" | "returning";

export type Insight = {
  type: InsightType;
  title: string;
  icon: "trending-up" | "bar-chart" | "star" | "heart";
  /** exercise ID for strength trend navigation */
  exerciseId?: string;
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

export type InsightData = {
  totalSessions: number;
  timestamps: number[];
  e1rmTrends: E1RMTrendRow[];
  weeklyVolume: WeeklyVolumeRow[];
};

/**
 * Generate the highest-priority insight from home screen data.
 * Priority: strength > volume > consistency > returning user.
 * Returns null if no qualifying insight or fewer than 5 sessions.
 */
export function generateInsight(data: InsightData): Insight | null {
  if (data.totalSessions < 5) return null;

  return (
    generateStrengthInsight(data.e1rmTrends) ??
    generateVolumeInsight(data.weeklyVolume) ??
    generateConsistencyInsight(data.timestamps) ??
    generateReturningInsight(data.timestamps) ??
    null
  );
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
  const title = `Your ${best.name} is up ${deltaRounded}kg this month`;
  return {
    type: "strength",
    title,
    icon: "trending-up",
    exerciseId: best.exercise_id,
    accessibilityLabel: `Training insight: ${title}. Tap to view details.`,
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

  const title = `Training volume up ${pct}% vs last month`;
  return {
    type: "volume",
    title,
    icon: "bar-chart",
    accessibilityLabel: `Training insight: ${title}. Tap to view details.`,
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

  const title = `${currentCount} workouts this week — your best in ${bestInWeeks} weeks!`;
  return {
    type: "consistency",
    title,
    icon: "star",
    accessibilityLabel: `Training insight: ${title}`,
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
    return {
      type: "returning",
      title: "Welcome back! You crushed it today.",
      icon: "heart",
      accessibilityLabel: "Training insight: Welcome back! You crushed it today.",
    };
  }

  return null;
}
