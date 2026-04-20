import { eq, sql, desc, isNotNull, and, asc, inArray } from "drizzle-orm";
import type { WorkoutSession } from "../types";
import { uuid } from "../uuid";
import { getDrizzle, getDatabase, query } from "./helpers";
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
  updateSetTrainingMode,
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
  getSourceSessionSets,
  updateExercisePositions,
} from "./session-sets";
export type { SourceSessionSet } from "./session-sets";

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
    completed_at: null,
    duration_seconds: null,
    notes: "",
    rating: null,
  };
}

export async function completeSession(
  id: string,
  notes?: string
): Promise<void> {
  const now = Date.now();
  const db = await getDrizzle();
  const session = await db.select({ started_at: workoutSessions.started_at })
    .from(workoutSessions)
    .where(eq(workoutSessions.id, id))
    .get();
  const duration = session ? Math.floor((now - session.started_at) / 1000) : 0;
  await db.update(workoutSessions)
    .set({ completed_at: now, duration_seconds: duration, notes: notes ?? "" })
    .where(eq(workoutSessions.id, id));
}

export async function cancelSession(id: string): Promise<void> {
  const db = await getDrizzle();
  await db.delete(workoutSets).where(eq(workoutSets.session_id, id));
  await db.delete(workoutSessions).where(eq(workoutSessions.id, id));
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
  const database = await getDatabase();
  const db = await getDrizzle();

  const newTemplateId = uuid();
  const now = Date.now();

  await database.withTransactionAsync(async () => {
    await db.insert(workoutTemplates).values({
      id: newTemplateId,
      name,
      created_at: now,
      updated_at: now,
      is_starter: 0,
    });

    const sets = await db.select({
      exercise_id: workoutSets.exercise_id,
      set_number: workoutSets.set_number,
      reps: workoutSets.reps,
      link_id: workoutSets.link_id,
      training_mode: workoutSets.training_mode,
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
