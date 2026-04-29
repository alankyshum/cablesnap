/* eslint-disable max-lines */
import { eq, ne, sql, and, inArray, isNotNull, avg, count, max, asc, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { WorkoutSet, SetType, Attachment, MountPosition, GripType, GripWidth } from "../types";
import { isAttachment, isMountPosition } from "../cable-variant";
import { isGripType, isGripWidth } from "../bodyweight-grip-variant";
import { categorize, type ExerciseCategory } from "../rest";
import { uuid } from "../uuid";
import { getDrizzle, withTransaction, getDatabase } from "./helpers";
import { workoutSets, exercises, workoutSessions, templateExercises } from "./schema";

export async function getSessionSets(
  sessionId: string
): Promise<(WorkoutSet & { exercise_name?: string; exercise_deleted?: boolean })[]> {
  const swappedExercise = alias(exercises, "swapped_exercise");
  const db = await getDrizzle();
  const rows = await db
    .select({
      id: workoutSets.id,
      session_id: workoutSets.session_id,
      exercise_id: workoutSets.exercise_id,
      set_number: workoutSets.set_number,
      weight: workoutSets.weight,
      reps: workoutSets.reps,
      completed: workoutSets.completed,
      completed_at: workoutSets.completed_at,
      rpe: workoutSets.rpe,
      notes: workoutSets.notes,
      link_id: workoutSets.link_id,
      round: workoutSets.round,
      tempo: workoutSets.tempo,
      swapped_from_exercise_id: workoutSets.swapped_from_exercise_id,
      set_type: workoutSets.set_type,
      duration_seconds: workoutSets.duration_seconds,
      exercise_position: workoutSets.exercise_position,
      bodyweight_modifier_kg: workoutSets.bodyweight_modifier_kg,
      attachment: workoutSets.attachment,
      mount_position: workoutSets.mount_position,
      grip_type: workoutSets.grip_type,
      grip_width: workoutSets.grip_width,
      exercise_name: exercises.name,
      exercise_deleted_at: exercises.deleted_at,
      swapped_from_name: swappedExercise.name,
    })
    .from(workoutSets)
    .leftJoin(exercises, eq(workoutSets.exercise_id, exercises.id))
    .leftJoin(swappedExercise, eq(workoutSets.swapped_from_exercise_id, swappedExercise.id))
    .where(eq(workoutSets.session_id, sessionId))
    .orderBy(asc(workoutSets.exercise_position), asc(workoutSets.exercise_id), asc(workoutSets.set_number))
    .all();
  return rows.map((r) => ({
    id: r.id,
    session_id: r.session_id,
    exercise_id: r.exercise_id,
    set_number: r.set_number,
    weight: r.weight,
    reps: r.reps,
    completed: r.completed === 1,
    completed_at: r.completed_at,
    rpe: r.rpe ?? null,
    notes: r.notes ?? "",
    link_id: r.link_id ?? null,
    round: r.round ?? null,
    tempo: r.tempo ?? null,
    swapped_from_exercise_id: r.swapped_from_exercise_id ?? null,
    set_type: (r.set_type as SetType) ?? "normal",
    duration_seconds: r.duration_seconds ?? null,
    exercise_position: r.exercise_position ?? 0,
    bodyweight_modifier_kg: r.bodyweight_modifier_kg ?? null,
    attachment: (r.attachment as Attachment | null) ?? null,
    mount_position: (r.mount_position as MountPosition | null) ?? null,
    // BLD-768: per-set bodyweight grip variant. Cast at the DB read boundary;
    // values are constrained by `lib/bodyweight-grip-variant.ts` type guards
    // wherever they re-enter the system (CSV import, future analytics filter).
    grip_type: (r.grip_type as GripType | null) ?? null,
    grip_width: (r.grip_width as GripWidth | null) ?? null,
    exercise_name: r.exercise_name ?? undefined,
    exercise_deleted: r.exercise_deleted_at != null,
    swapped_from_name: r.swapped_from_name ?? undefined,
  }));
}

export type SourceSessionSet = {
  exercise_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  link_id: string | null;
  tempo: string | null;
  exercise_exists: boolean;
  set_type: SetType;
};

export async function getSourceSessionSets(
  sessionId: string
): Promise<SourceSessionSet[]> {
  const db = await getDrizzle();
  const rows = await db
    .select({
      exercise_id: workoutSets.exercise_id,
      set_number: workoutSets.set_number,
      weight: workoutSets.weight,
      reps: workoutSets.reps,
      link_id: workoutSets.link_id,
      tempo: workoutSets.tempo,
      exercise_exists: exercises.id,
      set_type: workoutSets.set_type,
    })
    .from(workoutSets)
    .leftJoin(exercises, eq(workoutSets.exercise_id, exercises.id))
    .where(and(eq(workoutSets.session_id, sessionId), eq(workoutSets.completed, 1)))
    .orderBy(asc(workoutSets.set_number))
    .all();
  return rows.map((r) => ({
    exercise_id: r.exercise_id,
    set_number: r.set_number,
    weight: r.weight,
    reps: r.reps,
    link_id: r.link_id,
    tempo: r.tempo,
    exercise_exists: r.exercise_exists != null,
    set_type: (r.set_type as SetType) ?? "normal",
  }));
}

// BLD-771: variant fields push complexity to 16 (limit 15). Branches are pure
// field defaults; the function is a thin INSERT wrapper, not branching logic.
// eslint-disable-next-line complexity
export async function addSet(
  sessionId: string,
  exerciseId: string,
  setNumber: number,
  linkId?: string | null,
  round?: number | null,
  tempo?: string | null,
  _isWarmup?: boolean,
  setType?: SetType,
  exercisePosition?: number,
  // BLD-771: per-set cable variant. Pass values from autofill helper at call site.
  // Both null when user has no prior variant on this exercise (no silent default).
  attachment?: Attachment | null,
  mountPosition?: MountPosition | null,
  // BLD-768: per-set bodyweight grip variant. Same no-silent-default rule as
  // cable variants — both NULL when user has no prior grip on this exercise.
  gripType?: GripType | null,
  gripWidth?: GripWidth | null
): Promise<WorkoutSet> {
  const id = uuid();
  const resolvedType: SetType = setType ?? "normal";
  const db = await getDrizzle();
  await db.insert(workoutSets).values({
    id,
    session_id: sessionId,
    exercise_id: exerciseId,
    set_number: setNumber,
    link_id: linkId ?? null,
    round: round ?? null,
    tempo: tempo ?? null,
    set_type: resolvedType,
    exercise_position: exercisePosition ?? 0,
    attachment: attachment ?? null,
    mount_position: mountPosition ?? null,
    grip_type: gripType ?? null,
    grip_width: gripWidth ?? null,
  });
  return {
    id,
    session_id: sessionId,
    exercise_id: exerciseId,
    set_number: setNumber,
    weight: null,
    reps: null,
    completed: false,
    completed_at: null,
    rpe: null,
    notes: "",
    link_id: linkId ?? null,
    round: round ?? null,
    tempo: tempo ?? null,
    swapped_from_exercise_id: null,
    set_type: resolvedType,
    duration_seconds: null,
    exercise_position: exercisePosition ?? 0,
    attachment: attachment ?? null,
    mount_position: mountPosition ?? null,
    grip_type: gripType ?? null,
    grip_width: gripWidth ?? null,
  };
}

export async function addSetsBatch(
  sets: {
    sessionId: string;
    exerciseId: string;
    setNumber: number;
    linkId?: string | null;
    round?: number | null;
    tempo?: string | null;
    isWarmup?: boolean;
    setType?: SetType;
    exercisePosition?: number;
    // BLD-771: per-set cable variant (autofilled by caller from history).
    attachment?: Attachment | null;
    mountPosition?: MountPosition | null;
    // BLD-768: per-set bodyweight grip variant (autofilled by caller from history).
    gripType?: GripType | null;
    gripWidth?: GripWidth | null;
  }[]
): Promise<WorkoutSet[]> {
  const results: WorkoutSet[] = sets.map((s) => {
    const resolvedType: SetType = s.setType ?? (s.isWarmup ? "warmup" : "normal");
    return {
      id: uuid(),
      session_id: s.sessionId,
      exercise_id: s.exerciseId,
      set_number: s.setNumber,
      weight: null,
      reps: null,
      completed: false,
      completed_at: null,
      rpe: null,
      notes: "",
      link_id: s.linkId ?? null,
      round: s.round ?? null,
      tempo: s.tempo ?? null,
      swapped_from_exercise_id: null,
      set_type: resolvedType,
      duration_seconds: null,
      exercise_position: s.exercisePosition ?? 0,
      attachment: s.attachment ?? null,
      mount_position: s.mountPosition ?? null,
      grip_type: s.gripType ?? null,
      grip_width: s.gripWidth ?? null,
    };
  });
  // Use prepared statements for batch insert performance
  await withTransaction(async (db) => {
    const stmt = await db.prepareAsync(
      "INSERT INTO workout_sets (id, session_id, exercise_id, set_number, link_id, round, tempo, set_type, exercise_position, attachment, mount_position, grip_type, grip_width) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    try {
      for (const r of results) {
        await stmt.executeAsync([
          r.id, r.session_id, r.exercise_id, r.set_number,
          r.link_id, r.round, r.tempo, r.set_type, r.exercise_position,
          r.attachment ?? null, r.mount_position ?? null,
          // BLD-768: positional binding contract — grip_type at index 12, grip_width at index 13.
          // Pinned by `__tests__/lib/db/add-sets-batch-bodyweight-variant.test.ts`.
          r.grip_type ?? null, r.grip_width ?? null,
        ]);
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });
  return results;
}

export async function addWarmupSets(
  sessionId: string,
  exerciseId: string,
  warmupSets: { weight: number; reps: number }[],
  linkId?: string | null,
  tempo?: string | null,
  exercisePosition?: number
): Promise<WorkoutSet[]> {
  if (warmupSets.length === 0) return [];
  const warmupCount = warmupSets.length;
  const pos = exercisePosition ?? 0;

  const results: WorkoutSet[] = warmupSets.map((ws, i) => ({
    id: uuid(),
    session_id: sessionId,
    exercise_id: exerciseId,
    set_number: i + 1,
    weight: ws.weight,
    reps: ws.reps,
    completed: false,
    completed_at: null,
    rpe: null,
    notes: "",
    link_id: linkId ?? null,
    round: null,
    tempo: tempo ?? null,
    swapped_from_exercise_id: null,
    set_type: "warmup" as SetType,
    duration_seconds: null,
    exercise_position: pos,
  }));

  await withTransaction(async (db) => {
    // Shift existing sets up by count
    await db.runAsync(
      "UPDATE workout_sets SET set_number = set_number + ? WHERE session_id = ? AND exercise_id = ?",
      [warmupCount, sessionId, exerciseId]
    );

    // Insert warmup sets
    const stmt = await db.prepareAsync(
      "INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, link_id, round, tempo, set_type, exercise_position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    try {
      for (const r of results) {
        await stmt.executeAsync([
          r.id, r.session_id, r.exercise_id, r.set_number,
          r.weight, r.reps, r.link_id, r.round, r.tempo, "warmup", r.exercise_position,
        ]);
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });

  return results;
}

export async function updateSetsBatch(
  updates: { id: string; weight: number | null; reps: number | null }[]
): Promise<void> {
  if (updates.length === 0) return;
  await withTransaction(async (db) => {
    const stmt = await db.prepareAsync(
      "UPDATE workout_sets SET weight = ?, reps = ? WHERE id = ?"
    );
    try {
      for (const u of updates) {
        await stmt.executeAsync([u.weight, u.reps, u.id]);
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });
}

export async function updateSet(
  id: string,
  weight: number | null,
  reps: number | null,
  durationSeconds?: number | null
): Promise<void> {
  const db = await getDrizzle();
  const values: Record<string, unknown> = { weight, reps };
  if (durationSeconds !== undefined) {
    values.duration_seconds = durationSeconds;
  }
  await db.update(workoutSets).set(values).where(eq(workoutSets.id, id));
}

export async function updateSetDuration(
  id: string,
  durationSeconds: number | null
): Promise<void> {
  const db = await getDrizzle();
  await db.update(workoutSets).set({ duration_seconds: durationSeconds }).where(eq(workoutSets.id, id));
}

/**
 * BLD-771: Update per-set cable variant (attachment + mount_position).
 *
 * Sibling of `updateSet()` (which updates weight/reps only). Either field may
 * be null to clear the value (the bottom-sheet picker's "Clear" action).
 *
 * Both attributes are independent — passing `attachment` and leaving
 * `mountPosition` undefined leaves the existing mount_position untouched. To
 * explicitly clear, pass null.
 */
export async function updateSetVariant(
  id: string,
  attachment: Attachment | null | undefined,
  mountPosition: MountPosition | null | undefined
): Promise<void> {
  const db = await getDrizzle();
  const values: Record<string, unknown> = {};
  if (attachment !== undefined) values.attachment = attachment;
  if (mountPosition !== undefined) values.mount_position = mountPosition;
  if (Object.keys(values).length === 0) return;
  await db.update(workoutSets).set(values).where(eq(workoutSets.id, id));
}

/**
 * BLD-768: Update per-set bodyweight grip variant (grip_type + grip_width).
 *
 * Sibling of `updateSetVariant()` (cable, BLD-771). Same 3-way undefined/null/value
 * contract:
 *   - value (GripType | GripWidth) → write that value
 *   - null                         → write null (explicit clear)
 *   - undefined                    → DO NOT write the column at all
 *   - both undefined               → no-op (no UPDATE issued)
 *
 * Both attributes are independent — passing `gripType` and leaving `gripWidth`
 * undefined leaves the existing grip_width untouched. To explicitly clear,
 * pass null.
 */
export async function updateSetBodyweightVariant(
  id: string,
  gripType: GripType | null | undefined,
  gripWidth: GripWidth | null | undefined
): Promise<void> {
  const db = await getDrizzle();
  const values: Record<string, unknown> = {};
  if (gripType !== undefined) values.grip_type = gripType;
  if (gripWidth !== undefined) values.grip_width = gripWidth;
  if (Object.keys(values).length === 0) return;
  await db.update(workoutSets).set(values).where(eq(workoutSets.id, id));
}

export async function completeSet(id: string): Promise<void> {
  const db = await getDrizzle();
  const now = Date.now();
  await db.update(workoutSets)
    .set({ completed: 1, completed_at: now })
    .where(eq(workoutSets.id, id));
  // BLD-630: anchor the parent session's elapsed clock to the EARLIEST
  // completed set in the session (not just `now`), so resumed sessions and
  // pre-existing completed sets — e.g., rows written before this migration
  // landed, or near-concurrent completions — anchor to the true first
  // completion. The `clock_started_at IS NULL` guard keeps it idempotent on
  // subsequent set completions.
  await db.run(sql`
    UPDATE workout_sessions
    SET clock_started_at = (
      SELECT MIN(completed_at)
      FROM workout_sets
      WHERE session_id = (SELECT session_id FROM workout_sets WHERE id = ${id})
        AND completed_at IS NOT NULL
    )
    WHERE id = (SELECT session_id FROM workout_sets WHERE id = ${id})
      AND clock_started_at IS NULL
  `);
}

export async function uncompleteSet(id: string): Promise<void> {
  const db = await getDrizzle();
  await db.update(workoutSets)
    .set({ completed: 0, completed_at: null })
    .where(eq(workoutSets.id, id));
}

export async function deleteSet(id: string): Promise<void> {
  const db = await getDrizzle();
  await db.delete(workoutSets).where(eq(workoutSets.id, id));
}

export async function deleteSetsBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDrizzle();
  await db.delete(workoutSets).where(inArray(workoutSets.id, ids));
}

export async function updateSetRPE(id: string, rpe: number | null): Promise<void> {
  const db = await getDrizzle();
  await db.update(workoutSets)
    .set({ rpe })
    .where(eq(workoutSets.id, id));
}

export async function updateSetNotes(id: string, notes: string): Promise<void> {
  const db = await getDrizzle();
  await db.update(workoutSets)
    .set({ notes })
    .where(eq(workoutSets.id, id));
}

export async function updateSetTempo(id: string, tempo: string | null): Promise<void> {
  const db = await getDrizzle();
  await db.update(workoutSets)
    .set({ tempo })
    .where(eq(workoutSets.id, id));
}

export async function updateSetWarmup(id: string, isWarmup: boolean): Promise<void> {
  const setType = isWarmup ? "warmup" : "normal";
  const db = await getDrizzle();
  await db.update(workoutSets)
    .set({ set_type: setType })
    .where(eq(workoutSets.id, id));
}

export async function updateSetType(id: string, type: SetType): Promise<void> {
  const db = await getDrizzle();
  await db.update(workoutSets)
    .set({ set_type: type })
    .where(eq(workoutSets.id, id));
}

export async function getPreviousSets(
  exerciseId: string,
  currentSessionId: string
): Promise<{ set_number: number; weight: number | null; reps: number | null }[]> {
  const db = await getDrizzle();
  const rows = await db
    .select({
      set_number: workoutSets.set_number,
      weight: workoutSets.weight,
      reps: workoutSets.reps,
    })
    .from(workoutSets)
    .where(and(
      eq(workoutSets.exercise_id, exerciseId),
      eq(workoutSets.completed, 1),
      sql`${workoutSets.session_id} = (
        SELECT ${workoutSessions.id} FROM ${workoutSessions}
        JOIN ${workoutSets} ws2 ON ws2.session_id = ${workoutSessions.id}
        WHERE ws2.exercise_id = ${exerciseId} AND ${workoutSessions.completed_at} IS NOT NULL AND ${workoutSessions.id} != ${currentSessionId}
        ORDER BY ${workoutSessions.completed_at} DESC LIMIT 1
      )`
    ))
    .orderBy(asc(workoutSets.set_number))
    .all();
  return rows;
}

export async function getPreviousSetsBatch(
  exerciseIds: string[],
  currentSessionId: string
): Promise<Record<string, { set_number: number; weight: number | null; reps: number | null; duration_seconds: number | null; set_type: string | null; completed: boolean; rpe: number | null }[]>> {
  if (exerciseIds.length === 0) return {};
  const result: Record<string, { set_number: number; weight: number | null; reps: number | null; duration_seconds: number | null; set_type: string | null; completed: boolean; rpe: number | null }[]> = {};
  const db = await getDrizzle();
  // Step 1: Find all completed sessions per exercise, ordered by most recent
  const sessionRows = await db
    .select({
      exercise_id: workoutSets.exercise_id,
      session_id: workoutSessions.id,
    })
    .from(workoutSessions)
    .innerJoin(workoutSets, eq(workoutSets.session_id, workoutSessions.id))
    .where(and(
      inArray(workoutSets.exercise_id, exerciseIds),
      isNotNull(workoutSessions.completed_at),
      sql`${workoutSessions.id} != ${currentSessionId}`
    ))
    .groupBy(workoutSets.exercise_id, workoutSessions.id)
    .orderBy(asc(workoutSets.exercise_id), desc(workoutSessions.completed_at))
    .all();
  if (sessionRows.length === 0) return result;
  // Keep only the first (most recent) session per exercise
  const sessionMap: Record<string, string> = {};
  for (const row of sessionRows) {
    if (!sessionMap[row.exercise_id]) {
      sessionMap[row.exercise_id] = row.session_id;
    }
  }
  const sessionIds = [...new Set(Object.values(sessionMap))];
  // Step 2: Fetch ALL sets from those sessions (not just completed) with completed/rpe fields
  const rows = await db
    .select({
      exercise_id: workoutSets.exercise_id,
      session_id: workoutSets.session_id,
      set_number: workoutSets.set_number,
      weight: workoutSets.weight,
      reps: workoutSets.reps,
      duration_seconds: workoutSets.duration_seconds,
      set_type: workoutSets.set_type,
      completed: workoutSets.completed,
      rpe: workoutSets.rpe,
    })
    .from(workoutSets)
    .where(and(
      inArray(workoutSets.session_id, sessionIds),
      inArray(workoutSets.exercise_id, exerciseIds)
    ))
    .orderBy(asc(workoutSets.exercise_id), asc(workoutSets.set_number))
    .all();
  // Filter rows to only include sets from the correct session per exercise
  for (const row of rows) {
    const correctSession = sessionMap[row.exercise_id];
    if (!correctSession || row.session_id !== correctSession) continue;
    if (!result[row.exercise_id]) result[row.exercise_id] = [];
    result[row.exercise_id].push({ set_number: row.set_number, weight: row.weight, reps: row.reps, duration_seconds: row.duration_seconds, set_type: row.set_type, completed: row.completed === 1, rpe: row.rpe ?? null });
  }
  return result;
}

export async function getSessionSetCount(
  sessionId: string
): Promise<number> {
  const db = await getDrizzle();
  const row = await db.select({ count: sql<number>`COUNT(*)` })
    .from(workoutSets)
    .where(sql`${workoutSets.session_id} = ${sessionId} AND ${workoutSets.completed} = 1 AND ${workoutSets.set_type} != 'warmup'`)
    .get();
  return row?.count ?? 0;
}

export async function getSessionSetCounts(
  sessionIds: string[]
): Promise<Record<string, number>> {
  if (sessionIds.length === 0) return {};
  const db = await getDrizzle();
  const rows = await db
    .select({
      session_id: workoutSets.session_id,
      count: count(),
    })
    .from(workoutSets)
    .where(and(
      inArray(workoutSets.session_id, sessionIds),
      eq(workoutSets.completed, 1),
      ne(workoutSets.set_type, 'warmup')
    ))
    .groupBy(workoutSets.session_id)
    .all();
  const result: Record<string, number> = {};
  for (const r of rows) result[r.session_id] = r.count;
  return result;
}

export async function getSessionAvgRPE(
  sessionId: string
): Promise<number | null> {
  const db = await getDrizzle();
  const row = await db
    .select({ val: avg(workoutSets.rpe) })
    .from(workoutSets)
    .where(and(
      eq(workoutSets.session_id, sessionId),
      eq(workoutSets.completed, 1),
      isNotNull(workoutSets.rpe),
      ne(workoutSets.set_type, 'warmup')
    ))
    .get();
  return row?.val != null ? Number(row.val) : null;
}

export async function getSessionAvgRPEs(
  sessionIds: string[]
): Promise<Record<string, number | null>> {
  if (sessionIds.length === 0) return {};
  const db = await getDrizzle();
  const rows = await db
    .select({
      session_id: workoutSets.session_id,
      val: avg(workoutSets.rpe),
    })
    .from(workoutSets)
    .where(and(
      inArray(workoutSets.session_id, sessionIds),
      eq(workoutSets.completed, 1),
      isNotNull(workoutSets.rpe),
      ne(workoutSets.set_type, 'warmup')
    ))
    .groupBy(workoutSets.session_id)
    .all();
  const result: Record<string, number | null> = {};
  for (const r of rows) result[r.session_id] = r.val != null ? Number(r.val) : null;
  return result;
}

export async function getRestSecondsForExercise(
  sessionId: string,
  exerciseId: string
): Promise<number> {
  const db = await getDrizzle();
  const row = await db
    .select({ rest_seconds: templateExercises.rest_seconds })
    .from(workoutSessions)
    .innerJoin(templateExercises, and(
      eq(templateExercises.template_id, workoutSessions.template_id),
      eq(templateExercises.exercise_id, exerciseId)
    ))
    .where(eq(workoutSessions.id, sessionId))
    .get();
  return row?.rest_seconds ?? 90;
}

export type RestContext = {
  baseRestSeconds: number;
  category: ExerciseCategory;
  setType: SetType;
  rpe: number | null;
};

/**
 * Fetch the inputs the Intelligent Rest Timer resolver needs for a given set.
 * getRestSecondsForExercise is left UNCHANGED as the legacy path.
 */
export async function getRestContext(
  sessionId: string,
  exerciseId: string,
  set: { set_type: SetType; rpe: number | null },
): Promise<RestContext> {
  const db = await getDrizzle();
  const row = await db
    .select({
      rest_seconds: templateExercises.rest_seconds,
      equipment: exercises.equipment,
    })
    .from(workoutSessions)
    .innerJoin(exercises, eq(exercises.id, exerciseId))
    .leftJoin(templateExercises, and(
      eq(templateExercises.template_id, workoutSessions.template_id),
      eq(templateExercises.exercise_id, exerciseId),
    ))
    .where(eq(workoutSessions.id, sessionId))
    .get();
  const baseRestSeconds = row?.rest_seconds ?? 90;
  const equipment = row?.equipment ?? "";
  return {
    baseRestSeconds,
    category: categorize(equipment),
    setType: set.set_type,
    rpe: set.rpe,
  };
}

export async function getRestSecondsForLink(
  sessionId: string,
  linkId: string
): Promise<number> {
  const db = await getDrizzle();
  const row = await db
    .select({ rest: max(templateExercises.rest_seconds) })
    .from(workoutSessions)
    .innerJoin(templateExercises, eq(templateExercises.template_id, workoutSessions.template_id))
    .where(and(eq(workoutSessions.id, sessionId), eq(templateExercises.link_id, linkId)))
    .get();
  return row?.rest != null ? Number(row.rest) : 90;
}

export async function updateExercisePositions(
  sessionId: string,
  positions: { exerciseId: string; position: number }[]
): Promise<void> {
  if (positions.length === 0) return;
  await withTransaction(async (db) => {
    const stmt = await db.prepareAsync(
      "UPDATE workout_sets SET exercise_position = ? WHERE session_id = ? AND exercise_id = ?"
    );
    try {
      for (const p of positions) {
        await stmt.executeAsync([p.position, sessionId, p.exerciseId]);
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });
}

// ─── Bodyweight modifier (BLD-541) ──────────────────────────────────────────
// Signed load modifier on bodyweight exercises only (equipment === 'bodyweight').
// Positive = added weight (belt/vest/DB), Negative = assistance (band/machine), NULL = pure BW.
// Storage column: workout_sets.bodyweight_modifier_kg (REAL DEFAULT NULL).

/**
 * Normalize a modifier input to canonical storage form.
 * Normalizes ±0 (and NaN) to null so "Added 0 kg" / "Assisted 0 kg" never persists
 * as a zero-magnitude row — it is the same as pure bodyweight.
 *
 * NOTE: keep in sync with lib/bodyweight.ts::normalizeModifier. Belt-and-braces
 * duplication is intentional (helper layer + DB write boundary); if the two
 * diverge, the DB layer must remain strictly no-looser than the helper.
 */
export function normalizeBodyweightModifier(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return null;
  if (value === 0) return null;
  return value;
}

/**
 * Update the bodyweight_modifier_kg on a set. Enforces the cross-table invariant
 * that a non-null modifier may only be written to a set whose exercise has
 * equipment = 'bodyweight'. Throws on violation.
 *
 * Called from the BodyweightModifierSheet and long-press shortcut.
 * updateSet(...) is deliberately NOT widened to accept this parameter.
 */
export async function updateSetBodyweightModifier(
  setId: string,
  modifierKg: number | null
): Promise<void> {
  const normalized = normalizeBodyweightModifier(modifierKg);
  const db = await getDrizzle();
  const row = await db
    .select({ equipment: exercises.equipment })
    .from(workoutSets)
    .innerJoin(exercises, eq(workoutSets.exercise_id, exercises.id))
    .where(eq(workoutSets.id, setId))
    .limit(1);
  if (row.length === 0) {
    throw new Error(`updateSetBodyweightModifier: set ${setId} not found`);
  }
  const equipment = row[0].equipment;
  if (normalized !== null && equipment !== "bodyweight") {
    throw new Error("bodyweight_modifier_kg only valid on bodyweight exercises");
  }
  await db
    .update(workoutSets)
    .set({ bodyweight_modifier_kg: normalized })
    .where(eq(workoutSets.id, setId));
}

/**
 * Fetch the most-recent non-warmup completed-set modifier for an exercise within
 * the last 90 days. Powers the smart-default pre-fill on new bodyweight sets.
 * Returns null if no prior modifier is found. A returned null matches both
 * "no prior set" and "prior set was pure BW (modifier NULL)" — either way the
 * new chip defaults to BW.
 *
 * NOTE: this intentionally does NOT filter on session completion (no join to
 * workout_sessions.completed_at). Smart-default operates on completed *sets*,
 * so an in-progress session's earlier sets still pre-fill subsequent ones.
 * Contrast getWeightedBodyweightPRs in pr-dashboard.ts, which requires
 * session-level completion because PRs count only toward finished workouts.
 */
export async function getLastBodyweightModifier(
  exerciseId: string
): Promise<number | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ bodyweight_modifier_kg: number | null }>(
    `SELECT bodyweight_modifier_kg
       FROM workout_sets
      WHERE exercise_id = ?
        AND set_type != 'warmup'
        AND completed = 1
        AND completed_at > strftime('%s', datetime('now','-90 days')) * 1000
      ORDER BY completed_at DESC
      LIMIT 1`,
    [exerciseId]
  );
  return row?.bodyweight_modifier_kg ?? null;
}

/**
 * BLD-771: Fetch the recent cable-variant history window for an exercise.
 *
 * Returns up to `limit` rows ordered newest-first, suitable for passing into
 * the pure `getLastVariant()` helper in `lib/cable-variant.ts`. Includes
 * warmup and in-progress (uncompleted) sets — autofill should reflect the
 * user's most recent _intent_, not just completed work.
 *
 * Order: `s.started_at DESC, ws.set_number DESC` (joined to workout_sessions).
 * `started_at` is `notNull integer` on workout_sessions, so no NULLS-FIRST/LAST
 * handling is needed. The current in-progress session has the highest
 * `started_at`, so its rows naturally surface first; within a session,
 * `set_number DESC` selects the latest set the user touched. UUIDv4 ids are
 * not monotonic (TL TR2), so we cannot order by id.
 *
 * Window size 50 is the heuristic ceiling: a user training the same exercise
 * 4×/week for a year produces ~200 sets; in the typical case the most recent
 * non-null attachment + mount_position is found inside the first 10–20 rows
 * and the pure helper short-circuits as soon as both attributes resolve.
 *
 * Caveat (do NOT bump this thinking it's a perf knob): in the cold-start
 * pathological case — one ancient session with the only non-null variant
 * plus 50 newer bare-set sessions — the scan will read all 50 rows and
 * resolve to NULL. That is correct per the "no silent default" rule
 * (autofill must reflect _recent_ user intent, not unbounded ancient
 * history); it is NOT a bug to fix by widening the window.
 *
 * Index plan: `idx_workout_sets_exercise` covers the WHERE clause. If
 * EXPLAIN QUERY PLAN on a 10k-set DB shows SCAN, ship a partial index
 * covering `(exercise_id) WHERE attachment IS NOT NULL OR mount_position IS NOT NULL`
 * in a follow-up — measure first.
 */
export async function getRecentVariantHistory(
  exerciseId: string,
  limit: number = 50
): Promise<{ attachment: Attachment | null; mount_position: MountPosition | null }[]> {
  const database = await getDatabase();
  // Reviewer blocker #2 (PR #426): the prior `ORDER BY completed_at DESC
  // NULLS LAST` deprioritized in-progress (uncompleted) rows behind older
  // completed rows, so a mid-session variant change on the current set was
  // ignored by the next add-set autofill. Joining workout_sessions and
  // ordering by `started_at DESC` naturally surfaces the current session
  // first (current = highest started_at), then prior sessions in reverse
  // chronological order. Within a session, `set_number DESC` selects the
  // latest set the user touched. No NULLS-FIRST/LAST required because
  // `started_at` is `notNull` on workout_sessions.
  const rows = await database.getAllAsync<{
    attachment: string | null;
    mount_position: string | null;
  }>(
    `SELECT ws.attachment, ws.mount_position
       FROM workout_sets ws
       JOIN workout_sessions s ON s.id = ws.session_id
      WHERE ws.exercise_id = ?
      ORDER BY s.started_at DESC, ws.set_number DESC
      LIMIT ?`,
    [exerciseId, limit]
  );
   return rows.map((row) => ({
    attachment: isAttachment(row.attachment) ? row.attachment : null,
    mount_position: isMountPosition(row.mount_position) ? row.mount_position : null,
  }));
}

/**
 * BLD-822: Fetch the recent bodyweight-grip-variant history window for an
 * exercise. Sibling of `getRecentVariantHistory` (BLD-771) — same shape, grip
 * vocabulary. Returns up to `limit` rows ordered newest-first, suitable for
 * passing into the pure `getLastBodyweightGripVariant()` helper in
 * `lib/bodyweight-grip-variant.ts`.
 *
 * Order: `s.started_at DESC, ws.set_number DESC` (joined to workout_sessions).
 * Identical ordering rationale as cable variant — current in-progress session
 * has highest `started_at`, so its rows surface first; within a session,
 * `set_number DESC` selects the latest set.
 *
 * Window size 50: same heuristic as cable. The pure helper short-circuits on
 * both attributes resolving, so typical paths read 10–20 rows.
 *
 * Index plan (PLAN-BLD-768.md line 311 AC, line 344 risk): the WHERE clause
 * `ws.exercise_id = ?` is covered by `idx_workout_sets_exercise`
 * (`lib/db/migrations.ts:43`). EXPLAIN QUERY PLAN on a 1k+ seeded DB confirms
 * SEARCH USING INDEX, not SCAN — verified by
 * `__tests__/lib/db/grip-history-query-plan.test.ts`. If a future change
 * adds a partial-index migration, that test will catch any planner
 * regression because it asserts the literal "USING INDEX
 * idx_workout_sets_exercise" plan token.
 *
 * No silent default: if a row's `grip_type` / `grip_width` is not a valid
 * union member it falls through the type guard and surfaces as `null`. The
 * pure autofill helper then keeps scanning for the next non-null carrier.
 */
export async function getRecentBodyweightGripHistory(
  exerciseId: string,
  limit: number = 50
): Promise<{ grip_type: GripType | null; grip_width: GripWidth | null }[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    grip_type: string | null;
    grip_width: string | null;
  }>(
    `SELECT ws.grip_type, ws.grip_width
       FROM workout_sets ws
       JOIN workout_sessions s ON s.id = ws.session_id
      WHERE ws.exercise_id = ?
      ORDER BY s.started_at DESC, ws.set_number DESC
      LIMIT ?`,
    [exerciseId, limit]
  );
  return rows.map((row) => ({
    grip_type: isGripType(row.grip_type) ? row.grip_type : null,
    grip_width: isGripWidth(row.grip_width) ? row.grip_width : null,
  }));
}
