import { and, sql, isNotNull, gte, lt, eq } from "drizzle-orm";
import { query, getDrizzle } from "./helpers";
import { workoutSessions, workoutSets, exercises } from "./schema";

// --- Types ---

export type WorkoutDay = {
  workout_date: string; // YYYY-MM-DD
  session_count: number;
  total_duration: number;
};

export type DayDetail = {
  id: string;
  name: string;
  started_at: number;
  duration_seconds: number | null;
  set_count: number;
  exercise_count: number;
};

// --- Monthly workout dates ---

export async function getMonthlyWorkoutDates(
  year: number,
  month: number
): Promise<WorkoutDay[]> {
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime();

  const db = await getDrizzle();
  const rows = await db
    .select({
      workout_date: sql<string>`date(${workoutSessions.started_at} / 1000, 'unixepoch', 'localtime')`,
      session_count: sql<number>`COUNT(*)`,
      total_duration: sql<number>`COALESCE(SUM(${workoutSessions.duration_seconds}), 0)`,
    })
    .from(workoutSessions)
    .where(
      and(
        isNotNull(workoutSessions.completed_at),
        gte(workoutSessions.started_at, start),
        lt(workoutSessions.started_at, end)
      )
    )
    .groupBy(sql`workout_date`);

  return rows as unknown as WorkoutDay[];
}

// --- Day detail: sessions for a specific date (KEEP RAW — correlated subqueries) ---

export async function getDaySessionDetails(
  dateStr: string
): Promise<DayDetail[]> {
  return query<DayDetail>(
    `SELECT s.id, s.name, s.started_at, s.duration_seconds,
            (SELECT COUNT(*) FROM workout_sets ws WHERE ws.session_id = s.id AND ws.completed = 1) as set_count,
            (SELECT COUNT(DISTINCT ws.exercise_id) FROM workout_sets ws WHERE ws.session_id = s.id AND ws.completed = 1) as exercise_count
     FROM workout_sessions s
     WHERE s.completed_at IS NOT NULL
       AND date(s.started_at / 1000, 'unixepoch', 'localtime') = ?
     ORDER BY s.started_at ASC`,
    [dateStr]
  );
}

// --- Muscle groups for a specific date ---

export async function getDayMuscleGroups(dateStr: string): Promise<string[]> {
  const db = await getDrizzle();
  const rows = await db
    .select({ primary_muscles: exercises.primary_muscles })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
    .innerJoin(exercises, eq(workoutSets.exercise_id, exercises.id))
    .where(
      and(
        sql`date(${workoutSessions.started_at} / 1000, 'unixepoch', 'localtime') = ${dateStr}`,
        isNotNull(workoutSessions.completed_at),
        eq(workoutSets.completed, 1)
      )
    );

  const all: string[] = [];
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.primary_muscles);
      if (Array.isArray(parsed)) {
        all.push(...parsed);
      }
    } catch {
      // skip malformed rows
    }
  }
  return [...new Set(all)];
}

// --- Streak data ---

export async function getWorkoutDatesForStreak(): Promise<string[]> {
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;

  const db = await getDrizzle();
  const rows = await db
    .select({
      d: sql<string>`DISTINCT date(${workoutSessions.started_at} / 1000, 'unixepoch', 'localtime')`,
    })
    .from(workoutSessions)
    .where(
      and(
        isNotNull(workoutSessions.completed_at),
        gte(workoutSessions.started_at, cutoff)
      )
    )
    .orderBy(sql`d DESC`);

  return rows.map((r) => r.d);
}

// --- Pure streak calculation (exported for testing) ---

export function calculateStreaks(sortedDatesDesc: string[]): {
  currentStreak: number;
  longestStreak: number;
} {
  if (sortedDatesDesc.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatDateISO(today);
  const yesterdayStr = formatDateISO(
    new Date(today.getTime() - 24 * 60 * 60 * 1000)
  );

  // Current streak: must include today or yesterday
  let currentStreak = 0;
  const firstDate = sortedDatesDesc[0];
  if (firstDate === todayStr || firstDate === yesterdayStr) {
    currentStreak = 1;
    for (let i = 1; i < sortedDatesDesc.length; i++) {
      const prev = parseDate(sortedDatesDesc[i - 1]);
      const curr = parseDate(sortedDatesDesc[i]);
      const diffMs = prev.getTime() - curr.getTime();
      if (diffMs === 24 * 60 * 60 * 1000) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  // Longest streak
  let longestStreak = 1;
  let streak = 1;
  for (let i = 1; i < sortedDatesDesc.length; i++) {
    const prev = parseDate(sortedDatesDesc[i - 1]);
    const curr = parseDate(sortedDatesDesc[i]);
    const diffMs = prev.getTime() - curr.getTime();
    if (diffMs === 24 * 60 * 60 * 1000) {
      streak++;
      longestStreak = Math.max(longestStreak, streak);
    } else {
      streak = 1;
    }
  }

  return { currentStreak, longestStreak };
}

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// --- Calendar date utilities (exported for testing) ---

export function getMonthDays(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfWeek(
  year: number,
  month: number,
  weekStartDay: number
): number {
  // weekStartDay: 0 = Sunday, 1 = Monday, etc.
  const firstDay = new Date(year, month, 1).getDay(); // 0-6, Sunday=0
  return (firstDay - weekStartDay + 7) % 7;
}

export function generateCalendarGrid(
  year: number,
  month: number,
  weekStartDay: number
): (number | null)[] {
  const daysInMonth = getMonthDays(year, month);
  const offset = getFirstDayOfWeek(year, month, weekStartDay);

  const grid: (number | null)[] = [];
  // Leading empty cells
  for (let i = 0; i < offset; i++) {
    grid.push(null);
  }
  // Day numbers
  for (let d = 1; d <= daysInMonth; d++) {
    grid.push(d);
  }
  return grid;
}

export function getWeekDayLabels(weekStartDay: number): string[] {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const labels: string[] = [];
  for (let i = 0; i < 7; i++) {
    labels.push(days[(weekStartDay + i) % 7]);
  }
  return labels;
}

export function formatMonthYear(year: number, month: number): string {
  const date = new Date(year, month, 1);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function dateToISO(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}
