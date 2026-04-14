import { query, queryOne, execute, getDatabase } from "./helpers";

// ---- App Settings ----

export async function getAppSetting(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = ?",
    [key]
  );
  return row?.value ?? null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  await execute(
    "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
    [key, value]
  );
}

export async function isOnboardingComplete(): Promise<boolean> {
  const val = await getAppSetting("onboarding_complete");
  return val === "1";
}

// ---- Weekly Schedule ----

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
    `SELECT ws.id, ws.day_of_week, ws.template_id, ws.created_at,
            wt.name AS template_name,
            (SELECT COUNT(*) FROM template_exercises te WHERE te.template_id = ws.template_id) AS exercise_count
     FROM weekly_schedule ws
     JOIN workout_templates wt ON wt.id = ws.template_id
     ORDER BY ws.day_of_week ASC`
  );
}

export async function setScheduleDay(day: number, templateId: string | null): Promise<void> {
  if (templateId === null) {
    await execute("DELETE FROM weekly_schedule WHERE day_of_week = ?", [day]);
    return;
  }
  const id = crypto.randomUUID();
  await execute(
    `INSERT OR REPLACE INTO weekly_schedule (id, day_of_week, template_id, created_at)
     VALUES (?, ?, ?, ?)`,
    [id, day, templateId, Date.now()]
  );
}

export async function clearSchedule(): Promise<void> {
  await execute("DELETE FROM weekly_schedule");
}

export async function getTodaySchedule(): Promise<ScheduleEntry | null> {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const row = await queryOne<ScheduleEntry>(
    `SELECT ws.id, ws.day_of_week, ws.template_id, ws.created_at,
            wt.name AS template_name,
            (SELECT COUNT(*) FROM template_exercises te WHERE te.template_id = ws.template_id) AS exercise_count
     FROM weekly_schedule ws
     JOIN workout_templates wt ON wt.id = ws.template_id
     WHERE ws.day_of_week = ?`,
    [day]
  );
  return row ?? null;
}

export async function isTodayCompleted(): Promise<boolean> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  const row = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM workout_sessions
     WHERE completed_at IS NOT NULL AND started_at >= ? AND started_at < ?`,
    [start, end]
  );
  return (row?.count ?? 0) > 0;
}

export async function getWeekAdherence(): Promise<{ day: number; scheduled: boolean; completed: boolean }[]> {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - offset);
  const monStart = monday.getTime();

  const schedule = await query<{ day_of_week: number }>(
    "SELECT day_of_week FROM weekly_schedule"
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
    const id = crypto.randomUUID();
    await database.runAsync(
      `INSERT INTO interaction_log (id, action, screen, detail, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      [id, action, screen, detail, Date.now()]
    );
    await database.runAsync(
      `DELETE FROM interaction_log WHERE id NOT IN (
        SELECT id FROM interaction_log ORDER BY timestamp DESC LIMIT 10
      )`
    );
  });
}

export async function getInteractions(): Promise<
  { id: string; action: string; screen: string; detail: string | null; timestamp: number }[]
> {
  return query(
    "SELECT * FROM interaction_log ORDER BY timestamp DESC LIMIT 10"
  );
}

export async function clearInteractions(): Promise<void> {
  await execute("DELETE FROM interaction_log");
}
