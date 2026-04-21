import { getDrizzle, query } from "./helpers";
import { sql, eq, ne, and, gte, lt, isNotNull } from "drizzle-orm";
import { count } from "drizzle-orm";
import { computeLongestDailyStreak, movingAvg } from "../format";
import { NUTRITION_ON_TARGET_TOLERANCE } from "./weekly-summary";
import type { MuscleGroup } from "../types";
import {
  workoutSessions,
  workoutSets,
  exercises,
  dailyLog,
  foodEntries,
  macroTargets,
  bodyWeight,
} from "./schema";

// ─── Types ─────────────────────────────────────────────────────────

export type MonthlyWorkoutSummary = {
  sessionCount: number;
  totalDurationSeconds: number;
  totalVolume: number;
  previousMonthVolume: number | null;
  previousMonthSessionCount: number | null;
};

export type MonthlyPR = {
  exerciseId: string;
  exerciseName: string;
  weight: number;
};

export type MonthlyMuscleVolume = {
  muscle: MuscleGroup;
  sets: number;
};

export type MonthlyMostImproved = {
  exerciseId: string;
  exerciseName: string;
  percentChange: number;
};

export type MonthlyBodySummary = {
  startWeight: number | null;
  endWeight: number | null;
};

export type MonthlyNutritionSummary = {
  daysTracked: number;
  daysOnTarget: number;
};

export type MonthlyReportData = {
  workouts: MonthlyWorkoutSummary;
  prs: MonthlyPR[];
  trainingDays: number;
  longestStreak: number;
  muscleDistribution: MonthlyMuscleVolume[];
  mostImproved: MonthlyMostImproved | null;
  body: MonthlyBodySummary | null;
  nutrition: MonthlyNutritionSummary | null;
};

// ─── Helpers ───────────────────────────────────────────────────────

/** Returns ms timestamps for the first instant of monthIndex and the first instant of the following month. */
function monthRange(year: number, monthIndex: number): { start: number; end: number } {
  const start = new Date(year, monthIndex, 1).getTime();
  const end = new Date(year, monthIndex + 1, 1).getTime();
  return { start, end };
}

function prevMonthRange(year: number, monthIndex: number): { start: number; end: number } {
  const pMonth = monthIndex === 0 ? 11 : monthIndex - 1;
  const pYear = monthIndex === 0 ? year - 1 : year;
  return monthRange(pYear, pMonth);
}

/** Generate YYYY-MM-DD date keys for every day in the given month. */
function monthDateKeys(year: number, monthIndex: number): string[] {
  const keys: string[] = [];
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(monthIndex + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    keys.push(`${year}-${mm}-${dd}`);
  }
  return keys;
}

// ─── Query Functions ───────────────────────────────────────────────

async function getMonthlyWorkouts(
  year: number,
  monthIndex: number
): Promise<MonthlyWorkoutSummary> {
  const { start, end } = monthRange(year, monthIndex);
  const prev = prevMonthRange(year, monthIndex);
  const db = await getDrizzle();

  const [sessions, volume, prevSessions, prevVolume] = await Promise.all([
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
          ne(workoutSets.set_type, "warmup"),
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
          gte(workoutSessions.started_at, prev.start),
          lt(workoutSessions.started_at, prev.end),
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
          ne(workoutSets.set_type, "warmup"),
          isNotNull(workoutSessions.completed_at),
          gte(workoutSessions.started_at, prev.start),
          lt(workoutSessions.started_at, prev.end),
        )
      )
      .get(),
  ]);

  return {
    sessionCount: sessions?.count ?? 0,
    totalDurationSeconds: sessions?.total_duration ?? 0,
    totalVolume: volume?.volume ?? 0,
    previousMonthVolume: prevVolume?.volume ?? null,
    previousMonthSessionCount: prevSessions?.count ?? null,
  };
}

async function getMonthlyPRs(
  year: number,
  monthIndex: number
): Promise<MonthlyPR[]> {
  const { start, end } = monthRange(year, monthIndex);

  const rows = await query<{
    exercise_id: string;
    name: string;
    month_max: number;
    prior_max: number | null;
  }>(
    `SELECT
       cur.exercise_id,
       COALESCE(e.name, 'Deleted Exercise') AS name,
       cur.month_max,
       prev.prior_max
     FROM (
       SELECT ws.exercise_id, MAX(ws.weight) AS month_max
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.completed = 1
         AND ws.set_type != 'warmup'
         AND ws.weight IS NOT NULL AND ws.weight > 0
         AND wss.completed_at IS NOT NULL
         AND wss.started_at >= ? AND wss.started_at < ?
       GROUP BY ws.exercise_id
     ) cur
     LEFT JOIN (
       SELECT ws.exercise_id, MAX(ws.weight) AS prior_max
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.completed = 1
         AND ws.set_type != 'warmup'
         AND ws.weight IS NOT NULL AND ws.weight > 0
         AND wss.completed_at IS NOT NULL
         AND wss.started_at < ?
       GROUP BY ws.exercise_id
     ) prev ON cur.exercise_id = prev.exercise_id
     LEFT JOIN exercises e ON cur.exercise_id = e.id
     WHERE prev.prior_max IS NULL OR cur.month_max > prev.prior_max
     ORDER BY cur.month_max DESC
     LIMIT 10`,
    [start, end, start]
  );

  return rows.map((r) => ({
    exerciseId: r.exercise_id,
    exerciseName: r.name,
    weight: r.month_max,
  }));
}

async function getMonthlyTrainingDaysAndStreak(
  year: number,
  monthIndex: number
): Promise<{ trainingDays: number; longestStreak: number }> {
  const { start, end } = monthRange(year, monthIndex);

  const rows = await query<{ d: string }>(
    `SELECT DISTINCT date(started_at / 1000, 'unixepoch', 'localtime') AS d
     FROM workout_sessions
     WHERE completed_at IS NOT NULL
       AND started_at >= ? AND started_at < ?`,
    [start, end]
  );

  const dates = rows.map((r) => r.d);
  return {
    trainingDays: dates.length,
    longestStreak: computeLongestDailyStreak(dates),
  };
}

async function getMonthlyMuscleDistribution(
  year: number,
  monthIndex: number
): Promise<MonthlyMuscleVolume[]> {
  const { start, end } = monthRange(year, monthIndex);
  const db = await getDrizzle();

  const rows = await db
    .select({
      exercise_id: workoutSets.exercise_id,
      primary_muscles: exercises.primary_muscles,
      sets: count(),
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
    .leftJoin(exercises, eq(workoutSets.exercise_id, exercises.id))
    .where(
      and(
        isNotNull(workoutSessions.completed_at),
        gte(workoutSessions.started_at, start),
        lt(workoutSessions.started_at, end),
        eq(workoutSets.completed, 1),
        ne(workoutSets.set_type, "warmup"),
      )
    )
    .groupBy(workoutSets.exercise_id);

  const map = new Map<MuscleGroup, number>();

  for (const row of rows) {
    if (!row.primary_muscles) continue;
    let muscles: MuscleGroup[];
    try {
      muscles = JSON.parse(row.primary_muscles);
    } catch {
      continue;
    }
    if (!Array.isArray(muscles) || muscles.length === 0) continue;
    for (const m of muscles) {
      map.set(m, (map.get(m) ?? 0) + row.sets);
    }
  }

  return Array.from(map.entries())
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets);
}

async function getMonthlyMostImproved(
  year: number,
  monthIndex: number
): Promise<MonthlyMostImproved | null> {
  const { start, end } = monthRange(year, monthIndex);
  const prev = prevMonthRange(year, monthIndex);

  const rows = await query<{
    exercise_id: string;
    name: string;
    current_e1rm: number;
    previous_e1rm: number;
  }>(
    `SELECT
       cur.exercise_id,
       COALESCE(e.name, 'Deleted Exercise') AS name,
       cur.e1rm AS current_e1rm,
       prev.e1rm AS previous_e1rm
     FROM (
       SELECT ws.exercise_id,
              MAX(ws.weight * (1.0 + ws.reps / 30.0)) AS e1rm,
              COUNT(DISTINCT wss.id) AS session_count
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.completed = 1
         AND ws.set_type != 'warmup'
         AND ws.weight > 0
         AND ws.reps > 0
         AND ws.reps <= 12
         AND wss.completed_at IS NOT NULL
         AND wss.started_at >= ? AND wss.started_at < ?
       GROUP BY ws.exercise_id
       HAVING session_count >= 2
     ) cur
     JOIN (
       SELECT ws.exercise_id,
              MAX(ws.weight * (1.0 + ws.reps / 30.0)) AS e1rm
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.completed = 1
         AND ws.set_type != 'warmup'
         AND ws.weight > 0
         AND ws.reps > 0
         AND ws.reps <= 12
         AND wss.completed_at IS NOT NULL
         AND wss.started_at >= ? AND wss.started_at < ?
       GROUP BY ws.exercise_id
     ) prev ON cur.exercise_id = prev.exercise_id
     LEFT JOIN exercises e ON cur.exercise_id = e.id
     WHERE cur.e1rm > prev.e1rm
     ORDER BY (cur.e1rm - prev.e1rm) / prev.e1rm DESC
     LIMIT 1`,
    [start, end, prev.start, prev.end]
  );

  if (rows.length === 0) return null;

  const r = rows[0];
  const pct = Math.round(((r.current_e1rm - r.previous_e1rm) / r.previous_e1rm) * 100);
  return {
    exerciseId: r.exercise_id,
    exerciseName: r.name,
    percentChange: pct,
  };
}

async function getMonthlyBody(
  year: number,
  monthIndex: number
): Promise<MonthlyBodySummary | null> {
  const dateKeys = monthDateKeys(year, monthIndex);
  const startDate = dateKeys[0];
  const endDate = dateKeys[dateKeys.length - 1];
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

  if (entries.length >= 3) {
    const smoothed = movingAvg(entries, 3);
    return {
      startWeight: smoothed[0].avg,
      endWeight: smoothed[smoothed.length - 1].avg,
    };
  }

  return {
    startWeight: entries[0].weight,
    endWeight: entries[entries.length - 1].weight,
  };
}

async function getMonthlyNutrition(
  year: number,
  monthIndex: number
): Promise<MonthlyNutritionSummary | null> {
  const dateKeys = monthDateKeys(year, monthIndex);
  const db = await getDrizzle();

  // Only report nutrition if user has set macro targets
  const targets = await db.select().from(macroTargets).limit(1).get();
  if (!targets) return null;

  const dailyTotals = await db
    .select({
      date: dailyLog.date,
      calories: sql<number>`SUM(${foodEntries.calories} * ${dailyLog.servings})`.as("calories"),
    })
    .from(dailyLog)
    .innerJoin(foodEntries, eq(dailyLog.food_entry_id, foodEntries.id))
    .where(sql`${dailyLog.date} IN (${sql.join(dateKeys.map((k) => sql`${k}`), sql`,`)})`)
    .groupBy(dailyLog.date)
    .all();

  if (dailyTotals.length === 0) return null;

  const calorieTarget = targets.calories ?? 2000;
  const daysOnTarget = dailyTotals.filter((d) => {
    const diff = Math.abs(d.calories - calorieTarget) / calorieTarget;
    return diff <= NUTRITION_ON_TARGET_TOLERANCE;
  }).length;

  return {
    daysTracked: dailyTotals.length,
    daysOnTarget,
  };
}

// ─── Master Function ───────────────────────────────────────────────

/**
 * Fetch all monthly report data for a given month.
 * @param year Full year (e.g. 2026)
 * @param monthIndex 0-based month index (0 = January, 11 = December)
 */
export async function getMonthlyReport(
  year: number,
  monthIndex: number
): Promise<MonthlyReportData> {
  const [workouts, prs, daysAndStreak, muscleDistribution, mostImproved, body, nutrition] =
    await Promise.all([
      getMonthlyWorkouts(year, monthIndex),
      getMonthlyPRs(year, monthIndex),
      getMonthlyTrainingDaysAndStreak(year, monthIndex),
      getMonthlyMuscleDistribution(year, monthIndex),
      getMonthlyMostImproved(year, monthIndex),
      getMonthlyBody(year, monthIndex),
      getMonthlyNutrition(year, monthIndex),
    ]);

  return {
    workouts,
    prs,
    trainingDays: daysAndStreak.trainingDays,
    longestStreak: daysAndStreak.longestStreak,
    muscleDistribution,
    mostImproved,
    body,
    nutrition,
  };
}
