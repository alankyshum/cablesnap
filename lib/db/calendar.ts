import { query } from "./helpers";

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

  return query<WorkoutDay>(
    `SELECT date(started_at / 1000, 'unixepoch', 'localtime') as workout_date,
            COUNT(*) as session_count,
            COALESCE(SUM(duration_seconds), 0) as total_duration
     FROM workout_sessions
     WHERE completed_at IS NOT NULL
       AND started_at >= ? AND started_at < ?
     GROUP BY workout_date`,
    [start, end]
  );
}

// --- Day detail: sessions for a specific date ---

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
  const rows = await query<{ primary_muscles: string }>(
    `SELECT e.primary_muscles
     FROM workout_sets ws
     JOIN workout_sessions s ON ws.session_id = s.id
     JOIN exercises e ON ws.exercise_id = e.id
     WHERE date(s.started_at / 1000, 'unixepoch', 'localtime') = ?
       AND s.completed_at IS NOT NULL
       AND ws.completed = 1`,
    [dateStr]
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

  const rows = await query<{ d: string }>(
    `SELECT DISTINCT date(started_at / 1000, 'unixepoch', 'localtime') as d
     FROM workout_sessions
     WHERE completed_at IS NOT NULL
       AND started_at >= ?
     ORDER BY d DESC`,
    [cutoff]
  );

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
