import { eq, sql, asc } from "drizzle-orm";
import { getDrizzle, query, queryOne } from "./helpers";
import { achievementsEarned, appSettings } from "./schema";
import type { AchievementContext, EarnedAchievement } from "../achievements";

// --- Context Building ---
// Complex analytics queries — kept as raw SQL for clarity

export async function buildAchievementContext(): Promise<AchievementContext> {
  const [
    totalRow,
    workoutDatesRows,
    prCountRow,
    maxSessionVolumeRow,
    lifetimeVolumeRow,
    nutritionDaysRows,
    bodyWeightCountRow,
    progressPhotoCountRow,
    bodyMeasurementCountRow,
  ] = await Promise.all([
    queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM workout_sessions WHERE completed_at IS NOT NULL"
    ),
    query<{ date: string }>(
      `SELECT DISTINCT date(started_at / 1000, 'unixepoch', 'localtime') AS date
       FROM workout_sessions
       WHERE completed_at IS NOT NULL
       ORDER BY date ASC`
    ),
    queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM (
        SELECT ws.exercise_id
        FROM workout_sets ws
        JOIN workout_sessions wss ON ws.session_id = wss.id
        WHERE ws.completed = 1
          AND ws.set_type != 'warmup'
          AND ws.weight IS NOT NULL
          AND ws.weight > 0
          AND wss.completed_at IS NOT NULL
          AND ws.weight > (
            SELECT MAX(ws2.weight)
            FROM workout_sets ws2
            JOIN workout_sessions wss2 ON ws2.session_id = wss2.id
            WHERE ws2.exercise_id = ws.exercise_id
              AND ws2.session_id != ws.session_id
              AND ws2.completed = 1
              AND ws2.set_type != 'warmup'
              AND ws2.weight IS NOT NULL
              AND ws2.weight > 0
              AND wss2.completed_at IS NOT NULL
              AND wss2.started_at < wss.started_at
          )
        GROUP BY ws.session_id, ws.exercise_id
      )`
    ),
    queryOne<{ volume: number }>(
      `SELECT COALESCE(MAX(sv.volume), 0) AS volume FROM (
        SELECT ws.session_id, SUM(ws.weight * ws.reps) AS volume
        FROM workout_sets ws
        JOIN workout_sessions wss ON ws.session_id = wss.id
        WHERE ws.completed = 1
          AND ws.set_type != 'warmup'
          AND ws.weight IS NOT NULL
          AND ws.reps IS NOT NULL
          AND wss.completed_at IS NOT NULL
        GROUP BY ws.session_id
      ) sv`
    ),
    queryOne<{ volume: number }>(
      `SELECT COALESCE(SUM(ws.weight * ws.reps), 0) AS volume
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.completed = 1
         AND ws.set_type != 'warmup'
         AND ws.weight IS NOT NULL
         AND ws.reps IS NOT NULL
         AND wss.completed_at IS NOT NULL`
    ),
    query<{ date: string }>(
      "SELECT DISTINCT date FROM daily_log ORDER BY date ASC"
    ),
    queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM body_weight"
    ),
    queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM progress_photos WHERE deleted_at IS NULL"
    ),
    queryOne<{ count: number }>(
      "SELECT COUNT(DISTINCT date) AS count FROM body_measurements"
    ),
  ]);

  return {
    totalWorkouts: totalRow?.count ?? 0,
    workoutDates: workoutDatesRows.map((r) => r.date),
    prCount: prCountRow?.count ?? 0,
    maxSessionVolume: maxSessionVolumeRow?.volume ?? 0,
    lifetimeVolume: lifetimeVolumeRow?.volume ?? 0,
    nutritionDays: nutritionDaysRows.map((r) => r.date),
    bodyWeightCount: bodyWeightCountRow?.count ?? 0,
    progressPhotoCount: progressPhotoCountRow?.count ?? 0,
    bodyMeasurementCount: bodyMeasurementCountRow?.count ?? 0,
  };
}

// --- Earned Achievements CRUD ---

export async function getEarnedAchievements(): Promise<EarnedAchievement[]> {
  const db = await getDrizzle();
  return db.select()
    .from(achievementsEarned)
    .orderBy(asc(achievementsEarned.earned_at));
}

export async function getEarnedAchievementIds(): Promise<Set<string>> {
  const db = await getDrizzle();
  const rows = await db.select({ achievement_id: achievementsEarned.achievement_id })
    .from(achievementsEarned);
  return new Set(rows.map((r) => r.achievement_id));
}

export async function getEarnedAchievementMap(): Promise<Map<string, number>> {
  const db = await getDrizzle();
  const rows = await db.select()
    .from(achievementsEarned);
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.achievement_id, r.earned_at);
  }
  return map;
}

export async function saveEarnedAchievements(
  achievementIds: string[],
  earnedAt: number = Date.now(),
): Promise<void> {
  const db = await getDrizzle();
  for (const id of achievementIds) {
    await db.insert(achievementsEarned)
      .values({ achievement_id: id, earned_at: earnedAt })
      .onConflictDoNothing();
  }
}

export async function getEarnedCount(): Promise<number> {
  const db = await getDrizzle();
  const row = await db.select({ count: sql<number>`COUNT(*)` })
    .from(achievementsEarned)
    .get();
  return row?.count ?? 0;
}

export async function hasSeenRetroactiveBanner(): Promise<boolean> {
  const db = await getDrizzle();
  const row = await db.select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, "achievements_retroactive_done"))
    .get();
  return row !== undefined;
}

export async function markRetroactiveBannerSeen(): Promise<void> {
  const db = await getDrizzle();
  await db.insert(appSettings)
    .values({ key: "achievements_retroactive_done", value: "1" })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: "1" } });
}
