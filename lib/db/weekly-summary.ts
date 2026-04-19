import { getDrizzle } from "./helpers";
import { sql, eq, and, gte, lt, isNotNull, isNull } from "drizzle-orm";
import { mondayOf, movingAvg } from "../format";
import {
  workoutSessions,
  workoutSets,
  exercises,
  programSchedule,
  programs,
  dailyLog,
  foodEntries,
  macroTargets,
  bodyWeight,
} from "./schema";

// ─── Types ─────────────────────────────────────────────────────────

export type WeeklyWorkoutSummary = {
  sessionCount: number;
  totalDurationSeconds: number;
  totalVolume: number;
  previousWeekVolume: number | null;
  previousWeekSessionCount: number | null;
  hasBodyweightOnly: boolean;
  /** Only present when an active program exists */
  scheduledCount: number | null;
};

export type WeeklyPR = {
  exerciseId: string;
  exerciseName: string;
  newMax: number;
  previousMax: number | null;
};

export type WeeklyNutritionSummary = {
  daysTracked: number;
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  calorieTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  daysOnTarget: number;
};

export type WeeklyBodySummary = {
  startWeight: number | null;
  endWeight: number | null;
  entryCount: number;
};

export type WeeklySummaryData = {
  workouts: WeeklyWorkoutSummary;
  prs: WeeklyPR[];
  nutrition: WeeklyNutritionSummary | null;
  body: WeeklyBodySummary | null;
  streak: number;
};

// ─── Constants ─────────────────────────────────────────────────────

export const NUTRITION_ON_TARGET_TOLERANCE = 0.10;

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Helpers ───────────────────────────────────────────────────────

function weekRange(weekStartMs: number): { start: number; end: number } {
  return { start: weekStartMs, end: weekStartMs + ONE_WEEK_MS };
}

function dateKeyFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Generate array of YYYY-MM-DD date keys for a given week. */
function weekDateKeys(weekStartMs: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    keys.push(dateKeyFromMs(weekStartMs + i * 24 * 60 * 60 * 1000));
  }
  return keys;
}

// ─── Query Functions ───────────────────────────────────────────────

export async function getWeeklyWorkouts(
  weekStartMs: number
): Promise<WeeklyWorkoutSummary> {
  const { start, end } = weekRange(weekStartMs);
  const prevStart = weekStartMs - ONE_WEEK_MS;
  const db = await getDrizzle();

  const [sessions, volume, prevSessions, prevVolume, bodyweightCheck, scheduled] =
    await Promise.all([
      db
        .select({
          count: sql<number>`COUNT(*)`.as("count"),
          total_duration: sql<number>`COALESCE(SUM(${workoutSessions.duration_seconds}), 0)`.as("total_duration"),
        })
        .from(workoutSessions)
        .where(
          and(
            isNotNull(workoutSessions.completed_at),
            gte(workoutSessions.started_at, start),
            lt(workoutSessions.started_at, end),
          )
        )
        .get(),
      db
        .select({
          volume: sql<number>`COALESCE(SUM(${workoutSets.weight} * ${workoutSets.reps}), 0)`.as("volume"),
        })
        .from(workoutSets)
        .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
        .where(
          and(
            eq(workoutSets.completed, 1),
            eq(workoutSets.is_warmup, 0),
            isNotNull(workoutSessions.completed_at),
            gte(workoutSessions.started_at, start),
            lt(workoutSessions.started_at, end),
          )
        )
        .get(),
      db
        .select({
          count: sql<number>`COUNT(*)`.as("count"),
        })
        .from(workoutSessions)
        .where(
          and(
            isNotNull(workoutSessions.completed_at),
            gte(workoutSessions.started_at, prevStart),
            lt(workoutSessions.started_at, start),
          )
        )
        .get(),
      db
        .select({
          volume: sql<number>`COALESCE(SUM(${workoutSets.weight} * ${workoutSets.reps}), 0)`.as("volume"),
        })
        .from(workoutSets)
        .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
        .where(
          and(
            eq(workoutSets.completed, 1),
            eq(workoutSets.is_warmup, 0),
            isNotNull(workoutSessions.completed_at),
            gte(workoutSessions.started_at, prevStart),
            lt(workoutSessions.started_at, start),
          )
        )
        .get(),
      db
        .select({
          count: sql<number>`COUNT(*)`.as("count"),
        })
        .from(workoutSets)
        .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
        .where(
          and(
            eq(workoutSets.completed, 1),
            isNotNull(workoutSessions.completed_at),
            gte(workoutSessions.started_at, start),
            lt(workoutSessions.started_at, end),
            sql`(${workoutSets.weight} IS NULL OR ${workoutSets.weight} = 0)`,
            isNotNull(workoutSets.reps),
          )
        )
        .get(),
      db
        .select({
          count: sql<number>`COUNT(DISTINCT ${programSchedule.day_of_week})`.as("count"),
        })
        .from(programSchedule)
        .innerJoin(
          programs,
          and(
            eq(programs.id, programSchedule.program_id),
            eq(programs.is_active, 1),
            isNull(programs.deleted_at),
          )
        )
        .get(),
    ]);

  const sessionCount = sessions?.count ?? 0;
  const prevSessionCount = prevSessions?.count ?? null;
  const scheduledCount = (scheduled?.count ?? 0) > 0 ? scheduled!.count : null;

  return {
    sessionCount,
    totalDurationSeconds: sessions?.total_duration ?? 0,
    totalVolume: volume?.volume ?? 0,
    previousWeekVolume: prevVolume?.volume ?? null,
    previousWeekSessionCount: prevSessionCount,
    hasBodyweightOnly: (bodyweightCheck?.count ?? 0) > 0 && (volume?.volume ?? 0) === 0,
    scheduledCount,
  };
}

export async function getWeeklyPRs(weekStartMs: number): Promise<WeeklyPR[]> {
  const { start, end } = weekRange(weekStartMs);
  const db = await getDrizzle();

  // Get max weight per exercise THIS week
  const weekMaxes = await db
    .select({
      exercise_id: workoutSets.exercise_id,
      name: sql<string>`COALESCE(${exercises.name}, 'Deleted Exercise')`.as("name"),
      max_weight: sql<number>`MAX(${workoutSets.weight})`.as("max_weight"),
    })
    .from(workoutSets)
    .leftJoin(exercises, eq(workoutSets.exercise_id, exercises.id))
    .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
    .where(
      and(
        eq(workoutSets.completed, 1),
        isNotNull(workoutSets.weight),
        sql`${workoutSets.weight} > 0`,
        eq(workoutSets.is_warmup, 0),
        isNotNull(workoutSessions.completed_at),
        gte(workoutSessions.started_at, start),
        lt(workoutSessions.started_at, end),
      )
    )
    .groupBy(workoutSets.exercise_id)
    .all();

  if (weekMaxes.length === 0) return [];

  // For each exercise, check if this week's max exceeds all prior maxes
  const prs: WeeklyPR[] = [];
  for (const wm of weekMaxes) {
    const prior = await db
      .select({
        max_weight: sql<number>`MAX(${workoutSets.weight})`.as("max_weight"),
      })
      .from(workoutSets)
      .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
      .where(
        and(
          eq(workoutSets.completed, 1),
          isNotNull(workoutSets.weight),
          sql`${workoutSets.weight} > 0`,
          eq(workoutSets.is_warmup, 0),
          isNotNull(workoutSessions.completed_at),
          eq(workoutSets.exercise_id, wm.exercise_id),
          lt(workoutSessions.started_at, start),
        )
      )
      .get();

    const priorMax = prior?.max_weight ?? null;
    if (priorMax === null || wm.max_weight > priorMax) {
      prs.push({
        exerciseId: wm.exercise_id,
        exerciseName: wm.name,
        newMax: wm.max_weight,
        previousMax: priorMax,
      });
    }
  }

  return prs;
}

export async function getWeeklyNutrition(
  weekStartMs: number
): Promise<WeeklyNutritionSummary | null> {
  const dateKeys = weekDateKeys(weekStartMs);
  const db = await getDrizzle();

  // Get daily totals for the week — use sql`` for SUM expressions
  const dailyTotals = await db
    .select({
      date: dailyLog.date,
      calories: sql<number>`SUM(${foodEntries.calories} * ${dailyLog.servings})`.as("calories"),
      protein: sql<number>`SUM(${foodEntries.protein} * ${dailyLog.servings})`.as("protein"),
      carbs: sql<number>`SUM(${foodEntries.carbs} * ${dailyLog.servings})`.as("carbs"),
      fat: sql<number>`SUM(${foodEntries.fat} * ${dailyLog.servings})`.as("fat"),
    })
    .from(dailyLog)
    .innerJoin(foodEntries, eq(dailyLog.food_entry_id, foodEntries.id))
    .where(sql`${dailyLog.date} IN (${sql.join(dateKeys.map(k => sql`${k}`), sql`,`)})`)
    .groupBy(dailyLog.date)
    .all();

  if (dailyTotals.length === 0) return null;

  const targets = await db.select().from(macroTargets).limit(1).get();

  const calorieTarget = targets?.calories ?? 2000;
  const proteinTarget = targets?.protein ?? 150;
  const carbsTarget = targets?.carbs ?? 250;
  const fatTarget = targets?.fat ?? 65;

  const daysTracked = dailyTotals.length;
  const avgCalories = Math.round(
    dailyTotals.reduce((sum, d) => sum + d.calories, 0) / daysTracked
  );
  const avgProtein = Math.round(
    dailyTotals.reduce((sum, d) => sum + d.protein, 0) / daysTracked
  );
  const avgCarbs = Math.round(
    dailyTotals.reduce((sum, d) => sum + d.carbs, 0) / daysTracked
  );
  const avgFat = Math.round(
    dailyTotals.reduce((sum, d) => sum + d.fat, 0) / daysTracked
  );

  const daysOnTarget = dailyTotals.filter((d) => {
    const diff = Math.abs(d.calories - calorieTarget) / calorieTarget;
    return diff <= NUTRITION_ON_TARGET_TOLERANCE;
  }).length;

  return {
    daysTracked,
    avgCalories,
    avgProtein,
    avgCarbs,
    avgFat,
    calorieTarget,
    proteinTarget,
    carbsTarget,
    fatTarget,
    daysOnTarget,
  };
}

export async function getWeeklyBody(
  weekStartMs: number
): Promise<WeeklyBodySummary | null> {
  const dateKeys = weekDateKeys(weekStartMs);
  const startDate = dateKeys[0];
  const endDate = dateKeys[6];
  const db = await getDrizzle();

  const entries = await db
    .select({ date: bodyWeight.date, weight: bodyWeight.weight })
    .from(bodyWeight)
    .where(
      and(
        gte(bodyWeight.date, startDate),
        sql`${bodyWeight.date} <= ${endDate}`,
      )
    )
    .orderBy(bodyWeight.date)
    .all();

  if (entries.length === 0) return null;

  // Use 3-day rolling average when ≥3 entries, raw values for <3
  if (entries.length >= 3) {
    const smoothed = movingAvg(entries, 3);
    return {
      startWeight: smoothed[0].avg,
      endWeight: smoothed[smoothed.length - 1].avg,
      entryCount: entries.length,
    };
  }

  return {
    startWeight: entries[0].weight,
    endWeight: entries[entries.length - 1].weight,
    entryCount: entries.length,
  };
}

/**
 * Compute streak of consecutive completed weeks (excluding current week).
 * A week is "completed" if at least one workout session was finished.
 */
export async function getWeeklyStreak(): Promise<number> {
  const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;
  const db = await getDrizzle();

  const rows = await db
    .select({ started_at: workoutSessions.started_at })
    .from(workoutSessions)
    .where(
      and(
        isNotNull(workoutSessions.completed_at),
        gte(workoutSessions.started_at, twoYearsAgo),
      )
    )
    .orderBy(sql`${workoutSessions.started_at} DESC`)
    .all();

  if (rows.length === 0) return 0;

  const weeks = new Set(rows.map((r) => mondayOf(new Date(r.started_at))));
  const currentWeekMonday = mondayOf(new Date());

  // Start counting from previous week (current week excluded)
  let checkWeek = currentWeekMonday - ONE_WEEK_MS;
  let count = 0;
  while (weeks.has(checkWeek)) {
    count++;
    checkWeek -= ONE_WEEK_MS;
  }

  return count;
}

/**
 * Fetch all summary data for a given week.
 */
export async function getWeeklySummary(
  weekStartMs: number
): Promise<WeeklySummaryData> {
  const [workouts, prs, nutrition, body, streak] = await Promise.all([
    getWeeklyWorkouts(weekStartMs),
    getWeeklyPRs(weekStartMs),
    getWeeklyNutrition(weekStartMs),
    getWeeklyBody(weekStartMs),
    getWeeklyStreak(),
  ]);

  return { workouts, prs, nutrition, body, streak };
}
