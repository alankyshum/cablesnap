import type { WorkoutSession } from "../types";
import { uuid } from "../uuid";
import { query, queryOne, execute, getDatabase } from "./helpers";

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

export { getE1RMTrends } from "./e1rm-trends";
export type { E1RMTrendRow } from "./e1rm-trends";

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

// ---- Sessions ----

export async function startSession(
  templateId: string | null,
  name: string,
  programDayId?: string
): Promise<WorkoutSession> {
  const id = uuid();
  const now = Date.now();
  await execute(
    "INSERT INTO workout_sessions (id, template_id, name, started_at, notes, program_day_id) VALUES (?, ?, ?, ?, '', ?)",
    [id, templateId, name, now, programDayId ?? null]
  );
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
  const session = await queryOne<{ started_at: number }>(
    "SELECT started_at FROM workout_sessions WHERE id = ?",
    [id]
  );
  const duration = session ? Math.floor((now - session.started_at) / 1000) : 0;
  await execute(
    "UPDATE workout_sessions SET completed_at = ?, duration_seconds = ?, notes = ? WHERE id = ?",
    [now, duration, notes ?? "", id]
  );
}

export async function cancelSession(id: string): Promise<void> {
  await execute("DELETE FROM workout_sets WHERE session_id = ?", [id]);
  await execute("DELETE FROM workout_sessions WHERE id = ?", [id]);
}

export async function getRecentSessions(
  limit = 20
): Promise<WorkoutSession[]> {
  return query<WorkoutSession>(
    "SELECT * FROM workout_sessions WHERE completed_at IS NOT NULL ORDER BY started_at DESC LIMIT ?",
    [limit]
  );
}

export async function getSessionById(
  id: string
): Promise<WorkoutSession | null> {
  return queryOne<WorkoutSession>(
    "SELECT * FROM workout_sessions WHERE id = ?",
    [id]
  );
}

export async function getActiveSession(): Promise<WorkoutSession | null> {
  return queryOne<WorkoutSession>(
    "SELECT * FROM workout_sessions WHERE completed_at IS NULL ORDER BY started_at DESC LIMIT 1"
  );
}

// ---- Session Rating & Notes ----

export async function updateSession(
  id: string,
  fields: { rating?: number | null; notes?: string }
): Promise<void> {
  const clauses: string[] = [];
  const params: (string | number | null)[] = [];

  if (fields.rating !== undefined) {
    clauses.push("rating = ?");
    params.push(fields.rating);
  }
  if (fields.notes !== undefined) {
    clauses.push("notes = ?");
    params.push(fields.notes);
  }
  if (clauses.length === 0) return;

  params.push(id);
  await execute(
    `UPDATE workout_sessions SET ${clauses.join(", ")} WHERE id = ?`,
    params
  );
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
