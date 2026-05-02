/* eslint-disable max-lines */
import type { WorkoutSession, MuscleGroup } from "../types";
import { eq, and, sql, isNotNull, ne, gt, max, count, desc, asc, gte, lt, inArray } from "drizzle-orm";
import { query, queryOne, getDrizzle } from "./helpers";
import { workoutSessions, workoutSets, exercises } from "./schema";
import { parseMuscleList } from "./muscle-format";

// ---- History & Calendar ----

export async function getSessionsByMonth(
  year: number,
  month: number
): Promise<(WorkoutSession & { set_count: number })[]> {
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime();
  return query<WorkoutSession & { set_count: number }>(
    `SELECT wss.*,
            (SELECT COUNT(*) FROM workout_sets ws WHERE ws.session_id = wss.id AND ws.completed = 1) AS set_count
     FROM workout_sessions wss
     WHERE wss.completed_at IS NOT NULL
       AND wss.started_at >= ? AND wss.started_at < ?
     ORDER BY wss.started_at DESC`,
    [start, end]
  );
}

export async function searchSessions(
  q: string,
  limit = 50
): Promise<(WorkoutSession & { set_count: number })[]> {
  return query<WorkoutSession & { set_count: number }>(
    `SELECT wss.*,
            (SELECT COUNT(*) FROM workout_sets ws WHERE ws.session_id = wss.id AND ws.completed = 1) AS set_count
     FROM workout_sessions wss
     WHERE wss.completed_at IS NOT NULL AND wss.name LIKE ?
     ORDER BY wss.started_at DESC
     LIMIT ?`,
    [`%${q}%`, limit]
  );
}

export async function getAllCompletedSessionWeeks(): Promise<number[]> {
  const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;
  const db = await getDrizzle();
  const rows = await db
    .select({ started_at: workoutSessions.started_at })
    .from(workoutSessions)
    .where(
      and(
        isNotNull(workoutSessions.completed_at),
        gte(workoutSessions.started_at, twoYearsAgo)
      )
    )
    .orderBy(desc(workoutSessions.started_at));
  return rows.map((r) => r.started_at);
}

// ---- Live PR Detection ----

export async function checkSetPR(
  exerciseId: string,
  weight: number,
  currentSessionId: string
): Promise<boolean> {
  if (!weight || weight <= 0) return false;
  const db = await getDrizzle();
  const rows = await db
    .select({ max_weight: max(workoutSets.weight) })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
    .where(
      and(
        eq(workoutSets.exercise_id, exerciseId),
        eq(workoutSets.completed, 1),
        isNotNull(workoutSets.weight),
        gt(workoutSets.weight, 0),
        ne(workoutSets.set_type, 'warmup'),
        isNotNull(workoutSessions.completed_at),
        ne(workoutSets.session_id, currentSessionId)
      )
    );
  const row = rows[0];
  if (!row || row.max_weight === null) return false;
  return weight > row.max_weight;
}

/**
 * BLD-541: PR detection for weighted bodyweight sets. Returns true when the
 * supplied signed modifier exceeds the absolute best for the exercise from
 * prior finished sessions. Assisted (negative) modifiers are evaluated on the
 * "least-assistance-ever" axis: more-negative is worse, less-negative is
 * better, so a new value of −10 kg is a PR over −20 kg.
 *
 * Returns false for null modifier (pure-bodyweight set), for exercises with
 * no prior weighted history on the same sign-axis, or when the new set does
 * not strictly exceed the prior best.
 */
export async function checkSetBodyweightModifierPR(
  exerciseId: string,
  modifierKg: number | null,
  currentSessionId: string
): Promise<boolean> {
  if (modifierKg == null) return false;
  const db = await getDrizzle();

  if (modifierKg > 0) {
    const rows = await db
      .select({ best: max(workoutSets.bodyweight_modifier_kg) })
      .from(workoutSets)
      .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
      .where(
        and(
          eq(workoutSets.exercise_id, exerciseId),
          eq(workoutSets.completed, 1),
          isNotNull(workoutSets.bodyweight_modifier_kg),
          gt(workoutSets.bodyweight_modifier_kg, 0),
          ne(workoutSets.set_type, 'warmup'),
          isNotNull(workoutSessions.completed_at),
          ne(workoutSets.session_id, currentSessionId)
        )
      );
    const prev = rows[0]?.best;
    if (prev == null) return true;
    return modifierKg > prev;
  }

  // modifierKg < 0 — assisted. "Better" = less negative = closer to zero.
  // SQLite MAX on negatives returns the value closest to zero, which is what
  // we want to compare against.
  const rows = await db
    .select({ best: max(workoutSets.bodyweight_modifier_kg) })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
    .where(
      and(
        eq(workoutSets.exercise_id, exerciseId),
        eq(workoutSets.completed, 1),
        isNotNull(workoutSets.bodyweight_modifier_kg),
        sql`${workoutSets.bodyweight_modifier_kg} < 0`,
        ne(workoutSets.set_type, 'warmup'),
        isNotNull(workoutSessions.completed_at),
        ne(workoutSets.session_id, currentSessionId)
      )
    );
  const prev = rows[0]?.best;
  if (prev == null) return true;
  return modifierKg > prev;
}

// ---- Progress Queries ----

export async function getWeeklySessionCounts(
  weeks = 8
): Promise<{ week: string; count: number }[]> {
  const cutoff = Date.now() - weeks * 7 * 24 * 60 * 60 * 1000;
  const weekStart = sql<number>`(${workoutSessions.started_at} / 604800000) * 604800000`;
  const db = await getDrizzle();
  const rows = await db
    .select({ week_start: weekStart, count: count() })
    .from(workoutSessions)
    .where(
      and(
        isNotNull(workoutSessions.completed_at),
        gte(workoutSessions.started_at, cutoff)
      )
    )
    .groupBy(weekStart)
    .orderBy(asc(weekStart));
  return rows.map((r) => {
    const d = new Date(r.week_start);
    return {
      week: `${d.getMonth() + 1}/${d.getDate()}`,
      count: r.count,
    };
  });
}

export async function getWeeklyVolume(
  weeks = 8
): Promise<{ week: string; volume: number }[]> {
  const cutoff = Date.now() - weeks * 7 * 24 * 60 * 60 * 1000;
  const weekStart = sql<number>`(${workoutSessions.started_at} / 604800000) * 604800000`;
  const volume = sql<number>`COALESCE(SUM(${workoutSets.weight} * ${workoutSets.reps}), 0)`;
  const db = await getDrizzle();
  const rows = await db
    .select({ week_start: weekStart, volume })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
    .where(
      and(
        eq(workoutSets.completed, 1),
        ne(workoutSets.set_type, 'warmup'),
        isNotNull(workoutSessions.completed_at),
        gte(workoutSessions.started_at, cutoff)
      )
    )
    .groupBy(weekStart)
    .orderBy(asc(weekStart));
  return rows.map((r) => {
    const d = new Date(r.week_start);
    return {
      week: `${d.getMonth() + 1}/${d.getDate()}`,
      volume: r.volume,
    };
  });
}

export async function getPersonalRecords(): Promise<
  { exercise_id: string; name: string; max_weight: number }[]
> {
  const db = await getDrizzle();
  const nameExpr = sql<string>`COALESCE(${exercises.name}, 'Deleted Exercise')`;
  const rows = await db
    .select({
      exercise_id: workoutSets.exercise_id,
      name: nameExpr,
      max_weight: max(workoutSets.weight),
    })
    .from(workoutSets)
    .leftJoin(exercises, eq(workoutSets.exercise_id, exercises.id))
    .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
    .where(
      and(
        eq(workoutSets.completed, 1),
        isNotNull(workoutSets.weight),
        gt(workoutSets.weight, 0),
        ne(workoutSets.set_type, 'warmup'),
        isNotNull(workoutSessions.completed_at)
      )
    )
    .groupBy(workoutSets.exercise_id)
    .orderBy(asc(nameExpr));
  return rows as { exercise_id: string; name: string; max_weight: number }[];
}

export async function getCompletedSessionsWithSetCount(
  limit = 10
): Promise<(WorkoutSession & { set_count: number })[]> {
  return query<WorkoutSession & { set_count: number }>(
    `SELECT wss.*,
            (SELECT COUNT(*) FROM workout_sets ws WHERE ws.session_id = wss.id AND ws.completed = 1) AS set_count
     FROM workout_sessions wss
     WHERE wss.completed_at IS NOT NULL
     ORDER BY wss.started_at DESC
     LIMIT ?`,
    [limit]
  );
}

// ---- Workout Insights (PR Detection) ----

export async function getMaxWeightByExercise(
  exerciseIds: string[],
  excludeSessionId: string
): Promise<Record<string, number>> {
  if (exerciseIds.length === 0) return {};
  const db = await getDrizzle();
  const rows = await db
    .select({
      exercise_id: workoutSets.exercise_id,
      max_weight: max(workoutSets.weight),
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
    .where(
      and(
        inArray(workoutSets.exercise_id, exerciseIds),
        ne(workoutSets.session_id, excludeSessionId),
        eq(workoutSets.completed, 1),
        isNotNull(workoutSets.weight),
        gt(workoutSets.weight, 0),
        ne(workoutSets.set_type, 'warmup'),
        isNotNull(workoutSessions.completed_at)
      )
    )
    .groupBy(workoutSets.exercise_id);
  const result: Record<string, number> = {};
  for (const r of rows) {
    if (r.max_weight !== null) result[r.exercise_id] = r.max_weight;
  }
  return result;
}

export async function getSessionPRs(
  sessionId: string
): Promise<{ exercise_id: string; name: string; weight: number; previous_max: number }[]> {
  return query<{ exercise_id: string; name: string; weight: number; previous_max: number }>(
    `SELECT cur.exercise_id,
            COALESCE(e.name, 'Deleted Exercise') AS name,
            cur.max_weight AS weight,
            hist.max_weight AS previous_max
     FROM (
       SELECT ws.exercise_id, MAX(ws.weight) AS max_weight
       FROM workout_sets ws
       WHERE ws.session_id = ?
         AND ws.completed = 1
         AND ws.weight IS NOT NULL
         AND ws.weight > 0
         AND ws.set_type != 'warmup'
       GROUP BY ws.exercise_id
     ) cur
     JOIN (
       SELECT ws.exercise_id, MAX(ws.weight) AS max_weight
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.session_id != ?
         AND ws.completed = 1
         AND ws.weight IS NOT NULL
         AND ws.weight > 0
         AND ws.set_type != 'warmup'
         AND wss.completed_at IS NOT NULL
       GROUP BY ws.exercise_id
     ) hist ON cur.exercise_id = hist.exercise_id
     LEFT JOIN exercises e ON cur.exercise_id = e.id
     WHERE cur.max_weight > hist.max_weight
     ORDER BY name ASC`,
    [sessionId, sessionId]
  );
}

export async function getRecentPRs(
  limit: number = 5
): Promise<{ exercise_id: string; name: string; weight: number; session_id: string; date: number }[]> {
  return query<{ exercise_id: string; name: string; weight: number; session_id: string; date: number }>(
    `SELECT ws.exercise_id,
            COALESCE(e.name, 'Deleted Exercise') AS name,
            MAX(ws.weight) AS weight,
            ws.session_id,
            wss.started_at AS date
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     LEFT JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.completed = 1
       AND ws.weight IS NOT NULL
       AND ws.weight > 0
       AND ws.set_type != 'warmup'
       AND wss.completed_at IS NOT NULL
       AND ws.weight > (SELECT MAX(ws2.weight)
          FROM workout_sets ws2
          JOIN workout_sessions wss2 ON ws2.session_id = wss2.id
          WHERE ws2.exercise_id = ws.exercise_id
            AND ws2.session_id != ws.session_id
            AND ws2.completed = 1
            AND ws2.weight IS NOT NULL
            AND ws2.weight > 0
            AND ws2.set_type != 'warmup'
            AND wss2.completed_at IS NOT NULL
            AND wss2.started_at < wss.started_at
         )
     GROUP BY ws.session_id, ws.exercise_id
     ORDER BY wss.started_at DESC
     LIMIT ?`,
    [limit]
  );
}

// ---- Post-Workout Summary ----

export async function getSessionRepPRs(
  sessionId: string
): Promise<{ exercise_id: string; name: string; reps: number; previous_max: number }[]> {
  return query<{ exercise_id: string; name: string; reps: number; previous_max: number }>(
    `SELECT cur.exercise_id,
            COALESCE(e.name, 'Deleted Exercise') AS name,
            cur.max_reps AS reps,
            hist.max_reps AS previous_max
     FROM (
       SELECT ws.exercise_id, MAX(ws.reps) AS max_reps
       FROM workout_sets ws
       WHERE ws.session_id = ?
         AND ws.completed = 1
         AND ws.set_type != 'warmup'
         AND ws.reps IS NOT NULL
         AND ws.reps > 0
         AND (ws.weight IS NULL OR ws.weight = 0)
       GROUP BY ws.exercise_id
     ) cur
     JOIN (
       SELECT ws.exercise_id, MAX(ws.reps) AS max_reps
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.session_id != ?
         AND ws.completed = 1
         AND ws.set_type != 'warmup'
         AND ws.reps IS NOT NULL
         AND ws.reps > 0
         AND (ws.weight IS NULL OR ws.weight = 0)
         AND wss.completed_at IS NOT NULL
       GROUP BY ws.exercise_id
     ) hist ON cur.exercise_id = hist.exercise_id
     LEFT JOIN exercises e ON cur.exercise_id = e.id
     WHERE cur.max_reps > hist.max_reps
     ORDER BY name ASC`,
    [sessionId, sessionId]
  );
}

export async function getSessionComparison(
  sessionId: string
): Promise<{
  previous: { volume: number; duration: number; sets: number } | null;
  current: { volume: number; duration: number; sets: number };
} | null> {
  const db = await getDrizzle();
  const sessionRows = await db
    .select({ template_id: workoutSessions.template_id, started_at: workoutSessions.started_at })
    .from(workoutSessions)
    .where(eq(workoutSessions.id, sessionId));
  const session = sessionRows[0];
  if (!session?.template_id) return null;

  const prevRows = await db
    .select({ id: workoutSessions.id, duration_seconds: workoutSessions.duration_seconds })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.template_id, session.template_id),
        ne(workoutSessions.id, sessionId),
        isNotNull(workoutSessions.completed_at)
      )
    )
    .orderBy(desc(workoutSessions.started_at))
    .limit(1);
  const prev = prevRows[0];
  if (!prev) return null;

  const volExpr = sql<number>`COALESCE(SUM(CASE WHEN ${workoutSets.weight} IS NOT NULL AND ${workoutSets.reps} IS NOT NULL THEN ${workoutSets.weight} * ${workoutSets.reps} ELSE 0 END), 0)`;
  const agg = async (sid: string) => {
    const rows = await db
      .select({ vol: volExpr, cnt: count() })
      .from(workoutSets)
      .where(
        and(
          eq(workoutSets.session_id, sid),
          eq(workoutSets.completed, 1),
          ne(workoutSets.set_type, 'warmup')
        )
      );
    const row = rows[0];
    return { volume: row?.vol ?? 0, sets: row?.cnt ?? 0 };
  };

  const curAgg = await agg(sessionId);
  const prevAgg = await agg(prev.id);

  const curSessionRows = await db
    .select({ duration_seconds: workoutSessions.duration_seconds })
    .from(workoutSessions)
    .where(eq(workoutSessions.id, sessionId));
  const curSession = curSessionRows[0];

  return {
    current: { ...curAgg, duration: curSession?.duration_seconds ?? 0 },
    previous: { ...prevAgg, duration: prev.duration_seconds ?? 0 },
  };
}

export async function getSessionWeightIncreases(
  sessionId: string
): Promise<{ exercise_id: string; name: string; current: number; previous: number }[]> {
  const db = await getDrizzle();
  const nameExpr = sql<string>`COALESCE(${exercises.name}, 'Deleted Exercise')`;
  const current = await db
    .select({
      exercise_id: workoutSets.exercise_id,
      name: nameExpr,
      max_weight: max(workoutSets.weight),
    })
    .from(workoutSets)
    .leftJoin(exercises, eq(workoutSets.exercise_id, exercises.id))
    .where(
      and(
        eq(workoutSets.session_id, sessionId),
        eq(workoutSets.completed, 1),
        ne(workoutSets.set_type, 'warmup'),
        isNotNull(workoutSets.weight),
        gt(workoutSets.weight, 0)
      )
    )
    .groupBy(workoutSets.exercise_id) as { exercise_id: string; name: string; max_weight: number }[];

  if (current.length === 0) return [];

  const sessionRows = await db
    .select({ started_at: workoutSessions.started_at })
    .from(workoutSessions)
    .where(eq(workoutSessions.id, sessionId));
  if (sessionRows.length === 0) return [];

  const result: { exercise_id: string; name: string; current: number; previous: number }[] = [];

  for (const ex of current) {
    const prev = await queryOne<{ max_weight: number }>(
      `SELECT MAX(ws.weight) AS max_weight
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.exercise_id = ?
         AND wss.id != ?
         AND wss.completed_at IS NOT NULL
         AND ws.completed = 1
         AND ws.set_type != 'warmup'
         AND ws.weight > 0
         AND wss.started_at = (
           SELECT MAX(wss2.started_at)
           FROM workout_sessions wss2
           JOIN workout_sets ws2 ON ws2.session_id = wss2.id
           WHERE ws2.exercise_id = ?
             AND wss2.id != ?
             AND wss2.completed_at IS NOT NULL
             AND ws2.completed = 1
         )`,
      [ex.exercise_id, sessionId, ex.exercise_id, sessionId]
    );

    if (prev?.max_weight && ex.max_weight > prev.max_weight) {
      result.push({
        exercise_id: ex.exercise_id,
        name: ex.name,
        current: ex.max_weight,
        previous: prev.max_weight,
      });
    }
  }

  return result;
}

// ---- Heatmap Queries ----

export async function getSessionCountsByDay(
  startTs: number,
  endTs: number
): Promise<{ date: string; count: number }[]> {
  const db = await getDrizzle();
  const dateExpr = sql<string>`date(${workoutSessions.started_at} / 1000, 'unixepoch', 'localtime')`;
  return db
    .select({ date: dateExpr, count: count() })
    .from(workoutSessions)
    .where(
      and(
        isNotNull(workoutSessions.completed_at),
        gte(workoutSessions.started_at, startTs),
        lt(workoutSessions.started_at, endTs)
      )
    )
    .groupBy(dateExpr)
    .orderBy(asc(dateExpr));
}

export async function getTotalSessionCount(): Promise<number> {
  const db = await getDrizzle();
  const rows = await db
    .select({ count: count() })
    .from(workoutSessions)
    .where(isNotNull(workoutSessions.completed_at));
  return rows[0]?.count ?? 0;
}

// ---- Muscle Volume Analysis ----

export async function getMuscleVolumeForWeek(
  weekStart: number
): Promise<{ muscle: MuscleGroup; sets: number; exercises: number }[]> {
  const end = weekStart + 7 * 24 * 60 * 60 * 1000;
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
        gte(workoutSessions.completed_at, weekStart),
        lt(workoutSessions.completed_at, end),
        eq(workoutSets.completed, 1),
        ne(workoutSets.set_type, 'warmup')
      )
    )
    .groupBy(workoutSets.exercise_id);

  const map = new Map<MuscleGroup, { sets: number; exercises: Set<string> }>();

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
      const entry = map.get(m) ?? { sets: 0, exercises: new Set<string>() };
      entry.sets += row.sets;
      entry.exercises.add(row.exercise_id);
      map.set(m, entry);
    }
  }

  return Array.from(map.entries())
    .map(([muscle, data]) => ({
      muscle,
      sets: data.sets,
      exercises: data.exercises.size,
    }))
    .sort((a, b) => b.sets - a.sets);
}

export async function getMuscleVolumeTrend(
  muscle: MuscleGroup,
  weeks: number
): Promise<{ week: string; sets: number }[]> {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - diff);

  const oldest = new Date(monday);
  oldest.setDate(oldest.getDate() - (weeks - 1) * 7);
  const end = new Date(monday);
  end.setDate(end.getDate() + 7);

  const db = await getDrizzle();
  const rows = await db
    .select({
      primary_muscles: exercises.primary_muscles,
      completed_at: workoutSessions.completed_at,
      sets: count(),
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
    .leftJoin(exercises, eq(workoutSets.exercise_id, exercises.id))
    .where(
      and(
        isNotNull(workoutSessions.completed_at),
        gte(workoutSessions.completed_at, oldest.getTime()),
        lt(workoutSessions.completed_at, end.getTime()),
        eq(workoutSets.completed, 1),
        ne(workoutSets.set_type, 'warmup')
      )
    )
    .groupBy(workoutSets.exercise_id, workoutSessions.id);

  const buckets = new Array<number>(weeks).fill(0);
  const oldestMs = oldest.getTime();

  for (const row of rows) {
    if (!row.primary_muscles) continue;
    try {
      const muscles: MuscleGroup[] = JSON.parse(row.primary_muscles);
      if (!muscles.includes(muscle)) continue;
    } catch {
      continue;
    }
    const idx = Math.floor((row.completed_at! - oldestMs) / (7 * 24 * 60 * 60 * 1000));
    if (idx >= 0 && idx < weeks) buckets[idx] += row.sets;
  }

  return buckets.map((sets, i) => {
    const d = new Date(oldest);
    d.setDate(d.getDate() + i * 7);
    return { week: `${d.getMonth() + 1}/${d.getDate()}`, sets };
  });
}

export async function getSessionDurationPRs(
  sessionId: string
): Promise<{ exercise_id: string; name: string; duration: number; previous_max: number }[]> {
  return query<{ exercise_id: string; name: string; duration: number; previous_max: number }>(
    `SELECT cur.exercise_id,
            COALESCE(e.name, 'Deleted Exercise') AS name,
            cur.max_duration AS duration,
            hist.max_duration AS previous_max
     FROM (
       SELECT ws.exercise_id, MAX(ws.duration_seconds) AS max_duration
       FROM workout_sets ws
       WHERE ws.session_id = ?
         AND ws.completed = 1
         AND ws.duration_seconds IS NOT NULL
         AND ws.duration_seconds > 0
         AND ws.set_type != 'warmup'
       GROUP BY ws.exercise_id
     ) cur
     JOIN (
       SELECT ws.exercise_id, MAX(ws.duration_seconds) AS max_duration
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.session_id != ?
         AND ws.completed = 1
         AND ws.duration_seconds IS NOT NULL
         AND ws.duration_seconds > 0
         AND ws.set_type != 'warmup'
         AND wss.completed_at IS NOT NULL
       GROUP BY ws.exercise_id
     ) hist ON cur.exercise_id = hist.exercise_id
     LEFT JOIN exercises e ON cur.exercise_id = e.id
     WHERE cur.max_duration > hist.max_duration
     ORDER BY name ASC`,
    [sessionId, sessionId]
  );
}

// ─── BLD-938: History Filters ────────────────────────────────────────────────

export type TemplateOption = {
  template_id: string;
  template_name: string;
  count: number;
  is_deleted: boolean;
};

export type DatePreset = "7d" | "30d" | "90d" | "year";

export type HistoryFilters = {
  templateId: string | null;
  muscleGroup: string | null;
  datePreset: DatePreset | null;
};

/**
 * Returns all templates that have at least one completed session, keyed by
 * the stable `template_id`. Uses a LEFT JOIN to `workout_templates` so
 * deleted templates still surface (their historical sessions remain
 * visible) — falling back to the most recent matching session's `name` and
 * marking the entry `is_deleted: true`.
 *
 * Ad-hoc / imported sessions (`template_id IS NULL`) are intentionally
 * excluded — they are surfaced via the muscle-group / date-range filters
 * or the unfiltered view, but not through Template filter (per QD R4).
 *
 * Sorted case-insensitively by current name.
 */
export async function getTemplatesWithSessions(): Promise<TemplateOption[]> {
  const rows = await query<{
    template_id: string;
    template_name: string;
    count: number;
    is_deleted: number;
  }>(
    `SELECT
       s.template_id AS template_id,
       COALESCE(t.name, (
         SELECT s2.name FROM workout_sessions s2
         WHERE s2.template_id = s.template_id AND s2.completed_at IS NOT NULL
         ORDER BY s2.completed_at DESC LIMIT 1
       )) AS template_name,
       COUNT(s.id) AS count,
       CASE WHEN t.id IS NULL THEN 1 ELSE 0 END AS is_deleted
     FROM workout_sessions s
     LEFT JOIN workout_templates t ON t.id = s.template_id
     WHERE s.completed_at IS NOT NULL AND s.template_id IS NOT NULL
     GROUP BY s.template_id
     ORDER BY template_name COLLATE NOCASE`
  );
  return rows.map((r) => ({
    template_id: r.template_id,
    template_name: r.template_name,
    count: r.count,
    is_deleted: r.is_deleted === 1,
  }));
}

/**
 * Returns the union of muscle groups (primary + secondary) used in
 * exercises that appear in the user's completed sessions. Handles BOTH
 * storage formats (JSON array, CSV) via `parseMuscleList`.
 *
 * Returned values are deduped and sorted alphabetically.
 */
export async function getMuscleGroupsWithSessions(): Promise<string[]> {
  const rows = await query<{ primary_muscles: string; secondary_muscles: string }>(
    `SELECT DISTINCT e.primary_muscles, e.secondary_muscles
     FROM exercises e
     WHERE e.id IN (
       SELECT DISTINCT ws.exercise_id
       FROM workout_sets ws
       WHERE ws.session_id IN (
         SELECT id FROM workout_sessions WHERE completed_at IS NOT NULL
       )
     )`
  );
  const all = new Set<string>();
  for (const row of rows) {
    for (const m of parseMuscleList(row.primary_muscles)) all.add(m);
    for (const m of parseMuscleList(row.secondary_muscles)) all.add(m);
  }
  return Array.from(all).sort();
}

/**
 * Composable filtered-sessions query. WHERE clauses are added per active
 * filter and AND-combined with the optional text search. Returns paged
 * rows plus the total (unpaged) count for the result-count UI.
 *
 * Muscle-group filter implementation
 * ----------------------------------
 * The exercises table stores `primary_muscles` and `secondary_muscles` in
 * one of two opaque formats (see `lib/db/muscle-format.ts`). Rather than
 * loading every exercise into JS, we use a 10-clause LIKE pattern on the
 * SQL side that covers both formats × both columns × four positional CSV
 * variants (only / start / middle / end) plus the JSON-quoted variant.
 *
 * PERF: see plan §"muscle group filter" — when the storage-format
 * normalization migration ships (separate tech-debt issue), this pattern
 * collapses to a single `EXISTS (... LIKE '%"x"%')` clause.
 *
 * Substring-collision safety: the JSON pattern requires surrounding `"`
 * and the CSV patterns require comma boundaries (or full-string match), so
 * a filter for `back` cannot match `upper_back` storage. Asserted by an
 * integration test in `__tests__/lib/db/history-filters.test.ts`.
 */
export async function getFilteredSessions(
  filters: HistoryFilters,
  textSearch: string,
  limit: number,
  offset: number
): Promise<{ rows: (WorkoutSession & { set_count: number })[]; total: number }> {
  const clauses: string[] = ["s.completed_at IS NOT NULL"];
  const params: (string | number)[] = [];

  if (filters.templateId) {
    clauses.push("s.template_id = ?");
    params.push(filters.templateId);
  }

  if (filters.datePreset) {
    const now = Date.now();
    const ms =
      filters.datePreset === "7d" ? 7 * 24 * 60 * 60 * 1000 :
      filters.datePreset === "30d" ? 30 * 24 * 60 * 60 * 1000 :
      filters.datePreset === "90d" ? 90 * 24 * 60 * 60 * 1000 :
      // "year"
      365 * 24 * 60 * 60 * 1000;
    clauses.push("s.started_at >= ?");
    params.push(now - ms);
  }

  if (textSearch.trim()) {
    clauses.push("s.name LIKE ?");
    params.push(`%${textSearch.trim()}%`);
  }

  if (filters.muscleGroup) {
    // 10-clause dual-format LIKE pattern. Same parameter is bound 10
    // times — SQLite re-uses positional `?N`, but to keep the SQL
    // portable across drivers we push the value 10 times instead.
    const m = filters.muscleGroup;
    clauses.push(
      `EXISTS (
         SELECT 1 FROM workout_sets ws2
         JOIN exercises e ON ws2.exercise_id = e.id
         WHERE ws2.session_id = s.id
           AND (
             /* JSON format match in primary_muscles */
             e.primary_muscles LIKE ?
             /* CSV format match in primary_muscles (only / start / middle / end) */
             OR e.primary_muscles = ?
             OR e.primary_muscles LIKE ?
             OR e.primary_muscles LIKE ?
             OR e.primary_muscles LIKE ?
             /* Same patterns for secondary_muscles */
             OR e.secondary_muscles LIKE ?
             OR e.secondary_muscles = ?
             OR e.secondary_muscles LIKE ?
             OR e.secondary_muscles LIKE ?
             OR e.secondary_muscles LIKE ?
           )
       )`
    );
    params.push(`%"${m}"%`); // JSON in primary
    params.push(m);            // CSV only in primary
    params.push(`${m},%`);     // CSV start in primary
    params.push(`%,${m},%`);   // CSV middle in primary
    params.push(`%,${m}`);     // CSV end in primary
    params.push(`%"${m}"%`); // JSON in secondary
    params.push(m);            // CSV only in secondary
    params.push(`${m},%`);     // CSV start in secondary
    params.push(`%,${m},%`);   // CSV middle in secondary
    params.push(`%,${m}`);     // CSV end in secondary
  }

  const whereClause = clauses.join(" AND ");

  // Get total count first (unpaged)
  const countRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM workout_sessions s WHERE ${whereClause}`,
    params
  );
  const total = countRow?.total ?? 0;

  // Paged rows
  const rows = await query<WorkoutSession & { set_count: number }>(
    `SELECT s.*,
            (SELECT COUNT(*) FROM workout_sets ws WHERE ws.session_id = s.id AND ws.completed = 1) AS set_count
     FROM workout_sessions s
     WHERE ${whereClause}
     ORDER BY s.started_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total };
}
