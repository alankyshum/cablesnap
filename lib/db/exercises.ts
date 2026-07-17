import { eq, and, isNull, inArray } from "drizzle-orm";
import type { Exercise } from "../types";
import { safeParse } from "../safe-parse";
import { uuid } from "../uuid";
import { getDrizzle, query, withTransaction } from "./helpers";
import { exercises, templateExercises } from "./schema";
import type { ExerciseRow } from "./schema";
import { getWorkingRepsForOverloadDecision } from "../sets-accessors";
import type { SetSegment, SetType } from "../types";

function mapRow(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    category: row.category as Exercise["category"],
    primary_muscles: safeParse(row.primary_muscles, [] as Exercise["primary_muscles"], "exercises.primary_muscles"),
    secondary_muscles: safeParse(row.secondary_muscles, [] as Exercise["secondary_muscles"], "exercises.secondary_muscles"),
    equipment: row.equipment as Exercise["equipment"],
    instructions: row.instructions,
    difficulty: row.difficulty as Exercise["difficulty"],
    is_custom: row.is_custom === 1,
    deleted_at: row.deleted_at ?? undefined,
    attachment: (row.attachment as Exercise["attachment"]) ?? undefined,
    is_voltra: row.is_voltra === 1 ? true : undefined,
    // BLD-561: optional user-supplied illustration URIs (custom exercises only).
    start_image_uri: row.start_image_uri ?? undefined,
    end_image_uri: row.end_image_uri ?? undefined,
    // BLD-913: progression chain data.
    progression_group: row.progression_group ?? undefined,
    progression_order: row.progression_order ?? undefined,
    // BLD-1028: pinned per-exercise notes.
    notes: row.notes ?? undefined,
    notes_updated_at: row.notes_updated_at ?? undefined,
    notes_backfill_dismissed_at: row.notes_backfill_dismissed_at ?? undefined,
    max_pulley_pins: row.max_pulley_pins ?? undefined,
    // BLD-1158: per-exercise default tempo.
    default_tempo: row.default_tempo ?? undefined,
    // BLD-2561: persisted preferred substitute.
    preferred_substitute_id: row.preferred_substitute_id ?? undefined,
    preferred_substitute_updated_at: row.preferred_substitute_updated_at ?? undefined,
    track_unilateral: row.track_unilateral === 1,
  };
}

export { mapRow, type ExerciseRow };

// ---- E2E deterministic fixture (BLD-526) ----
//
// The static `expo export -p web` bundle used for Playwright visual regression
// boots wa-sqlite asynchronously; on slow CI runners the initial exercises
// query is still loading when the screenshot fires, so baselines captured the
// empty-list state (parent BLD-517). To make the list screen deterministic,
// allow Playwright to inject a pre-shaped fixture array onto `window` via
// `addInitScript`. The check is double-hardened: the flag is only honored
// when `navigator.webdriver === true`, so a console-injected flag in a real
// user's browser can never swap their data.
function readE2EFixture(): Exercise[] | null {
  if (typeof window === "undefined") return null;
  const nav =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { webdriver?: boolean })
      : null;
  if (!nav?.webdriver) return null;
  const flag = (window as unknown as { __E2E_EXERCISE_FIXTURE__?: unknown })
    .__E2E_EXERCISE_FIXTURE__;
  if (!Array.isArray(flag)) return null;
  return flag as Exercise[];
}

export async function getAllExercises(): Promise<Exercise[]> {
  const fixture = readE2EFixture();
  if (fixture) {
    // Honor prod ordering (by name, asc) so snapshots mirror real render.
    return [...fixture].sort((a, b) => a.name.localeCompare(b.name));
  }
  const db = await getDrizzle();
  const rows = await db.select()
    .from(exercises)
    .where(isNull(exercises.deleted_at))
    .orderBy(exercises.name);
  return (rows as unknown as ExerciseRow[]).map(mapRow);
}

export async function getExerciseById(id: string): Promise<Exercise | null> {
  const fixture = readE2EFixture();
  if (fixture) {
    return fixture.find((e) => e.id === id) ?? null;
  }
  const db = await getDrizzle();
  const row = await db.select()
    .from(exercises)
    .where(eq(exercises.id, id))
    .get();
  if (!row) return null;
  return mapRow(row as unknown as ExerciseRow);
}

export async function getExercisesByIds(
  exerciseIds: string[]
): Promise<Record<string, Exercise>> {
  if (exerciseIds.length === 0) return {};
  const db = await getDrizzle();
  const rows = await db.select().from(exercises).where(inArray(exercises.id, exerciseIds));
  const result: Record<string, Exercise> = {};
  for (const row of rows as unknown as ExerciseRow[]) result[row.id] = mapRow(row);
  return result;
}

export async function createCustomExercise(
  exercise: Omit<Exercise, "id" | "is_custom">
): Promise<Exercise> {
  const id = uuid();
  const db = await getDrizzle();
  await db.insert(exercises).values({
    id,
    name: exercise.name,
    category: exercise.category,
    primary_muscles: JSON.stringify(exercise.primary_muscles),
    secondary_muscles: JSON.stringify(exercise.secondary_muscles),
    equipment: exercise.equipment,
    instructions: exercise.instructions,
    difficulty: exercise.difficulty,
    is_custom: 1,
  });
  return { ...exercise, id, is_custom: true };
}

export async function updateCustomExercise(
  id: string,
  exercise: Partial<Omit<Exercise, "id" | "is_custom">>
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (exercise.name !== undefined) updates.name = exercise.name;
  if (exercise.category !== undefined) updates.category = exercise.category;
  if (exercise.primary_muscles !== undefined) updates.primary_muscles = JSON.stringify(exercise.primary_muscles);
  if (exercise.secondary_muscles !== undefined) updates.secondary_muscles = JSON.stringify(exercise.secondary_muscles);
  if (exercise.equipment !== undefined) updates.equipment = exercise.equipment;
  if (exercise.instructions !== undefined) updates.instructions = exercise.instructions;
  if (exercise.difficulty !== undefined) updates.difficulty = exercise.difficulty;
  // BLD-1158: include default_tempo when provided (null = clear; undefined = no-op).
  if ("default_tempo" in exercise) updates.default_tempo = exercise.default_tempo ?? null;
  if (Object.keys(updates).length === 0) return;

  const db = await getDrizzle();
  await db.update(exercises)
    .set(updates)
    .where(and(eq(exercises.id, id), eq(exercises.is_custom, 1)));
}

export async function updateMaxPulleyPins(exerciseId: string, maxPins: number | null): Promise<void> {
  if (maxPins !== null) {
    const n = Number(maxPins);
    if (!Number.isInteger(n) || n < 1 || n > 30) {
      throw new Error(`max_pulley_pins must be 1..30 or null, got: ${maxPins}`);
    }
  }
  const db = await getDrizzle();
  await db.update(exercises).set({ max_pulley_pins: maxPins }).where(eq(exercises.id, exerciseId));
}

export async function getMaxPulleyPins(exerciseId: string): Promise<number | null> {
  const db = await getDrizzle();
  const rows = await db.select({ max_pulley_pins: exercises.max_pulley_pins }).from(exercises).where(eq(exercises.id, exerciseId)).limit(1);
  return rows[0]?.max_pulley_pins ?? null;
}

// BLD-1158: per-exercise default tempo (E-B-C-T canonical form).
export async function getDefaultTempo(exerciseId: string): Promise<string | null> {
  const db = await getDrizzle();
  const rows = await db.select({ default_tempo: exercises.default_tempo }).from(exercises).where(eq(exercises.id, exerciseId)).limit(1);
  return rows[0]?.default_tempo ?? null;
}

export async function setDefaultTempo(exerciseId: string, tempo: string | null): Promise<void> {
  const db = await getDrizzle();
  await db.update(exercises).set({ default_tempo: tempo }).where(eq(exercises.id, exerciseId));
}

export async function updateTrackUnilateral(exerciseId: string, trackUnilateral: boolean): Promise<void> {
  const db = await getDrizzle();
  await db.update(exercises).set({ track_unilateral: trackUnilateral ? 1 : 0 }).where(eq(exercises.id, exerciseId));
}

export async function softDeleteCustomExercise(id: string): Promise<void> {
  await withTransaction(async () => {
    const db = await getDrizzle();
    await db.delete(templateExercises).where(eq(templateExercises.exercise_id, id));
    await db.update(exercises)
      .set({ deleted_at: Date.now() })
      .where(and(eq(exercises.id, id), eq(exercises.is_custom, 1)));
  });
}

export async function getTemplatesUsingExercise(
  exerciseId: string
): Promise<{ id: string; name: string }[]> {
  return query<{ id: string; name: string }>(
    `SELECT DISTINCT wt.id, wt.name
     FROM template_exercises te
     JOIN workout_templates wt ON wt.id = te.template_id
     WHERE te.exercise_id = ?`,
    [exerciseId]
  );
}

// ── BLD-913: Progression chain queries ────────────────────────────────────

export type ProgressionChainExercise = {
  id: string;
  name: string;
  progression_order: number;
  has_been_logged: boolean;
};

/**
 * Returns all exercises in the same progression chain as the given exercise,
 * ordered by progression_order. Each exercise includes a flag indicating
 * whether the user has logged at least one set for it.
 * Returns empty array if the exercise is not in a progression group or
 * the group has only one exercise.
 */
export async function getProgressionChain(
  exerciseId: string
): Promise<ProgressionChainExercise[]> {
  // First get the progression_group for this exercise
  const exercise = await query<{ progression_group: string | null }>(
    `SELECT progression_group FROM exercises WHERE id = ? AND deleted_at IS NULL`,
    [exerciseId]
  );
  const group = exercise[0]?.progression_group;
  if (!group) return [];

  const chain = await query<{
    id: string;
    name: string;
    progression_order: number;
    has_been_logged: number;
  }>(
    `SELECT e.id, e.name, e.progression_order,
            CASE WHEN EXISTS (
              SELECT 1 FROM workout_sets ws
              JOIN workout_sessions s ON s.id = ws.session_id
              WHERE ws.exercise_id = e.id
                AND s.completed_at IS NOT NULL
            ) THEN 1 ELSE 0 END AS has_been_logged
     FROM exercises e
     WHERE e.progression_group = ?
       AND e.deleted_at IS NULL
       AND e.progression_order IS NOT NULL
     ORDER BY e.progression_order ASC`,
    [group]
  );

  // Don't show chain if only one exercise (meaningless)
  if (chain.length <= 1) return [];

  return chain.map((r) => ({
    id: r.id,
    name: r.name,
    progression_order: r.progression_order,
    has_been_logged: r.has_been_logged === 1,
  }));
}

export type ProgressionSuggestion = {
  shouldSuggest: boolean;
  nextExercise: { id: string; name: string } | null;
  isTerminal: boolean;
};

/**
 * Determines whether a progression suggestion should be shown for an exercise.
 * Criteria (all must be true):
 * 1. User has >= 3 sessions with this exercise in last 30 days
 * 2. Most recent session: all normal completed sets had >= 12 reps
 * 3. Next exercise exists in chain
 * 4. User has NOT logged next exercise in last 30 days
 */
export async function getProgressionSuggestion(
  exerciseId: string,
  chain: ProgressionChainExercise[]
): Promise<ProgressionSuggestion> {
  const currentIdx = chain.findIndex((e) => e.id === exerciseId);
  if (currentIdx === -1) return { shouldSuggest: false, nextExercise: null, isTerminal: false };

  const isTerminal = currentIdx === chain.length - 1;
  if (isTerminal) return { shouldSuggest: false, nextExercise: null, isTerminal: true };

  const nextExercise = chain[currentIdx + 1];
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  // Check 1: >= 3 sessions in last 30 days
  const sessionCount = await query<{ count: number }>(
    `SELECT COUNT(DISTINCT ws.session_id) as count
     FROM workout_sets ws
     JOIN workout_sessions s ON s.id = ws.session_id
     WHERE ws.exercise_id = ?
       AND s.completed_at >= ?`,
    [exerciseId, thirtyDaysAgo]
  );
  if ((sessionCount[0]?.count ?? 0) < 3) {
    return { shouldSuggest: false, nextExercise: { id: nextExercise.id, name: nextExercise.name }, isTerminal: false };
  }

  // Check 2: most recent session — all normal completed sets had >= 12 reps
  const latestSession = await query<{ session_id: string }>(
    `SELECT ws.session_id
     FROM workout_sets ws
     JOIN workout_sessions s ON s.id = ws.session_id
     WHERE ws.exercise_id = ?
       AND s.completed_at IS NOT NULL
     ORDER BY s.completed_at DESC
     LIMIT 1`,
    [exerciseId]
  );
  if (latestSession.length === 0) {
    return { shouldSuggest: false, nextExercise: { id: nextExercise.id, name: nextExercise.name }, isTerminal: false };
  }

  // Load all completed work sets (normal + advanced) from the latest session.
  // BLD-1172: Behaviour change from pre-BLD-1168 code: the old guard required
  // set_type = 'normal'. Now advanced set types (rest_pause, cluster, myo_reps)
  // also count toward progression, using the first-segment reps via the named
  // accessor so that the rep count is not inflated by total-segment sums.
  // This is intentional per PLAN-BLD-1168 §Progression — advanced sets should
  // qualify a session for progression suggestions just as normal sets do.
  const workSets = await query<{ id: string; set_type: SetType; reps: number | null }>(
    `SELECT id, set_type, reps
     FROM workout_sets
     WHERE session_id = ?
       AND exercise_id = ?
       AND set_type IN ('normal', 'rest_pause', 'cluster', 'myo_reps')
       AND completed = 1`,
    [latestSession[0].session_id, exerciseId]
  );

  if (workSets.length === 0) {
    // No work sets logged in this session — skip suggestion.
    return { shouldSuggest: false, nextExercise: { id: nextExercise.id, name: nextExercise.name }, isTerminal: false };
  }

  // Batch-load all segments for the work sets in a single query (avoids N+1).
  const setIds = workSets.map((ws) => ws.id);
  const allSegments = await query<SetSegment>(
    `SELECT * FROM workout_set_segments
     WHERE set_id IN (${setIds.map(() => "?").join(",")})
     ORDER BY segment_number`,
    setIds
  );
  const segmentsBySetId = new Map<string, SetSegment[]>();
  for (const seg of allSegments) {
    const list = segmentsBySetId.get(seg.set_id) ?? [];
    list.push(seg);
    segmentsBySetId.set(seg.set_id, list);
  }

  // Check every work set reached >= 12 reps using the named accessor.
  for (const ws of workSets) {
    const segments = segmentsBySetId.get(ws.id) ?? [];
    const workingReps = getWorkingRepsForOverloadDecision(ws, segments);
    if (workingReps < 12) {
      return { shouldSuggest: false, nextExercise: { id: nextExercise.id, name: nextExercise.name }, isTerminal: false };
    }
  }

  // Check 4: user has NOT logged next exercise in last 30 days
  const nextLogged = await query<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM workout_sets ws
     JOIN workout_sessions s ON s.id = ws.session_id
     WHERE ws.exercise_id = ?
       AND s.completed_at >= ?`,
    [nextExercise.id, thirtyDaysAgo]
  );
  if ((nextLogged[0]?.count ?? 0) > 0) {
    return { shouldSuggest: false, nextExercise: { id: nextExercise.id, name: nextExercise.name }, isTerminal: false };
  }

  return { shouldSuggest: true, nextExercise: { id: nextExercise.id, name: nextExercise.name }, isTerminal: false };
}

// ── BLD-1028: Pinned per-exercise notes ───────────────────────────────────

/**
 * Saves a pinned note to the exercises table. Truncates at 500 chars on the
 * write path as a defensive guard against malformed imports.
 */
export async function updateExerciseNote(
  exerciseId: string,
  text: string,
): Promise<void> {
  const db = await getDrizzle();
  const clamped = text.substring(0, 500);
  await db.update(exercises)
    .set({ notes: clamped || null, notes_updated_at: clamped ? Date.now() : null })
    .where(eq(exercises.id, exerciseId));
}

/**
 * Marks the backfill suggestion as dismissed (sets notes_backfill_dismissed_at).
 * Called on both "Copy" and "Dismiss" taps so the prompt never re-shows.
 */
export async function dismissExerciseBackfill(exerciseId: string): Promise<void> {
  const db = await getDrizzle();
  await db.update(exercises)
    .set({ notes_backfill_dismissed_at: Date.now() })
    .where(eq(exercises.id, exerciseId));
}

export type BackfillCandidate = { text: string; date: number };

/**
 * Returns the most recent workout_sets.notes for the given exercise, if any,
 * suitable for the backfill prompt. Returns null when no candidate exists.
 */
export async function getExerciseBackfillCandidate(
  exerciseId: string,
): Promise<BackfillCandidate | null> {
  const rows = await query<{ notes: string; completed_at: number }>(
    `SELECT ws.notes, s.completed_at
     FROM workout_sets ws
     JOIN workout_sessions s ON s.id = ws.session_id
     WHERE ws.exercise_id = ?
       AND TRIM(COALESCE(ws.notes, '')) <> ''
       AND s.completed_at IS NOT NULL
     ORDER BY s.completed_at DESC
     LIMIT 1`,
    [exerciseId],
  );
  if (!rows[0]?.notes) return null;
  return { text: rows[0].notes, date: rows[0].completed_at };
}

/**
 * Returns { notes, notes_backfill_dismissed_at } for a batch of exercise IDs.
 */
export async function getExerciseNotesBatch(
  exerciseIds: string[],
): Promise<Record<string, { notes: string | null; dismissed: boolean }>> {
  if (exerciseIds.length === 0) return {};
  const rows = await query<{
    id: string;
    notes: string | null;
    notes_backfill_dismissed_at: number | null;
  }>(
    `SELECT id, notes, notes_backfill_dismissed_at
     FROM exercises
     WHERE id IN (${exerciseIds.map(() => "?").join(",")})`,
    exerciseIds,
  );
  const result: Record<string, { notes: string | null; dismissed: boolean }> = {};
  for (const r of rows) {
    result[r.id] = { notes: r.notes, dismissed: r.notes_backfill_dismissed_at != null };
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// BLD-2561: Preferred substitute — single "go-to" replacement per exercise
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the resolved preferred-substitute Exercise for the given source
 * exercise, or null when:
 *   - no preference is set (preferred_substitute_id IS NULL), or
 *   - the target exercise has been deleted (deleted_at IS NOT NULL), or
 *   - the target exercise no longer exists in the library.
 *
 * When a stale ID is detected (preference set but target missing/deleted),
 * the stale preference is eagerly cleared from the source exercise so the
 * chip stays hidden on subsequent renders.
 */
export async function getPreferredSubstitute(
  sourceExerciseId: string,
): Promise<Exercise | null> {
  const db = await getDrizzle();
  const source = await db.select()
    .from(exercises)
    .where(eq(exercises.id, sourceExerciseId))
    .get() as unknown as ExerciseRow | undefined;
  if (!source?.preferred_substitute_id) return null;

  const target = await db.select()
    .from(exercises)
    .where(eq(exercises.id, source.preferred_substitute_id))
    .get() as unknown as ExerciseRow | undefined;

  // Target missing or soft-deleted — clear the stale preference eagerly.
  if (!target || target.deleted_at != null) {
    await db.update(exercises)
      .set({ preferred_substitute_id: null, preferred_substitute_updated_at: null })
      .where(eq(exercises.id, sourceExerciseId));
    return null;
  }

  return mapRow(target);
}

/**
 * Persists a preferred-substitute choice on the source exercise.
 * Pass null as targetExerciseId to clear an existing preference.
 */
export async function setPreferredSubstitute(
  sourceExerciseId: string,
  targetExerciseId: string | null,
): Promise<void> {
  const db = await getDrizzle();
  await db.update(exercises)
    .set({
      preferred_substitute_id: targetExerciseId,
      preferred_substitute_updated_at: targetExerciseId != null ? Date.now() : null,
    })
    .where(eq(exercises.id, sourceExerciseId));
}

/**
 * Batch-fetch preferred_substitute_id for a list of source exercise IDs.
 * Returns a map of sourceId → targetId | null.
 * Used at session load time to populate ExerciseGroup.preferredSubstituteId.
 */
export async function getPreferredSubstitutesBatch(
  exerciseIds: string[],
): Promise<Record<string, string | null>> {
  if (exerciseIds.length === 0) return {};
  const rows = await query<{ id: string; preferred_substitute_id: string | null }>(
    `SELECT id, preferred_substitute_id
     FROM exercises
     WHERE id IN (${exerciseIds.map(() => "?").join(",")})`,
    exerciseIds,
  );
  const result: Record<string, string | null> = {};
  for (const r of rows) {
    result[r.id] = r.preferred_substitute_id ?? null;
  }
  return result;
}
