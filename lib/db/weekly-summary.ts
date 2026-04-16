import { query, queryOne } from "./helpers";
import { mondayOf, movingAvg } from "../format";

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

  const [sessions, volume, prevSessions, prevVolume, bodyweightCheck, scheduled] =
    await Promise.all([
      queryOne<{ count: number; total_duration: number }>(
        `SELECT COUNT(*) AS count, COALESCE(SUM(duration_seconds), 0) AS total_duration
         FROM workout_sessions
         WHERE completed_at IS NOT NULL AND started_at >= ? AND started_at < ?`,
        [start, end]
      ),
      queryOne<{ volume: number }>(
        `SELECT COALESCE(SUM(ws.weight * ws.reps), 0) AS volume
         FROM workout_sets ws
         JOIN workout_sessions wss ON ws.session_id = wss.id
         WHERE ws.completed = 1 AND wss.completed_at IS NOT NULL
           AND wss.started_at >= ? AND wss.started_at < ?`,
        [start, end]
      ),
      queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM workout_sessions
         WHERE completed_at IS NOT NULL AND started_at >= ? AND started_at < ?`,
        [prevStart, start]
      ),
      queryOne<{ volume: number }>(
        `SELECT COALESCE(SUM(ws.weight * ws.reps), 0) AS volume
         FROM workout_sets ws
         JOIN workout_sessions wss ON ws.session_id = wss.id
         WHERE ws.completed = 1 AND wss.completed_at IS NOT NULL
           AND wss.started_at >= ? AND wss.started_at < ?`,
        [prevStart, start]
      ),
      queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM workout_sets ws
         JOIN workout_sessions wss ON ws.session_id = wss.id
         WHERE ws.completed = 1 AND wss.completed_at IS NOT NULL
           AND wss.started_at >= ? AND wss.started_at < ?
           AND (ws.weight IS NULL OR ws.weight = 0)
           AND ws.reps IS NOT NULL`,
        [start, end]
      ),
      queryOne<{ count: number }>(
        `SELECT COUNT(DISTINCT ps.day_of_week) AS count
         FROM program_schedule ps
         JOIN programs p ON p.id = ps.program_id AND p.is_active = 1 AND p.deleted_at IS NULL`
      ),
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

  // Get max weight per exercise THIS week
  const weekMaxes = await query<{
    exercise_id: string;
    name: string;
    max_weight: number;
  }>(
    `SELECT ws.exercise_id, COALESCE(e.name, 'Deleted Exercise') AS name,
            MAX(ws.weight) AS max_weight
     FROM workout_sets ws
     LEFT JOIN exercises e ON ws.exercise_id = e.id
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.completed = 1 AND ws.weight IS NOT NULL AND ws.weight > 0
       AND wss.completed_at IS NOT NULL
       AND wss.started_at >= ? AND wss.started_at < ?
     GROUP BY ws.exercise_id`,
    [start, end]
  );

  if (weekMaxes.length === 0) return [];

  // For each exercise, check if this week's max exceeds all prior maxes
  const prs: WeeklyPR[] = [];
  for (const wm of weekMaxes) {
    const prior = await queryOne<{ max_weight: number }>(
      `SELECT MAX(ws.weight) AS max_weight
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.completed = 1 AND ws.weight IS NOT NULL AND ws.weight > 0
         AND wss.completed_at IS NOT NULL
         AND ws.exercise_id = ?
         AND wss.started_at < ?`,
      [wm.exercise_id, start]
    );

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
  const placeholders = dateKeys.map(() => "?").join(",");

  // Get daily totals for the week
  const dailyTotals = await query<{
    date: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>(
    `SELECT dl.date,
            SUM(f.calories * dl.servings) AS calories,
            SUM(f.protein * dl.servings) AS protein,
            SUM(f.carbs * dl.servings) AS carbs,
            SUM(f.fat * dl.servings) AS fat
     FROM daily_log dl
     JOIN food_entries f ON dl.food_entry_id = f.id
     WHERE dl.date IN (${placeholders})
     GROUP BY dl.date`,
    dateKeys
  );

  if (dailyTotals.length === 0) return null;

  const targets = await queryOne<{
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>("SELECT calories, protein, carbs, fat FROM macro_targets LIMIT 1");

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

  const entries = await query<{ date: string; weight: number }>(
    `SELECT date, weight FROM body_weight
     WHERE date >= ? AND date <= ?
     ORDER BY date ASC`,
    [startDate, endDate]
  );

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
  const rows = await query<{ started_at: number }>(
    `SELECT started_at FROM workout_sessions
     WHERE completed_at IS NOT NULL AND started_at >= ?
     ORDER BY started_at DESC`,
    [twoYearsAgo]
  );

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
