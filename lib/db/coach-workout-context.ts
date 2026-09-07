import type { MuscleGroup } from "../types";
import { getAllExercises } from "./exercises";
import { getCompletedSessionsWithSetCount } from "./session-stats";
import { getRecentExerciseSetsBatch } from "./exercise-history";
import { getDayMuscleGroups } from "./calendar";
import type { ComparableHistory, DraftContext } from "../coach-workout-draft";

export type CoachContextFailure = { kind: "context_unavailable"; message: string; cause?: unknown };
export type CoachContextReader = () => Promise<DraftContext | CoachContextFailure>;

export type ContextSetRow = {
  session_id: string;
  completed: number;
  set_type?: string | null;
  weight: number | null;
  reps: number | null;
};

/** Keep only completed normal working sets from completed normal workouts. */
export function filterComparableHistory(rows: ContextSetRow[], normalSessionIds: ReadonlySet<string>): ComparableHistory[] {
  return rows
    .filter(row => normalSessionIds.has(row.session_id) && row.completed === 1 && row.set_type === "normal" && row.weight != null && row.reps != null)
    .map(row => ({ weightKg: Number(row.weight), reps: Number(row.reps), sessionId: row.session_id, completedWorkingSet: true as const }));
}

export async function readCoachWorkoutContext(nowMs = Date.now()): Promise<DraftContext | CoachContextFailure> {
  try {
    const exercises = (await getAllExercises()).filter(e => !e.deleted_at);
    const sessions = (await getCompletedSessionsWithSetCount(8)).filter(s => s.kind === "workout");
    const normalSessionIds = new Set(sessions.map(s => s.id));
    const historyRows = await getRecentExerciseSetsBatch(exercises.map(e => e.id), 3);
    const historyByExercise: Record<string, ComparableHistory[]> = {};
    for (const ex of exercises) {
      const rows = historyRows[ex.id] ?? [];
      historyByExercise[ex.id] = filterComparableHistory(rows, normalSessionIds);
    }
    const local = new Date(nowMs);
    const date = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    const recentlyTrainedMuscles = (await getDayMuscleGroups(date)) as MuscleGroup[];
    return { exercises, completedSessions: sessions.map(s => ({ startedAt: s.started_at, durationMinutes: s.duration_seconds == null ? null : s.duration_seconds / 60, setCount: Number(s.set_count ?? 0) })), historyByExercise, recentlyTrainedMuscles, nowMs };
  } catch (cause) {
    return { kind: "context_unavailable", message: "Local workout context is temporarily unavailable; please retry or clarify the equipment.", cause };
  }
}
