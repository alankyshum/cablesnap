/**
 * DB helpers for Training-Day Macro Adjustment — workout-day classification.
 *
 * Determines whether a given date had a real logged workout, using the same
 * kind='workout' filter used by calendar.ts and monthly-report.ts (BLD-1089).
 *
 * CRITICAL: GTG (Grease-the-Groove) sessions have kind='day_session'.
 * They MUST NOT count as training days for macro-adjustment purposes — counting
 * them would wrongly inflate calorie targets. The WHERE clause must always
 * include `kind = 'workout'` (AC6).
 *
 * @see lib/db/calendar.ts:getMonthlyWorkoutDates — the canonical kind='workout' pattern
 * @see lib/db/monthly-report.ts:getMonthlyTrainingDaysAndStreak — the other correctly-filtered query
 * @see __tests__/lib/db/streak-creep-production.test.ts — GTG regression test (BLD-1089)
 */

import { query } from "./helpers";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A date key string in YYYY-MM-DD format (matches formatDateKey in lib/format.ts).
 * The DB uses `date(started_at / 1000, 'unixepoch', 'localtime')` to produce
 * the same format from epoch-ms timestamps.
 */
export type DateKey = string;

// ─── wasWorkoutDay ────────────────────────────────────────────────────────────

/**
 * Returns true if the given date (local YYYY-MM-DD) has at least one completed
 * workout session with kind='workout' (not a GTG day_session — AC6).
 *
 * Used by the Training-Day Macro Adjustment feature to classify a displayed date
 * as a training day or rest day.
 *
 * @param dateKey  Local date in YYYY-MM-DD format (e.g. from formatDateKey()).
 * @returns        true if a qualifying workout was completed on that date.
 */
export async function wasWorkoutDay(dateKey: DateKey): Promise<boolean> {
  const row = await query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt
     FROM workout_sessions
     WHERE completed_at IS NOT NULL
       AND kind = 'workout'
       AND date(started_at / 1000, 'unixepoch', 'localtime') = ?`,
    [dateKey]
  );
  return (row[0]?.cnt ?? 0) > 0;
}

// ─── getWorkoutDaysInRange ────────────────────────────────────────────────────

/**
 * Returns the set of local date strings (YYYY-MM-DD) in [startDateKey, endDateKey]
 * that had at least one completed workout (kind='workout').
 *
 * Useful for batch pre-loading day-type classifications when rendering a date range
 * (e.g. a week or month view) without N+1 DB queries.
 *
 * Both bounds are inclusive. Date strings are compared lexicographically (ISO format
 * ensures correct ordering).
 *
 * @param startDateKey  Start of range (inclusive), YYYY-MM-DD.
 * @param endDateKey    End of range (inclusive), YYYY-MM-DD.
 * @returns             Set of date strings that are training days in the range.
 */
export async function getWorkoutDaysInRange(
  startDateKey: DateKey,
  endDateKey: DateKey
): Promise<Set<DateKey>> {
  const rows = await query<{ d: DateKey }>(
    `SELECT DISTINCT date(started_at / 1000, 'unixepoch', 'localtime') AS d
     FROM workout_sessions
     WHERE completed_at IS NOT NULL
       AND kind = 'workout'
       AND date(started_at / 1000, 'unixepoch', 'localtime') >= ?
       AND date(started_at / 1000, 'unixepoch', 'localtime') <= ?`,
    [startDateKey, endDateKey]
  );
  return new Set(rows.map((r) => r.d));
}
