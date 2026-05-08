/**
 * BLD-1089: Grease-the-Groove Day Mode — pure database module.
 *
 * A "day session" is a workout_sessions row with kind='day_session'. It acts
 * as a backing store for quick-add sets logged outside a normal workout.
 *
 * Key invariants (see PLAN-BLD-1088.md):
 *  - completed_at = started_at = device-local midnight (passes WHERE completed_at IS NOT NULL)
 *  - (day_session_exercise_id, day_session_date) is unique per exercise per day
 *  - workout_sets.session_id is never NULL — every GTG set points at a backing row
 */
import { uuid } from "../uuid";
import { getDatabase, withTransaction } from "./helpers";
import type { SQLiteDatabase } from "expo-sqlite";

// ─── Types ─────────────────────────────────────────────────────────

export type QuickAddExerciseChip = {
  exercise_id: string;
  exercise_name: string;
  last_reps: number | null;
  last_weight: number | null;
  last_added_at: number;
};

export type TodayGtgSummaryRow = {
  exercise_id: string;
  exercise_name: string;
  total_reps: number;
  set_count: number;
  /** JSON array of epoch ms timestamps for each set, used for sparkline */
  set_times: string;
  day_session_id: string;
};

export type AddQuickAddSetParams = {
  exerciseId: string;
  reps: number;
  weight?: number | null;
};

export type AddQuickAddSetResult = {
  setId: string;
  sessionId: string;
  todayTotal: number;
};

// ─── Date helpers ──────────────────────────────────────────────────

/** Device-local midnight epoch ms for a given date (or today). */
export function localMidnightMs(date: Date = new Date()): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** YYYY-MM-DD string for today in device-local time. */
export function todayDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ─── Core helpers ──────────────────────────────────────────────────

/**
 * UPSERT a backing day_session row for (exerciseId, today).
 * Uses DO UPDATE SET name = excluded.name (no-op update) to force RETURNING
 * even when the row already exists. Wrapped in the caller's transaction.
 *
 * AC25: two consecutive calls return the same row id.
 */
async function upsertDaySession(
  db: SQLiteDatabase,
  exerciseId: string,
  exerciseName: string,
  dateKey: string,
  midnightMs: number
): Promise<string> {
  const newId = uuid();
  const row = await db.getFirstAsync<{ id: string }>(
    `INSERT INTO workout_sessions
       (id, kind, name, started_at, completed_at, day_session_exercise_id, day_session_date)
     VALUES (?, 'day_session', ?, ?, ?, ?, ?)
     ON CONFLICT(day_session_exercise_id, day_session_date)
       WHERE kind = 'day_session'
       DO UPDATE SET name = excluded.name
     RETURNING id`,
    [newId, `GTG: ${exerciseName}`, midnightMs, midnightMs, exerciseId, dateKey]
  );

  // Fallback: if partial index isn't supported (some older SQLite builds),
  // try a plain INSERT OR IGNORE + SELECT.
  if (!row) {
    const existing = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM workout_sessions
       WHERE kind = 'day_session'
         AND day_session_exercise_id = ?
         AND day_session_date = ?`,
      [exerciseId, dateKey]
    );
    if (existing) return existing.id;
    // No existing row and INSERT failed — insert without ON CONFLICT
    await db.runAsync(
      `INSERT OR IGNORE INTO workout_sessions
         (id, kind, name, started_at, completed_at, day_session_exercise_id, day_session_date)
       VALUES (?, 'day_session', ?, ?, ?, ?, ?)`,
      [newId, `GTG: ${exerciseName}`, midnightMs, midnightMs, exerciseId, dateKey]
    );
    return newId;
  }

  return row.id;
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Add a quick-add set for an exercise and return the new set id.
 *
 * The UPSERT of the backing day_session row and the workout_sets INSERT are
 * wrapped in a single transaction (AC22 — atomic).
 */
export async function addQuickAddSet(
  params: AddQuickAddSetParams,
  now: Date = new Date()
): Promise<AddQuickAddSetResult> {
  const { exerciseId, reps, weight = null } = params;
  const dateKey = todayDateKey(now);
  const midnightMs = localMidnightMs(now);

  // Fetch exercise name (needed for the backing row name)
  const db = await getDatabase();
  const exercise = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM exercises WHERE id = ?",
    [exerciseId]
  );
  const exerciseName = exercise?.name ?? "Exercise";

  let setId!: string;
  let sessionId!: string;

  await withTransaction(async (txDb) => {
    sessionId = await upsertDaySession(
      txDb,
      exerciseId,
      exerciseName,
      dateKey,
      midnightMs
    );

    // Compute next set_number for this (session, exercise) pair
    const countRow = await txDb.getFirstAsync<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM workout_sets WHERE session_id = ? AND exercise_id = ?",
      [sessionId, exerciseId]
    );
    const setNumber = (countRow?.cnt ?? 0) + 1;
    setId = uuid();
    const nowMs = now.getTime();

    await txDb.runAsync(
      `INSERT INTO workout_sets
         (id, session_id, exercise_id, set_number, weight, reps,
          completed, completed_at, set_type)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'normal')`,
      [setId, sessionId, exerciseId, setNumber, weight, reps, nowMs]
    );
  });

  // Fetch today's running total for the confirmation toast
  const totalRow = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(ws.reps), 0) AS total
     FROM workout_sets ws
     JOIN workout_sessions wss ON wss.id = ws.session_id
     WHERE wss.kind = 'day_session'
       AND wss.day_session_exercise_id = ?
       AND wss.day_session_date = ?
       AND ws.completed = 1`,
    [exerciseId, dateKey]
  );

  return {
    setId,
    sessionId,
    todayTotal: totalRow?.total ?? reps,
  };
}

/**
 * Remove a quick-add set (Undo). If it was the only set in the backing
 * day_session row, that backing row is also hard-deleted (AC8/AC18).
 */
export async function removeQuickAddSet(setId: string): Promise<void> {
  const db = await getDatabase();

  const setRow = await db.getFirstAsync<{ session_id: string }>(
    "SELECT session_id FROM workout_sets WHERE id = ?",
    [setId]
  );
  if (!setRow) return;

  await withTransaction(async (txDb) => {
    await txDb.runAsync("DELETE FROM workout_sets WHERE id = ?", [setId]);

    // Check if any sets remain for this backing session
    const remainRow = await txDb.getFirstAsync<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM workout_sets WHERE session_id = ?",
      [setRow.session_id]
    );

    if ((remainRow?.cnt ?? 0) === 0) {
      // Verify it really is a day_session before deleting
      const sessionRow = await txDb.getFirstAsync<{ kind: string }>(
        "SELECT kind FROM workout_sessions WHERE id = ?",
        [setRow.session_id]
      );
      if (sessionRow?.kind === "day_session") {
        await txDb.runAsync(
          "DELETE FROM workout_sessions WHERE id = ?",
          [setRow.session_id]
        );
      }
    }
  });
}

/**
 * Get today's GTG summary grouped by exercise (for the "Today's GTG" card).
 * Returns one row per exercise that has quick-add sets today.
 */
export async function getTodayQuickAddSummary(
  now: Date = new Date()
): Promise<TodayGtgSummaryRow[]> {
  const dateKey = todayDateKey(now);
  const db = await getDatabase();
  return db.getAllAsync<TodayGtgSummaryRow>(
    `SELECT
       wss.day_session_exercise_id AS exercise_id,
       COALESCE(e.name, 'Deleted Exercise') AS exercise_name,
       COALESCE(SUM(ws.reps), 0) AS total_reps,
       COUNT(ws.id) AS set_count,
       json_group_array(ws.completed_at ORDER BY ws.completed_at ASC) AS set_times,
       wss.id AS day_session_id
     FROM workout_sessions wss
     LEFT JOIN workout_sets ws ON ws.session_id = wss.id AND ws.completed = 1
     LEFT JOIN exercises e ON e.id = wss.day_session_exercise_id
     WHERE wss.kind = 'day_session'
       AND wss.day_session_date = ?
     GROUP BY wss.id
     ORDER BY MAX(ws.completed_at) DESC`,
    [dateKey]
  );
}

/**
 * Recent exercises used in Quick Add (last N days, limited to maxResults).
 * Ordered by most recently used. AC2.
 */
export async function listRecentQuickAddExercises(
  days = 7,
  maxResults = 6,
  now: Date = new Date()
): Promise<QuickAddExerciseChip[]> {
  const since = now.getTime() - days * 24 * 60 * 60 * 1000;
  const db = await getDatabase();
  return db.getAllAsync<QuickAddExerciseChip>(
    `SELECT
       wss.day_session_exercise_id AS exercise_id,
       COALESCE(e.name, 'Deleted Exercise') AS exercise_name,
       (SELECT ws2.reps
        FROM workout_sets ws2
        WHERE ws2.session_id IN (
          SELECT id FROM workout_sessions
          WHERE kind = 'day_session' AND day_session_exercise_id = wss.day_session_exercise_id
        ) AND ws2.completed = 1
        ORDER BY ws2.completed_at DESC
        LIMIT 1) AS last_reps,
       (SELECT ws2.weight
        FROM workout_sets ws2
        WHERE ws2.session_id IN (
          SELECT id FROM workout_sessions
          WHERE kind = 'day_session' AND day_session_exercise_id = wss.day_session_exercise_id
        ) AND ws2.completed = 1
        ORDER BY ws2.completed_at DESC
        LIMIT 1) AS last_weight,
       MAX(ws.completed_at) AS last_added_at
     FROM workout_sessions wss
     JOIN workout_sets ws ON ws.session_id = wss.id AND ws.completed = 1
     LEFT JOIN exercises e ON e.id = wss.day_session_exercise_id
     WHERE wss.kind = 'day_session'
       AND ws.completed_at >= ?
     GROUP BY wss.day_session_exercise_id
     ORDER BY last_added_at DESC
     LIMIT ?`,
    [since, maxResults]
  );
}

/**
 * List all day_session rows for a given date string (YYYY-MM-DD).
 * Used by history tab for "Quick-add sets" group.
 */
export async function listDaySessionsForDate(dateKey: string): Promise<{
  id: string;
  exercise_id: string;
  exercise_name: string;
  total_reps: number;
  set_count: number;
  started_at: number;
}[]> {
  const db = await getDatabase();
  return db.getAllAsync(
    `SELECT
       wss.id,
       wss.day_session_exercise_id AS exercise_id,
       COALESCE(e.name, 'Deleted Exercise') AS exercise_name,
       COALESCE(SUM(ws.reps), 0) AS total_reps,
       COUNT(ws.id) AS set_count,
       wss.started_at
     FROM workout_sessions wss
     LEFT JOIN workout_sets ws ON ws.session_id = wss.id AND ws.completed = 1
     LEFT JOIN exercises e ON e.id = wss.day_session_exercise_id
     WHERE wss.kind = 'day_session'
       AND wss.day_session_date = ?
     GROUP BY wss.id
     ORDER BY wss.started_at ASC`,
    [dateKey]
  );
}

export type DaySessionEntry = {
  id: string;
  exercise_id: string;
  exercise_name: string;
  total_reps: number;
  set_count: number;
  date_key: string;
};

/**
 * List recent GTG day sessions grouped by date, for the last N days.
 * Used by history tab to render "Quick-add sets" groups.
 */
export async function listRecentDaySessions(
  days = 30,
  now: Date = new Date()
): Promise<DaySessionEntry[]> {
  const since = localMidnightMs(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
  const db = await getDatabase();
  return db.getAllAsync<DaySessionEntry>(
    `SELECT
       wss.id,
       wss.day_session_exercise_id AS exercise_id,
       COALESCE(e.name, 'Deleted Exercise') AS exercise_name,
       COALESCE(SUM(ws.reps), 0) AS total_reps,
       COUNT(ws.id) AS set_count,
       wss.day_session_date AS date_key
     FROM workout_sessions wss
     LEFT JOIN workout_sets ws ON ws.session_id = wss.id AND ws.completed = 1
     LEFT JOIN exercises e ON e.id = wss.day_session_exercise_id
     WHERE wss.kind = 'day_session'
       AND wss.started_at >= ?
     GROUP BY wss.id
     ORDER BY wss.started_at DESC`,
    [since]
  );
}
