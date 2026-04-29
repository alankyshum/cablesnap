import { eq, sql, desc, isNotNull, and, asc, inArray } from "drizzle-orm";
import type { WorkoutSession } from "../types";
import { uuid } from "../uuid";
import { getDrizzle, query, withTransaction } from "./helpers";
import { workoutSessions, workoutSets, workoutTemplates, templateExercises } from "./schema";

// Re-export from split modules for backward compatibility
export {
  getSessionSets,
  addSet,
  addSetsBatch,
  addWarmupSets,
  updateSet,
  updateSetsBatch,
  updateSetDuration,
  completeSet,
  uncompleteSet,
  deleteSet,
  deleteSetsBatch,
  updateSetRPE,
  updateSetNotes,
  updateSetTempo,
  updateSetWarmup,
  updateSetType,
  getPreviousSets,
  getPreviousSetsBatch,
  getSessionSetCount,
  getSessionSetCounts,
  getSessionAvgRPE,
  getSessionAvgRPEs,
  getRestSecondsForExercise,
  getRestSecondsForLink,
  getRestContext,
  getSourceSessionSets,
  updateExercisePositions,
} from "./session-sets";
export type { SourceSessionSet } from "./session-sets";
export type { RestContext } from "./session-sets";

export {
  getSessionsByMonth,
  searchSessions,
  getAllCompletedSessionWeeks,
  getWeeklySessionCounts,
  getWeeklyVolume,
  getPersonalRecords,
  getCompletedSessionsWithSetCount,
  getMaxWeightByExercise,
  getSessionPRs,
  checkSetPR,
  checkSetBodyweightModifierPR,
  getRecentPRs,
  getSessionRepPRs,
  getSessionComparison,
  getSessionWeightIncreases,
  getSessionDurationPRs,
  getSessionCountsByDay,
  getTotalSessionCount,
  getMuscleVolumeForWeek,
  getMuscleVolumeTrend,
} from "./session-stats";

export { getE1RMTrends, getWeeklyE1RMTrends, getRecentSessionRPEs, getRecentSessionRatings } from "./e1rm-trends";
export type { E1RMTrendRow, WeeklyE1RMRow, SessionRPERow, SessionRatingRow } from "./e1rm-trends";

export {
  getExerciseHistory,
  getExerciseRecords,
  getExercise1RMChartData,
  getExerciseChartData,
  getExerciseDurationChartData,
  getRecentExerciseSets,
  getRecentExerciseSetsBatch,
  getBestSet,
} from "./exercise-history";
export type { ExerciseSession, ExerciseRecords } from "./exercise-history";

// ---- Duration Estimates ----

export async function getTemplateDurationEstimates(
  templateIds: string[]
): Promise<Record<string, number | null>> {
  if (templateIds.length === 0) return {};
  const placeholders = templateIds.map(() => "?").join(", ");
  const rows = await query<{ template_id: string; duration_seconds: number; rn: number }>(
    `SELECT template_id, duration_seconds, rn FROM (
      SELECT template_id, duration_seconds,
        ROW_NUMBER() OVER (PARTITION BY template_id ORDER BY completed_at DESC) AS rn
      FROM workout_sessions
      WHERE template_id IN (${placeholders})
        AND completed_at IS NOT NULL
        AND duration_seconds IS NOT NULL
        AND duration_seconds >= 60
    ) WHERE rn <= 5`,
    templateIds
  );

  const grouped: Record<string, number[]> = {};
  for (const row of rows) {
    if (!grouped[row.template_id]) grouped[row.template_id] = [];
    grouped[row.template_id].push(row.duration_seconds);
  }

  const result: Record<string, number | null> = {};
  for (const id of templateIds) {
    const durations = grouped[id];
    if (!durations || durations.length === 0) {
      result[id] = null;
    } else {
      result[id] = median(durations);
    }
  }
  return result;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

// ---- Sessions ----

export async function startSession(
  templateId: string | null,
  name: string,
  programDayId?: string
): Promise<WorkoutSession> {
  const id = uuid();
  const now = Date.now();
  const db = await getDrizzle();
  await db.insert(workoutSessions).values({
    id,
    template_id: templateId,
    name,
    started_at: now,
    notes: "",
    program_day_id: programDayId ?? null,
  });
  return {
    id,
    template_id: templateId,
    name,
    started_at: now,
    // BLD-630: not yet anchored — readers fall back to started_at until the
    // first set in this session is completed.
    clock_started_at: null,
    completed_at: null,
    duration_seconds: null,
    notes: "",
    rating: null,
    edited_at: null,
    import_batch_id: null,
  };
}

export async function completeSession(
  id: string,
  notes?: string
): Promise<void> {
  const now = Date.now();
  const db = await getDrizzle();
  const session = await db.select({
      started_at: workoutSessions.started_at,
      clock_started_at: workoutSessions.clock_started_at,
    })
    .from(workoutSessions)
    .where(eq(workoutSessions.id, id))
    .get();
  // BLD-630: duration is anchored to first-completed-set when available;
  // fall back to started_at for legacy rows / sessions with no completed sets.
  const anchor = session ? (session.clock_started_at ?? session.started_at) : 0;
  const duration = session ? Math.floor((now - anchor) / 1000) : 0;
  await db.update(workoutSessions)
    .set({ completed_at: now, duration_seconds: duration, notes: notes ?? "" })
    .where(eq(workoutSessions.id, id));
}

export async function cancelSession(id: string): Promise<void> {
  const db = await getDrizzle();
  // Delete the requested session
  await db.delete(workoutSets).where(eq(workoutSets.session_id, id));
  await db.delete(workoutSessions).where(eq(workoutSessions.id, id));
  // Clean up any other orphan sessions (completed_at IS NULL).
  // NOTE: This sweep is intentional for the LIVE in-progress cancel flow only —
  // it discards stale unfinished sessions left over from prior crashes/exits.
  // Do NOT call cancelSession() to delete a completed (history) session: a
  // concurrently in-progress workout would be silently destroyed. Use
  // deleteCompletedSession() for targeted history deletes (BLD-690).
  const orphans = await db.select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(sql`${workoutSessions.completed_at} IS NULL`);
  for (const o of orphans) {
    await db.delete(workoutSets).where(eq(workoutSets.session_id, o.id));
    await db.delete(workoutSessions).where(eq(workoutSessions.id, o.id));
  }
}

/**
 * Delete a completed (history) session and ONLY its sets — no orphan sweep.
 *
 * Intended for the Edit-mode "Delete workout" affordance. The caller is
 * responsible for ensuring `id` refers to a session the user explicitly
 * chose to delete; in-progress sessions (`completed_at IS NULL`) other than
 * the target are NEVER touched, so a concurrent live workout is preserved.
 *
 * Wraps the two deletes in `withTransaction` (per repo convention — matches
 * `editCompletedSession` / `createTemplateFromSession`) so the operation is
 * atomic and serialized through the shared txQueue.
 *
 * Defense-in-depth (reviewer suggestion 7dd1ce22): the DELETE on
 * workout_sessions is gated by `completed_at IS NOT NULL` so accidental
 * misuse from a non-history flow cannot wipe an in-progress session row.
 * If `id` does not reference a completed session, both deletes become
 * no-ops — including the workoutSets delete being scoped to the same id.
 */
export async function deleteCompletedSession(id: string): Promise<void> {
  const db = await getDrizzle();
  await withTransaction(async () => {
    // Sets first — only ones owned by this session (always safe regardless
    // of whether the session row qualifies for deletion below).
    await db.delete(workoutSets).where(eq(workoutSets.session_id, id));
    // Session row: targeted by id AND guarded by completed_at IS NOT NULL.
    await db.delete(workoutSessions).where(and(
      eq(workoutSessions.id, id),
      isNotNull(workoutSessions.completed_at),
    ));
  });
}

export async function getRecentSessions(
  limit = 20
): Promise<WorkoutSession[]> {
  const db = await getDrizzle();
  return db.select()
    .from(workoutSessions)
    .where(isNotNull(workoutSessions.completed_at))
    .orderBy(desc(workoutSessions.started_at))
    .limit(limit) as unknown as Promise<WorkoutSession[]>;
}

export async function getSessionById(
  id: string
): Promise<WorkoutSession | null> {
  const db = await getDrizzle();
  const row = await db.select()
    .from(workoutSessions)
    .where(eq(workoutSessions.id, id))
    .get();
  return (row as unknown as WorkoutSession) ?? null;
}

export async function getActiveSession(): Promise<WorkoutSession | null> {
  const db = await getDrizzle();
  const row = await db.select()
    .from(workoutSessions)
    .where(sql`${workoutSessions.completed_at} IS NULL`)
    .orderBy(desc(workoutSessions.started_at))
    .limit(1)
    .get();
  return (row as unknown as WorkoutSession) ?? null;
}

// ---- Session Rating & Notes ----

export async function updateSession(
  id: string,
  fields: { rating?: number | null; notes?: string }
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (fields.rating !== undefined) updates.rating = fields.rating;
  if (fields.notes !== undefined) updates.notes = fields.notes;
  if (Object.keys(updates).length === 0) return;

  const db = await getDrizzle();
  await db.update(workoutSessions)
    .set(updates)
    .where(eq(workoutSessions.id, id));
}

// ---- Save Session as Template ----

export async function createTemplateFromSession(
  sessionId: string,
  name: string
): Promise<string> {
  const db = await getDrizzle();

  const newTemplateId = uuid();
  const now = Date.now();

  await withTransaction(async () => {
    await db.insert(workoutTemplates).values({
      id: newTemplateId,
      name,
      created_at: now,
      updated_at: now,
      is_starter: 0,
      source: null,
    });

    const sets = await db.select({
      exercise_id: workoutSets.exercise_id,
      set_number: workoutSets.set_number,
      reps: workoutSets.reps,
      link_id: workoutSets.link_id,
      set_type: workoutSets.set_type,
    })
      .from(workoutSets)
      .where(and(eq(workoutSets.session_id, sessionId), eq(workoutSets.completed, 1)))
      .orderBy(asc(workoutSets.exercise_id), asc(workoutSets.set_number));

    if (sets.length === 0) return;

    const exerciseOrder: string[] = [];
    const exerciseGroups = new Map<string, typeof sets>();
    for (const s of sets) {
      if (!exerciseGroups.has(s.exercise_id)) {
        exerciseOrder.push(s.exercise_id);
        exerciseGroups.set(s.exercise_id, []);
      }
      exerciseGroups.get(s.exercise_id)!.push(s);
    }

    const linkMap = new Map<string, string>();

    for (let i = 0; i < exerciseOrder.length; i++) {
      const exerciseId = exerciseOrder[i];
      const group = exerciseGroups.get(exerciseId)!;
      const teId = uuid();

      const firstSet = group[0];
      let linkId: string | null = firstSet.link_id;
      if (linkId) {
        if (!linkMap.has(linkId)) linkMap.set(linkId, uuid());
        linkId = linkMap.get(linkId)!;
      }

      const maxReps = Math.max(...group.map((s) => s.reps ?? 0));
      const targetReps = maxReps > 0 ? String(maxReps) : "8-12";

      await db.insert(templateExercises).values({
        id: teId,
        template_id: newTemplateId,
        exercise_id: exerciseId,
        position: i,
        target_sets: group.length,
        target_reps: targetReps,
        rest_seconds: 90,
        link_id: linkId,
        link_label: "",
        set_types: JSON.stringify(group.map((s) => s.set_type ?? "normal")),
      });
    }
  });

  return newTemplateId;
}

// ---- Exercise Swap ----

export async function swapExerciseInSession(
  sessionId: string,
  oldExerciseId: string,
  newExerciseId: string
): Promise<string[]> {
  const db = await getDrizzle();
  const rows = await db.select({ id: workoutSets.id })
    .from(workoutSets)
    .where(and(
      eq(workoutSets.session_id, sessionId),
      eq(workoutSets.exercise_id, oldExerciseId),
      eq(workoutSets.completed, 0),
    ));

  const setIds = rows.map((r) => r.id);
  if (setIds.length === 0) return [];

  await db.update(workoutSets)
    .set({ exercise_id: newExerciseId, swapped_from_exercise_id: oldExerciseId })
    .where(inArray(workoutSets.id, setIds));

  return setIds;
}

export async function undoSwapInSession(
  setIds: string[],
  originalExerciseId: string
): Promise<void> {
  if (setIds.length === 0) return;
  const db = await getDrizzle();
  await db.update(workoutSets)
    .set({ exercise_id: originalExerciseId, swapped_from_exercise_id: null })
    .where(inArray(workoutSets.id, setIds));
}

// ---- Edit Completed Session (BLD-690) ----

/**
 * PATCH-style upsert for a single set in a completed session.
 * Only fields explicitly present (not `undefined`) are written; untouched
 * columns are preserved on existing rows. `id` absent ⇒ insert with fresh uuid.
 */
export interface SessionEditSetPatch {
  id?: string;
  exercise_id: string;
  set_number?: number;
  weight?: number | null;
  reps?: number | null;
  completed?: 0 | 1;
  completed_at?: number | null;
  rpe?: number | null;
  notes?: string;
  link_id?: string | null;
  round?: number | null;
  tempo?: string | null;
  swapped_from_exercise_id?: string | null;
  set_type?: string;
  duration_seconds?: number | null;
  exercise_position?: number;
  bodyweight_modifier_kg?: number | null;
}

export interface SessionEditPayload {
  upserts: SessionEditSetPatch[];
  deletes: string[];
}

export class EditCompletedSessionError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "EditCompletedSessionError";
  }
}

/**
 * Edit a completed session atomically. All inserts / updates / deletes happen
 * inside a single `withTransaction` block. After mutations settle,
 * `set_number` is renumbered contiguously per (session_id, exercise_id) — only
 * `set_number` is touched; `link_id`, `round`, and every other column are
 * preserved. `workout_sessions.edited_at` is stamped to `now` inside the same
 * transaction so the edit pill appears as soon as the next read happens.
 */
export async function editCompletedSession(
  sessionId: string,
  payload: SessionEditPayload,
  now: number = Date.now(),
): Promise<void> {
  const upserts = payload.upserts ?? [];
  const deletes = payload.deletes ?? [];

  // ── Validation (defense in depth — mirrors client) ──────────────────────
  for (const u of upserts) {
    if (u.weight != null && u.weight < 0) {
      throw new EditCompletedSessionError(
        "weight must be ≥ 0",
        "invalid_weight",
      );
    }
    if (u.reps != null && u.reps < 0) {
      throw new EditCompletedSessionError(
        "reps must be ≥ 0",
        "invalid_reps",
      );
    }
    // Auto-flip completed=1 + reps=0 → completed=0 (per AC #12).
    if (u.completed === 1 && u.reps != null && u.reps < 1) {
      u.completed = 0;
      u.completed_at = null;
    }
    if (!u.id) {
      // Insert path: must specify exercise_id at minimum.
      if (!u.exercise_id) {
        throw new EditCompletedSessionError(
          "exercise_id required for inserts",
          "missing_exercise_id",
        );
      }
    }
  }

  const db = await getDrizzle();

  await withTransaction(async () => {
    if (deletes.length > 0) {
      await db.delete(workoutSets).where(and(
        eq(workoutSets.session_id, sessionId),
        inArray(workoutSets.id, deletes),
      ));
    }
    for (const u of upserts) {
      if (u.id) {
        await applyEditUpdate(db, sessionId, u, now);
      } else {
        await applyEditInsert(db, sessionId, u, now);
      }
    }
    await renumberSessionSets(db, sessionId);
    await db.update(workoutSessions)
      .set({ edited_at: now })
      .where(eq(workoutSessions.id, sessionId));
  });
}

const PATCHABLE_COLUMNS: ReadonlyArray<keyof SessionEditSetPatch> = [
  "set_number", "weight", "reps", "completed", "rpe", "notes", "link_id",
  "round", "tempo", "swapped_from_exercise_id", "set_type",
  "duration_seconds", "exercise_position", "bodyweight_modifier_kg",
];

async function applyEditUpdate(
  db: Awaited<ReturnType<typeof getDrizzle>>,
  sessionId: string,
  u: SessionEditSetPatch,
  now: number,
): Promise<void> {
  const updates: Record<string, unknown> = {};
  for (const k of PATCHABLE_COLUMNS) {
    if (u[k] !== undefined) updates[k as string] = u[k];
  }
  if (u.exercise_id !== undefined) updates.exercise_id = u.exercise_id;

  // completed_at semantics: caller value wins; 0→1 stamps now; 1→0 nulls.
  if (u.completed_at !== undefined) {
    updates.completed_at = u.completed_at;
  } else if (u.completed === 1) {
    updates.completed_at = now;
  } else if (u.completed === 0) {
    updates.completed_at = null;
  }

  if (Object.keys(updates).length === 0) return;
  await db.update(workoutSets)
    .set(updates)
    .where(and(eq(workoutSets.id, u.id!), eq(workoutSets.session_id, sessionId)));
}

async function applyEditInsert(
  db: Awaited<ReturnType<typeof getDrizzle>>,
  sessionId: string,
  u: SessionEditSetPatch,
  now: number,
): Promise<void> {
  const completed: 0 | 1 = u.completed ?? 0;
  const completedAt = u.completed_at !== undefined
    ? u.completed_at
    : completed === 1 ? now : null;
  const newRow = buildEditInsertRow(sessionId, u, completed, completedAt);
  await db.insert(workoutSets).values(newRow as never);
}

function buildEditInsertRow(
  sessionId: string,
  u: SessionEditSetPatch,
  completed: 0 | 1,
  completedAt: number | null,
): Record<string, unknown> {
  return {
    id: uuid(),
    session_id: sessionId,
    exercise_id: u.exercise_id,
    set_number: u.set_number ?? 1,
    weight: u.weight ?? null,
    reps: u.reps ?? null,
    completed,
    completed_at: completedAt,
    rpe: u.rpe ?? null,
    notes: u.notes ?? "",
    link_id: u.link_id ?? null,
    round: u.round ?? null,
    tempo: u.tempo ?? null,
    swapped_from_exercise_id: u.swapped_from_exercise_id ?? null,
    set_type: u.set_type ?? "normal",
    duration_seconds: u.duration_seconds ?? null,
    exercise_position: u.exercise_position ?? 0,
    bodyweight_modifier_kg: u.bodyweight_modifier_kg ?? null,
  };
}

async function renumberSessionSets(
  db: Awaited<ReturnType<typeof getDrizzle>>,
  sessionId: string,
): Promise<void> {
  // Renumber set_number contiguously per (session, exercise_id). Only
  // set_number is touched; link_id, round, and every other column are
  // preserved verbatim (techlead blocker #4).
  const remaining = await db.select({
    id: workoutSets.id,
    exercise_id: workoutSets.exercise_id,
    set_number: workoutSets.set_number,
  })
    .from(workoutSets)
    .where(eq(workoutSets.session_id, sessionId))
    .orderBy(asc(workoutSets.exercise_id), asc(workoutSets.set_number));

  const groups = new Map<string, typeof remaining>();
  for (const r of remaining) {
    if (!groups.has(r.exercise_id)) groups.set(r.exercise_id, []);
    groups.get(r.exercise_id)!.push(r);
  }
  for (const [, rows] of groups) {
    for (let i = 0; i < rows.length; i++) {
      const expected = i + 1;
      if (rows[i].set_number !== expected) {
        await db.update(workoutSets)
          .set({ set_number: expected })
          .where(eq(workoutSets.id, rows[i].id));
      }
    }
  }
}
