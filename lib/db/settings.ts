import { eq, and, sql, asc, isNull, isNotNull, gte, lt } from "drizzle-orm";
import { getDrizzle, getDatabase } from "./helpers";
import { appSettings, interactionLog, workoutSessions, programSchedule, workoutTemplates, programs } from "./schema";
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
  const db = await getDrizzle();
  return db.select({
    id: programSchedule.program_id,
    day_of_week: programSchedule.day_of_week,
    template_id: programSchedule.template_id,
    created_at: sql<number>`0`,
    template_name: workoutTemplates.name,
    exercise_count: sql<number>`(SELECT COUNT(*) FROM template_exercises te WHERE te.template_id = ${programSchedule.template_id})`,
  })
    .from(programSchedule)
    .innerJoin(workoutTemplates, eq(workoutTemplates.id, programSchedule.template_id))
    .innerJoin(programs, and(eq(programs.id, programSchedule.program_id), eq(programs.is_active, 1), isNull(programs.deleted_at)))
    .orderBy(asc(programSchedule.day_of_week)) as unknown as Promise<ScheduleEntry[]>;
}

export async function getTodaySchedule(): Promise<ScheduleEntry | null> {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const db = await getDrizzle();
  const row = await db.select({
    id: programSchedule.program_id,
    day_of_week: programSchedule.day_of_week,
    template_id: programSchedule.template_id,
    created_at: sql<number>`0`,
    template_name: workoutTemplates.name,
    exercise_count: sql<number>`(SELECT COUNT(*) FROM template_exercises te WHERE te.template_id = ${programSchedule.template_id})`,
  })
    .from(programSchedule)
    .innerJoin(workoutTemplates, eq(workoutTemplates.id, programSchedule.template_id))
    .innerJoin(programs, and(eq(programs.id, programSchedule.program_id), eq(programs.is_active, 1), isNull(programs.deleted_at)))
    .where(eq(programSchedule.day_of_week, day))
    .get();
  return (row as unknown as ScheduleEntry) ?? null;
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
  const monEnd = monStart + 7 * 24 * 60 * 60 * 1000;

  const db = await getDrizzle();

  const schedule = await db.select({ day_of_week: programSchedule.day_of_week })
    .from(programSchedule)
    .innerJoin(programs, and(eq(programs.id, programSchedule.program_id), eq(programs.is_active, 1), isNull(programs.deleted_at)));
  const scheduled = new Set(schedule.map((s) => s.day_of_week));

  const sessions = await db.select({ started_at: workoutSessions.started_at })
    .from(workoutSessions)
    .where(and(
      isNotNull(workoutSessions.completed_at),
      gte(workoutSessions.started_at, monStart),
      lt(workoutSessions.started_at, monEnd),
    ));

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
  const db = await getDrizzle();
  await database.withTransactionAsync(async () => {
    const id = uuid();
    await db.insert(interactionLog).values({
      id,
      action,
      screen,
      detail,
      timestamp: Date.now(),
    });
    await db.delete(interactionLog).where(
      sql`${interactionLog.id} NOT IN (SELECT id FROM interaction_log ORDER BY timestamp DESC LIMIT 5)`
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
    .limit(5);
}

export async function clearInteractions(): Promise<void> {
  const db = await getDrizzle();
  await db.delete(interactionLog);
}
