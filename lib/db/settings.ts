import { eq, and, sql } from "drizzle-orm";
import { getDrizzle, query, queryOne, getDatabase } from "./helpers";
import { appSettings, interactionLog, workoutSessions } from "./schema";
import { uuid } from "../uuid";

// ---- App Settings ----

export async function getAppSetting(key: string): Promise<string | null> {
  const db = await getDrizzle();
  const row = await db.select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get();
  return row?.value ?? null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const db = await getDrizzle();
  await db.insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

export async function isOnboardingComplete(): Promise<boolean> {
  const val = await getAppSetting("onboarding_complete");
  return val === "1";
}

// ---- Schedule (backed by program_schedule on active program) ----

export type ScheduleEntry = {
  id: string;
  day_of_week: number;
  template_id: string;
  template_name: string;
  exercise_count: number;
  created_at: number;
};

export async function getSchedule(): Promise<ScheduleEntry[]> {
  return query<ScheduleEntry>(
    `SELECT ps.program_id AS id, ps.day_of_week, ps.template_id, 0 AS created_at,
            wt.name AS template_name,
            (SELECT COUNT(*) FROM template_exercises te WHERE te.template_id = ps.template_id) AS exercise_count
     FROM program_schedule ps
     JOIN workout_templates wt ON wt.id = ps.template_id
     JOIN programs p ON p.id = ps.program_id AND p.is_active = 1 AND p.deleted_at IS NULL
     ORDER BY ps.day_of_week ASC`
  );
}

export async function getTodaySchedule(): Promise<ScheduleEntry | null> {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const row = await queryOne<ScheduleEntry>(
    `SELECT ps.program_id AS id, ps.day_of_week, ps.template_id, 0 AS created_at,
            wt.name AS template_name,
            (SELECT COUNT(*) FROM template_exercises te WHERE te.template_id = ps.template_id) AS exercise_count
     FROM program_schedule ps
     JOIN workout_templates wt ON wt.id = ps.template_id
     JOIN programs p ON p.id = ps.program_id AND p.is_active = 1 AND p.deleted_at IS NULL
     WHERE ps.day_of_week = ?`,
    [day]
  );
  return row ?? null;
}

export async function isTodayCompleted(): Promise<boolean> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  const db = await getDrizzle();
  const row = await db.select({ count: sql<number>`COUNT(*)` })
    .from(workoutSessions)
    .where(and(
      sql`${workoutSessions.completed_at} IS NOT NULL`,
      sql`${workoutSessions.started_at} >= ${start}`,
      sql`${workoutSessions.started_at} < ${end}`,
    ))
    .get();
  return (row?.count ?? 0) > 0;
}

export async function getWeekAdherence(): Promise<{ day: number; scheduled: boolean; completed: boolean }[]> {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - offset);
  const monStart = monday.getTime();

  const schedule = await query<{ day_of_week: number }>(
    `SELECT ps.day_of_week FROM program_schedule ps
     JOIN programs p ON p.id = ps.program_id AND p.is_active = 1 AND p.deleted_at IS NULL`
  );
  const scheduled = new Set(schedule.map((s) => s.day_of_week));

  const sessions = await query<{ started_at: number }>(
    `SELECT started_at FROM workout_sessions
     WHERE completed_at IS NOT NULL AND started_at >= ? AND started_at < ?`,
    [monStart, monStart + 7 * 24 * 60 * 60 * 1000]
  );

  const completed = new Set<number>();
  for (const s of sessions) {
    const d = new Date(s.started_at);
    completed.add((d.getDay() + 6) % 7);
  }

  return Array.from({ length: 7 }, (_, i) => ({
    day: i,
    scheduled: scheduled.has(i),
    completed: completed.has(i),
  }));
}

// ---- Interaction Log ----

export async function insertInteraction(
  action: string,
  screen: string,
  detail: string | null
): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    const id = uuid();
    await database.runAsync(
      `INSERT INTO interaction_log (id, action, screen, detail, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      [id, action, screen, detail, Date.now()]
    );
    await database.runAsync(
      `DELETE FROM interaction_log WHERE id NOT IN (
        SELECT id FROM interaction_log ORDER BY timestamp DESC LIMIT 50
      )`
    );
  });
}

export async function getInteractions(): Promise<
  { id: string; action: string; screen: string; detail: string | null; timestamp: number }[]
> {
  const db = await getDrizzle();
  return db.select()
    .from(interactionLog)
    .orderBy(sql`${interactionLog.timestamp} DESC`)
    .limit(50);
}

export async function clearInteractions(): Promise<void> {
  const db = await getDrizzle();
  await db.delete(interactionLog);
}
