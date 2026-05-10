/**
 * Session pacing DB queries (BLD-1144).
 * Reads only existing columns — no schema migration.
 * Columns: workout_sets.{exercise_id, completed_at, duration_seconds, reps}
 *           workout_sessions.{started_at, completed_at, edited_at}
 */

import { getDatabase } from "./helpers";
import type { PacingSet, PacingSession } from "@/lib/session-pacing";

export async function getSessionPacingSets(sessionId: string): Promise<PacingSet[]> {
  const db = await getDatabase();
  return db.getAllAsync<PacingSet>(
    `SELECT exercise_id, completed_at, duration_seconds, reps
     FROM workout_sets
     WHERE session_id = ? AND completed = 1 AND completed_at IS NOT NULL
     ORDER BY completed_at ASC`,
    [sessionId]
  );
}

export async function getPacingSession(sessionId: string): Promise<PacingSession | null> {
  const db = await getDatabase();
  return db.getFirstAsync<PacingSession>(
    `SELECT started_at, completed_at, edited_at FROM workout_sessions WHERE id = ?`,
    [sessionId]
  );
}
