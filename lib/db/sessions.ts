import { eq, sql, desc, isNotNull } from "drizzle-orm";
import type { WorkoutSession } from "../types";
import { uuid } from "../uuid";
import { getDrizzle, query, execute, getDatabase } from "./helpers";
import { workoutSessions, workoutSets } from "./schema";

// Re-export from split modules for backward compatibility
export {
  getSessionSets,
  addSet,
  addSetsBatch,
  updateSet,
  updateSetsBatch,
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
  getSessionSetCount,
  getSessionAvgRPE,
  getRestSecondsForExercise,
  getRestSecondsForLink,
  getSourceSessionSets,
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
  getRecentPRs,
  getSessionRepPRs,
  getSessionComparison,
  getSessionWeightIncreases,
  getSessionCountsByDay,
  getTotalSessionCount,
  getMuscleVolumeForWeek,
  getMuscleVolumeTrend,
} from "./session-stats";

export {
  getExerciseHistory,
  getExerciseRecords,
  getExercise1RMChartData,
  getExerciseChartData,
  getRecentExerciseSets,
  getBestSet,
} from "./exercise-history";
export type { ExerciseSession, ExerciseRecords } from "./exercise-history";

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

  const newTemplateId = uuid();
  const now = Date.now();

  await database.withTransactionAsync(async () => {
    await database.runAsync(
      "INSERT INTO workout_templates (id, name, created_at, updated_at, is_starter) VALUES (?, ?, ?, ?, 0)",
      [newTemplateId, name, now, now]
    );

    const sets = await database.getAllAsync<{
      exercise_id: string;
      set_number: number;
      reps: number | null;
      link_id: string | null;
      training_mode: string | null;
    }>(
      `SELECT exercise_id, set_number, reps, link_id, training_mode
       FROM workout_sets
       WHERE session_id = ? AND completed = 1
       ORDER BY exercise_id, set_number ASC`,
      [sessionId]
    );

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

      await database.runAsync(
        "INSERT INTO template_exercises (id, template_id, exercise_id, position, target_sets, target_reps, rest_seconds, link_id, link_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [teId, newTemplateId, exerciseId, i, group.length, targetReps, 90, linkId, ""]
      );
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
  const rows = await query<{ id: string }>(
    `SELECT id FROM workout_sets
     WHERE session_id = ? AND exercise_id = ? AND completed = 0`,
    [sessionId, oldExerciseId]
  );

  const setIds = rows.map((r) => r.id);
  if (setIds.length === 0) return [];

  const placeholders = setIds.map(() => "?").join(",");
  await execute(
    `UPDATE workout_sets SET exercise_id = ?, swapped_from_exercise_id = ? WHERE id IN (${placeholders})`,
    [newExerciseId, oldExerciseId, ...setIds]
  );

  return setIds;
}

export async function undoSwapInSession(
  setIds: string[],
  originalExerciseId: string
): Promise<void> {
  if (setIds.length === 0) return;
  const placeholders = setIds.map(() => "?").join(",");
  await execute(
    `UPDATE workout_sets SET exercise_id = ?, swapped_from_exercise_id = NULL WHERE id IN (${placeholders})`,
    [originalExerciseId, ...setIds]
  );
}
