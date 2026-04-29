/**
 * Database insertion for CSV-imported workout sessions.
 * Single-transaction insertion matching the existing importData() pattern.
 * BLD-890
 */
import { getDatabase, withTransaction } from "./helpers";
import { uuid } from "../uuid";
import type { ImportedSession } from "../csv-import";
import type { MatchResult } from "../exercise-matcher";
import type { NlpResult } from "../exercise-nlp";
import type { Category, Equipment, Difficulty, MuscleGroup } from "../types";

// ---- Types ----

export type CsvImportProgress = {
  current: number;
  total: number;
  phase: "inserting" | "done";
};

export type CsvImportResult = {
  batchId: string;
  sessionsInserted: number;
  setsInserted: number;
  exercisesCreated: number;
  skippedSets: number;
};

// ---- Helpers ----

function nlpToDbValues(nlp: NlpResult): {
  category: Category;
  equipment: Equipment;
  difficulty: Difficulty;
  primary_muscles: string;
  secondary_muscles: string;
} {
  return {
    category: nlp.category ?? "arms",
    equipment: nlp.equipment ?? "other",
    difficulty: nlp.difficulty ?? "intermediate",
    primary_muscles: (nlp.primary_muscles as MuscleGroup[]).join(",") || "full_body",
    secondary_muscles: (nlp.secondary_muscles as MuscleGroup[]).join(","),
  };
}

// ---- Main import function ----

/**
 * Import parsed CSV sessions into the database within a single transaction.
 *
 * @param sessions - Parsed and weight-converted sessions
 * @param matchResults - Exercise match results keyed by lowercase raw name
 * @param onProgress - Optional progress callback
 */
export async function importCsvSessions(
  sessions: ImportedSession[],
  matchResults: Map<string, MatchResult>,
  onProgress?: (progress: CsvImportProgress) => void,
): Promise<CsvImportResult> {
  // Guard: block import if a workout is currently in progress
  if (await hasActiveWorkout()) {
    throw new Error("Cannot import while a workout is in progress. Please finish or discard your current workout first.");
  }

  const batchId = uuid();
  let sessionsInserted = 0;
  let setsInserted = 0;
  let exercisesCreated = 0;
  let skippedSets = 0;

  // Pre-resolve exercise IDs: create new exercises for unmatched names
  const exerciseIdMap = new Map<string, string>(); // lowercase raw name → exercise ID
  const newExercises: { id: string; nlp: NlpResult; rawName: string }[] = [];

  for (const [lowerName, result] of matchResults.entries()) {
    if (result.bestMatch && result.bestMatch.confidence !== "low") {
      // Use matched exercise
      exerciseIdMap.set(lowerName, result.bestMatch.exercise.id);
    } else if (result.bestMatch) {
      // Low confidence — still use the best match but could be overridden by UI
      exerciseIdMap.set(lowerName, result.bestMatch.exercise.id);
    } else {
      // No match — create new custom exercise
      const newId = uuid();
      exerciseIdMap.set(lowerName, newId);
      newExercises.push({ id: newId, nlp: result.nlpResult, rawName: result.rawName });
    }
  }

  await withTransaction(async (database) => {
    // 1. Create new custom exercises for unmatched names
    for (const { id, nlp, rawName } of newExercises) {
      const dbVals = nlpToDbValues(nlp);
      await database.runAsync(
        `INSERT OR IGNORE INTO exercises (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty, is_custom)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [id, rawName, dbVals.category, dbVals.primary_muscles, dbVals.secondary_muscles, dbVals.equipment, "", dbVals.difficulty]
      );
      exercisesCreated++;
    }

    // 2. Insert sessions and sets
    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      const sessionId = uuid();
      const startedAt = session.date;
      const completedAt = session.durationSeconds
        ? startedAt + session.durationSeconds * 1000
        : startedAt;
      const durationSeconds = session.durationSeconds ?? 0;

      await database.runAsync(
        `INSERT INTO workout_sessions (id, template_id, name, started_at, completed_at, duration_seconds, notes, import_batch_id)
         VALUES (?, NULL, ?, ?, ?, ?, '', ?)`,
        [sessionId, session.name, startedAt, completedAt, durationSeconds, batchId]
      );
      sessionsInserted++;

      // Insert sets for this session
      for (const set of session.sets) {
        const exerciseId = exerciseIdMap.get(set.exerciseRawName.toLowerCase().trim());
        if (!exerciseId) {
          skippedSets++;
          continue;
        }

        const setId = uuid();
        await database.runAsync(
          `INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed, completed_at, rpe, notes, set_type)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'normal')`,
          [
            setId,
            sessionId,
            exerciseId,
            set.setNumber,
            set.weight,
            set.reps,
            completedAt,
            set.rpe,
            set.notes,
          ]
        );
        setsInserted++;
      }

      onProgress?.({ current: i + 1, total: sessions.length, phase: "inserting" });
    }
  });

  onProgress?.({ current: sessions.length, total: sessions.length, phase: "done" });

  return { batchId, sessionsInserted, setsInserted, exercisesCreated, skippedSets };
}

/**
 * Delete all sessions and their sets for a given import batch ID (undo import).
 */
export async function undoCsvImport(batchId: string): Promise<{ sessionsDeleted: number }> {
  const database = await getDatabase();
  // Get session IDs first for cascading set deletion
  const sessions = await database.getAllAsync<{ id: string }>(
    "SELECT id FROM workout_sessions WHERE import_batch_id = ?",
    [batchId]
  );

  if (sessions.length === 0) return { sessionsDeleted: 0 };

  await withTransaction(async (db) => {
    for (const { id } of sessions) {
      await db.runAsync("DELETE FROM workout_sets WHERE session_id = ?", [id]);
    }
    await db.runAsync("DELETE FROM workout_sessions WHERE import_batch_id = ?", [batchId]);
  });

  return { sessionsDeleted: sessions.length };
}

/**
 * Check if there is an active (in-progress) workout session.
 * Import should be blocked if a workout is in progress.
 */
export async function hasActiveWorkout(): Promise<boolean> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM workout_sessions WHERE completed_at IS NULL"
  );
  return (row?.cnt ?? 0) > 0;
}
