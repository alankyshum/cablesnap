import { eq, ne, and, sql, desc, asc, isNotNull, isNull, inArray, max, sum, count } from "drizzle-orm";
import { query, queryOne, getDrizzle } from "./helpers";
import { workoutSets, workoutSessions, exercises } from "./schema";
import { mapRow } from "./exercises";
import type { Exercise, Attachment, MountPosition } from "../types";

/**
 * BLD-788: variant scope for analytics queries.
 *
 * Each field is independent:
 *   - `attachment === undefined` → no constraint on attachment dimension.
 *   - `attachment === null`      → match rows where attachment IS NULL.
 *   - `attachment === <value>`   → match rows where attachment = <value>.
 *
 * Same shape for `mount_position`. The default ("All variants") passes an
 * empty object — both fields undefined.
 *
 * Read-only filter; never mutates `workout_sets`.
 */
export type VariantScope = {
  attachment?: Attachment | null;
  mount_position?: MountPosition | null;
};

export type ExerciseSession = {
  session_id: string;
  session_name: string;
  started_at: number;
  max_weight: number;
  max_reps: number;
  total_reps: number;
  set_count: number;
  volume: number;
  avg_rpe: number | null;
  // BLD-541: signed best modifier in the session (kg). null when no weighted
  // bodyweight set exists for the exercise in this session (or for pure
  // weighted exercises — the column stays null on non-bodyweight rows).
  max_modifier: number | null;
};

export type ExerciseRecords = {
  max_weight: number | null;
  max_reps: number | null;
  max_volume: number | null;
  est_1rm: number | null;
  total_sessions: number;
  is_bodyweight: boolean;
  max_duration: number | null;
  // BLD-541: best added / assisted weighted-BW all-time bests (kg).
  best_added_kg: number | null;
  best_assisted_kg: number | null;
};

export async function getExerciseHistory(
  exerciseId: string,
  limit: number = 10,
  offset: number = 0
): Promise<ExerciseSession[]> {
  const db = await getDrizzle();
  const rows = await db
    .select({
      session_id: workoutSessions.id,
      session_name: workoutSessions.name,
      started_at: workoutSessions.started_at,
      max_weight: max(workoutSets.weight),
      max_reps: max(workoutSets.reps),
      total_reps: sum(workoutSets.reps),
      set_count: count(workoutSets.id),
      volume: sql<number>`SUM(${workoutSets.weight} * ${workoutSets.reps})`,
      avg_rpe: sql<number | null>`AVG(CASE WHEN ${workoutSets.rpe} IS NOT NULL THEN ${workoutSets.rpe} END)`,
      max_modifier: sql<number | null>`MAX(${workoutSets.bodyweight_modifier_kg})`,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
    .where(
      and(
        eq(workoutSets.exercise_id, exerciseId),
        eq(workoutSets.completed, 1),
        ne(workoutSets.set_type, 'warmup'),
        isNotNull(workoutSessions.completed_at)
      )
    )
    .groupBy(workoutSessions.id)
    .orderBy(desc(workoutSessions.started_at))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    session_id: r.session_id,
    session_name: r.session_name,
    started_at: r.started_at,
    max_weight: Number(r.max_weight ?? 0),
    max_reps: Number(r.max_reps ?? 0),
    total_reps: Number(r.total_reps ?? 0),
    set_count: r.set_count,
    volume: Number(r.volume ?? 0),
    avg_rpe: r.avg_rpe != null ? Number(r.avg_rpe) : null,
    max_modifier: r.max_modifier != null ? Number(r.max_modifier) : null,
  }));
}

/**
 * BLD-788: build the variant SQL fragment for raw queries.
 *
 * Returns `{ sql: " AND ws.attachment = ? AND ws.mount_position IS NULL", params: [...] }`.
 * Empty fragment (`""`, `[]`) when `scope` is undefined or has no dimensions set.
 *
 * Caller is responsible for placing the fragment in a position where the
 * `ws` alias is bound to `workout_sets`.
 */
export function buildVariantSql(scope?: VariantScope): { sql: string; params: (string | null)[] } {
  if (!scope) return { sql: "", params: [] };
  const parts: string[] = [];
  const params: (string | null)[] = [];

  if (scope.attachment !== undefined) {
    if (scope.attachment === null) {
      parts.push("ws.attachment IS NULL");
    } else {
      parts.push("ws.attachment = ?");
      params.push(scope.attachment);
    }
  }
  if (scope.mount_position !== undefined) {
    if (scope.mount_position === null) {
      parts.push("ws.mount_position IS NULL");
    } else {
      parts.push("ws.mount_position = ?");
      params.push(scope.mount_position);
    }
  }
  if (parts.length === 0) return { sql: "", params: [] };
  return { sql: " AND " + parts.join(" AND "), params };
}

/**
 * BLD-788: Drizzle-flavored variant predicate. Returns SQL fragments to AND
 * into a Drizzle `where()` chain. Returns `[]` when scope is empty.
 */
function variantDrizzleConditions(scope?: VariantScope) {
  const conds: ReturnType<typeof eq | typeof isNull>[] = [];
  if (!scope) return conds;
  if (scope.attachment !== undefined) {
    conds.push(scope.attachment === null
      ? isNull(workoutSets.attachment)
      : eq(workoutSets.attachment, scope.attachment));
  }
  if (scope.mount_position !== undefined) {
    conds.push(scope.mount_position === null
      ? isNull(workoutSets.mount_position)
      : eq(workoutSets.mount_position, scope.mount_position));
  }
  return conds;
}

/**
 * BLD-788: count of sets on a given exercise that have at least one variant
 * field populated (used for the "All variants (N logged)" header badge).
 *
 * Counts completed, non-warmup sets in completed sessions where attachment
 * or mount_position is non-null.
 *
 * When `scope` is supplied, counts sets matching the active filter exactly
 * (used for the "Showing: Rope · High (12 logged)" active-state badge).
 * When `scope` is omitted or empty, returns the global "any variant"
 * count for the default-state badge.
 */
export async function getVariantSetCount(
  exerciseId: string,
  scope?: VariantScope,
): Promise<number> {
  const variantSql = buildVariantSql(scope);
  // When scope is genuinely empty (no constrained dimensions), retain the
  // original "any variant logged" gate so the default badge reports total
  // variant adoption. We check sql === "" rather than params.length === 0
  // because explicit-null scopes like {attachment: null} produce non-empty SQL
  // ("AND ws.attachment IS NULL") but empty params — using params.length would
  // incorrectly trigger the adoption gate for a legitimate filter.
  const adoptionGate = variantSql.sql === ""
    ? " AND (ws.attachment IS NOT NULL OR ws.mount_position IS NOT NULL)"
    : "";
  const row = await queryOne<{ n: number | null }>(
    `SELECT COUNT(*) AS n
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
      WHERE ws.exercise_id = ?
        AND ws.completed = 1
        AND ws.set_type != 'warmup'
        AND wss.completed_at IS NOT NULL${adoptionGate}${variantSql.sql}`,
    [exerciseId, ...variantSql.params]
  );
  return Number(row?.n ?? 0);
}

export async function getExerciseRecords(
  exerciseId: string,
  scope?: VariantScope
): Promise<ExerciseRecords> {
  const db = await getDrizzle();
  const variantConds = variantDrizzleConditions(scope);

  const baseWhere = and(
    eq(workoutSets.exercise_id, exerciseId),
    eq(workoutSets.completed, 1),
    ne(workoutSets.set_type, 'warmup'),
    isNotNull(workoutSessions.completed_at),
    ...variantConds
  );

  // Simple aggregates via Drizzle
  const [weight, reps, countResult, dur] = await Promise.all([
    db
      .select({ val: max(workoutSets.weight) })
      .from(workoutSets)
      .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
      .where(and(baseWhere, sql`${workoutSets.weight} > 0`))
      .then((r) => r[0]),

    db
      .select({ val: max(workoutSets.reps) })
      .from(workoutSets)
      .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
      .where(baseWhere)
      .then((r) => r[0]),

    db
      .select({ val: sql<number>`COUNT(DISTINCT ${workoutSessions.id})` })
      .from(workoutSets)
      .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
      .where(baseWhere)
      .then((r) => r[0]),

    db
      .select({ val: max(workoutSets.duration_seconds) })
      .from(workoutSets)
      .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
      .where(and(baseWhere, sql`${workoutSets.duration_seconds} > 0`))
      .then((r) => r[0]),
  ]);

  // Computed aggregates via sql``
  const variantSql = buildVariantSql(scope);
  const [vol, rm, weighted, bwBests] = await Promise.all([
    queryOne<{ val: number | null }>(
      `SELECT MAX(sv) AS val FROM (
         SELECT SUM(ws.weight * ws.reps) AS sv
         FROM workout_sets ws
         JOIN workout_sessions wss ON ws.session_id = wss.id
         WHERE ws.exercise_id = ? AND ws.completed = 1 AND ws.set_type != 'warmup' AND wss.completed_at IS NOT NULL${variantSql.sql}
         GROUP BY wss.id
       )`,
      [exerciseId, ...variantSql.params]
    ),

    queryOne<{ val: number | null }>(
      `SELECT MAX(ws.weight * (1.0 + ws.reps / 30.0)) AS val
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.exercise_id = ? AND ws.completed = 1 AND ws.set_type != 'warmup' AND ws.weight > 0 AND ws.reps > 0 AND ws.reps <= 12 AND wss.completed_at IS NOT NULL${variantSql.sql}`,
      [exerciseId, ...variantSql.params]
    ),

    db
      // is_bodyweight is an exercise-level property: does this exercise have
      // ANY weighted history at all? Intentionally unscoped by VariantScope —
      // a cable row stays a non-bodyweight exercise even when the active
      // filter selects a tuple with zero weighted sets.
      .select({ val: sql<number>`EXISTS(SELECT 1 FROM workout_sets WHERE exercise_id = ${exerciseId} AND completed = 1 AND weight > 0)` })
      .from(workoutSets)
      .limit(1)
      .then((r) => r[0]),

    // BLD-541: weighted-BW bests. Single aggregate; filters on completed sets
    // with non-null modifier (so unsigned zero / null bodyweight rows excluded).
    // Sign-axis semantics: for `best_assisted` (negative values), "best" means
    // "closest to zero" = least assistance = MAX of negatives (NOT MIN).
    queryOne<{ best_added: number | null; best_assisted: number | null }>(
      `SELECT MAX(CASE WHEN ws.bodyweight_modifier_kg > 0 THEN ws.bodyweight_modifier_kg END) AS best_added,
              MAX(CASE WHEN ws.bodyweight_modifier_kg < 0 THEN ws.bodyweight_modifier_kg END) AS best_assisted
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.exercise_id = ? AND ws.completed = 1 AND ws.set_type != 'warmup'
         AND ws.bodyweight_modifier_kg IS NOT NULL AND wss.completed_at IS NOT NULL${variantSql.sql}`,
      [exerciseId, ...variantSql.params]
    ),
  ]);

  return {
    max_weight: weight?.val != null ? Number(weight.val) : null,
    max_reps: reps?.val != null ? Number(reps.val) : null,
    max_volume: vol?.val ?? null,
    est_1rm: rm?.val ? Math.round(rm.val * 10) / 10 : null,
    total_sessions: countResult?.val ?? 0,
    is_bodyweight: !(weighted?.val),
    max_duration: dur?.val != null ? Number(dur.val) : null,
    best_added_kg: bwBests?.best_added != null ? Number(bwBests.best_added) : null,
    best_assisted_kg: bwBests?.best_assisted != null ? Number(bwBests.best_assisted) : null,
  };
}

export async function getExercise1RMChartData(
  exerciseId: string,
  limit: number = 20,
  scope?: VariantScope
): Promise<{ date: number; value: number }[]> {
  const v = buildVariantSql(scope);
  // Nested subquery (inner SELECT + ORDER + LIMIT, outer re-order) — use raw sql
  return query<{ date: number; value: number }>(
    `SELECT * FROM (
       SELECT wss.started_at AS date,
              MAX(ws.weight * (1 + ws.reps / 30.0)) AS value
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.exercise_id = ?
         AND ws.completed = 1
         AND ws.weight IS NOT NULL
         AND ws.weight > 0
         AND ws.reps IS NOT NULL
         AND ws.reps > 0
         AND ws.set_type != 'warmup'
         AND wss.completed_at IS NOT NULL${v.sql}
       GROUP BY wss.id
       ORDER BY wss.started_at DESC
       LIMIT ?
     ) ORDER BY date ASC`,
    [exerciseId, ...v.params, limit]
  );
}

export async function getExerciseChartData(
  exerciseId: string,
  limit: number = 20,
  scope?: VariantScope
): Promise<{ date: number; value: number }[]> {
  const v = buildVariantSql(scope);
  const rows = await query<{ date: number; value: number }>(
    `SELECT * FROM (
       SELECT wss.started_at AS date,
              MAX(ws.weight) AS value
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.exercise_id = ?
         AND ws.completed = 1
         AND ws.weight IS NOT NULL
         AND ws.weight > 0
         AND ws.set_type != 'warmup'
         AND wss.completed_at IS NOT NULL${v.sql}
       GROUP BY wss.id
       ORDER BY wss.started_at DESC
       LIMIT ?
     ) ORDER BY date ASC`,
    [exerciseId, ...v.params, limit]
  );

  if (rows.length > 0) return rows;

  return query<{ date: number; value: number }>(
    `SELECT * FROM (
       SELECT wss.started_at AS date,
              MAX(ws.reps) AS value
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.exercise_id = ?
         AND ws.completed = 1
         AND wss.completed_at IS NOT NULL
         AND ws.set_type != 'warmup'${v.sql}
       GROUP BY wss.id
       ORDER BY wss.started_at DESC
       LIMIT ?
     ) ORDER BY date ASC`,
    [exerciseId, ...v.params, limit]
  );
}

export async function getExerciseDurationChartData(
  exerciseId: string,
  limit: number = 20,
  scope?: VariantScope
): Promise<{ date: number; value: number }[]> {
  const v = buildVariantSql(scope);
  return query<{ date: number; value: number }>(
    `SELECT * FROM (
       SELECT wss.started_at AS date,
              MAX(ws.duration_seconds) AS value
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.exercise_id = ?
         AND ws.completed = 1
         AND ws.duration_seconds IS NOT NULL
         AND ws.duration_seconds > 0
         AND ws.set_type != 'warmup'
         AND wss.completed_at IS NOT NULL${v.sql}
       GROUP BY wss.id
       ORDER BY wss.started_at DESC
       LIMIT ?
     ) ORDER BY date ASC`,
    [exerciseId, ...v.params, limit]
  );
}

export async function getRecentExerciseSets(
  exerciseId: string,
  count: number,
): Promise<{
  session_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  completed: number;
  started_at: number;
}[]> {
  return query<{
    session_id: string;
    set_number: number;
    weight: number | null;
    reps: number | null;
    rpe: number | null;
    completed: number;
    started_at: number;
  }>(
    `SELECT ws.session_id, ws.set_number, ws.weight, ws.reps, ws.rpe,
            ws.completed, wss.started_at
     FROM workout_sets ws
     JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.exercise_id = ?
       AND wss.completed_at IS NOT NULL
       AND wss.id IN (
         SELECT DISTINCT wss2.id
         FROM workout_sessions wss2
         JOIN workout_sets ws2 ON ws2.session_id = wss2.id
         WHERE ws2.exercise_id = ?
           AND wss2.completed_at IS NOT NULL
         ORDER BY wss2.started_at DESC
         LIMIT ?
       )
     ORDER BY wss.started_at ASC, ws.set_number ASC`,
    [exerciseId, exerciseId, count],
  );
}

type RecentSetRow = {
  exercise_id: string;
  session_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  completed: number;
  started_at: number;
};

export async function getRecentExerciseSetsBatch(
  exerciseIds: string[],
  limit: number,
): Promise<Record<string, {
  session_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  completed: number;
  started_at: number;
}[]>> {
  if (exerciseIds.length === 0) return {};
  const db = await getDrizzle();
  const result: Record<string, RecentSetRow[]> = {};

  // Step 1: Find the latest sessions per exercise
  const sessionRows = await db
    .select({
      exercise_id: workoutSets.exercise_id,
      session_id: workoutSessions.id,
    })
    .from(workoutSessions)
    .innerJoin(workoutSets, eq(workoutSets.session_id, workoutSessions.id))
    .where(
      and(
        inArray(workoutSets.exercise_id, exerciseIds),
        isNotNull(workoutSessions.completed_at)
      )
    )
    .groupBy(workoutSets.exercise_id, workoutSessions.id)
    .orderBy(asc(workoutSets.exercise_id), desc(workoutSessions.started_at));

  // Keep only the top `limit` sessions per exercise
  const sessionsByExercise: Record<string, string[]> = {};
  for (const row of sessionRows) {
    if (!sessionsByExercise[row.exercise_id]) sessionsByExercise[row.exercise_id] = [];
    if (sessionsByExercise[row.exercise_id].length < limit) {
      sessionsByExercise[row.exercise_id].push(row.session_id);
    }
  }
  const allSessionIds = [...new Set(Object.values(sessionsByExercise).flat())];
  if (allSessionIds.length === 0) return result;

  // Step 2: Fetch all sets from those sessions for the requested exercises
  const rows = await db
    .select({
      exercise_id: workoutSets.exercise_id,
      session_id: workoutSets.session_id,
      set_number: workoutSets.set_number,
      weight: workoutSets.weight,
      reps: workoutSets.reps,
      rpe: workoutSets.rpe,
      completed: workoutSets.completed,
      started_at: workoutSessions.started_at,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
    .where(
      and(
        inArray(workoutSets.session_id, allSessionIds),
        inArray(workoutSets.exercise_id, exerciseIds)
      )
    )
    .orderBy(asc(workoutSessions.started_at), asc(workoutSets.set_number));

  // Filter rows to only include sets from the correct sessions per exercise
  for (const row of rows) {
    const validSessions = sessionsByExercise[row.exercise_id];
    if (!validSessions || !validSessions.includes(row.session_id)) continue;
    if (!result[row.exercise_id]) result[row.exercise_id] = [];
    result[row.exercise_id].push({
      ...row,
      completed: row.completed ?? 0,
      rpe: row.rpe ?? null,
    });
  }
  return result;
}

export async function getBestSet(
  exerciseId: string,
  scope?: VariantScope,
): Promise<{ weight: number; reps: number; bodyweight_modifier_kg: number | null } | null> {
  const db = await getDrizzle();
  const variantConds = variantDrizzleConditions(scope);
  const rows = await db
    .select({
      weight: workoutSets.weight,
      reps: workoutSets.reps,
      bodyweight_modifier_kg: workoutSets.bodyweight_modifier_kg,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
    .where(
      and(
        eq(workoutSets.exercise_id, exerciseId),
        eq(workoutSets.completed, 1),
        ne(workoutSets.set_type, 'warmup'),
        sql`${workoutSets.weight} > 0`,
        sql`${workoutSets.reps} > 0`,
        sql`${workoutSets.reps} <= 12`,
        isNotNull(workoutSessions.completed_at),
        ...variantConds
      )
    )
    .orderBy(sql`${workoutSets.weight} * (1.0 + ${workoutSets.reps} / 30.0) DESC`)
    .limit(1);

  if (rows.length === 0) return null;
  return {
    weight: rows[0].weight!,
    reps: rows[0].reps!,
    bodyweight_modifier_kg: rows[0].bodyweight_modifier_kg ?? null,
  };
}

/**
 * BLD-541: best weighted-BW set for a bodyweight exercise, picked by
 * `bodyweight_modifier_kg * reps` descending (assisted sets contribute
 * negative product and are never picked as "best" here — they're tracked
 * on the assistance-reduction delta path instead).
 *
 * Returns null when the exercise has no weighted-BW completed sets in a
 * finished session.
 */
export async function getBestBodyweightSet(
  exerciseId: string,
): Promise<{ modifier_kg: number; reps: number } | null> {
  const db = await getDrizzle();
  const rows = await db
    .select({
      modifier_kg: workoutSets.bodyweight_modifier_kg,
      reps: workoutSets.reps,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
    .where(
      and(
        eq(workoutSets.exercise_id, exerciseId),
        eq(workoutSets.completed, 1),
        ne(workoutSets.set_type, 'warmup'),
        isNotNull(workoutSets.bodyweight_modifier_kg),
        sql`${workoutSets.reps} > 0`,
        isNotNull(workoutSessions.completed_at)
      )
    )
    .orderBy(sql`${workoutSets.bodyweight_modifier_kg} * ${workoutSets.reps} DESC`)
    .limit(1);

  if (rows.length === 0) return null;
  const m = rows[0].modifier_kg;
  const r = rows[0].reps;
  if (m == null || r == null) return null;
  return { modifier_kg: Number(m), reps: Number(r) };
}

/**
 * Recent exercises: distinct exercises used in the last `days` days,
 * ordered by most-recent session, limited to `limit` results.
 */
export async function getRecentExercises(
  days: number = 7,
  limit: number = 5,
): Promise<Exercise[]> {
  const db = await getDrizzle();
  const cutoff = Date.now() - days * 86_400_000;
  const rows = await db
    .select({
      id: exercises.id,
      name: exercises.name,
      category: exercises.category,
      primary_muscles: exercises.primary_muscles,
      secondary_muscles: exercises.secondary_muscles,
      equipment: exercises.equipment,
      instructions: exercises.instructions,
      difficulty: exercises.difficulty,
      is_custom: exercises.is_custom,
      deleted_at: exercises.deleted_at,
      mount_position: exercises.mount_position,
      attachment: exercises.attachment,
      training_modes: exercises.training_modes,
      is_voltra: exercises.is_voltra,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
    .innerJoin(exercises, eq(workoutSets.exercise_id, exercises.id))
    .where(
      and(
        sql`${workoutSessions.started_at} > ${cutoff}`,
        eq(workoutSets.completed, 1),
        isNull(exercises.deleted_at),
      )
    )
    .groupBy(exercises.id)
    .orderBy(desc(max(workoutSessions.started_at)))
    .limit(limit);

  return (rows as unknown[]).map((r) => mapRow(r as Parameters<typeof mapRow>[0]));
}

/**
 * Frequent exercises: top exercises by number of distinct sessions,
 * over-fetches by `recentLimit` to allow JS deduplication with recent results.
 */
export async function getFrequentExercises(
  limit: number = 10,
  recentLimit: number = 5,
): Promise<Exercise[]> {
  const db = await getDrizzle();
  const rows = await db
    .select({
      id: exercises.id,
      name: exercises.name,
      category: exercises.category,
      primary_muscles: exercises.primary_muscles,
      secondary_muscles: exercises.secondary_muscles,
      equipment: exercises.equipment,
      instructions: exercises.instructions,
      difficulty: exercises.difficulty,
      is_custom: exercises.is_custom,
      deleted_at: exercises.deleted_at,
      mount_position: exercises.mount_position,
      attachment: exercises.attachment,
      training_modes: exercises.training_modes,
      is_voltra: exercises.is_voltra,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
    .innerJoin(exercises, eq(workoutSets.exercise_id, exercises.id))
    .where(
      and(
        eq(workoutSets.completed, 1),
        isNull(exercises.deleted_at),
      )
    )
    .groupBy(exercises.id)
    .orderBy(desc(sql`COUNT(DISTINCT ${workoutSessions.id})`))
    .limit(limit + recentLimit);

  return (rows as unknown[]).map((r) => mapRow(r as Parameters<typeof mapRow>[0]));
}
