/**
 * BLD-1168: Single write-path for workout_sets mutations.
 *
 * ARCHITECTURE INVARIANT: Only this file may UPDATE workout_sets or issue
 * INSERT/UPDATE/DELETE on workout_set_segments. All callers must route through
 * the functions here so that recomputeSetCaches() is guaranteed to run after
 * every mutation and the cached_volume_kg / cached_e1rm_kg columns remain in sync.
 *
 * The architecture grep-test (__tests__/architecture-set-write-path.test.ts)
 * enforcing this invariant is added in Slice 2 (BLD-1170). It will fail CI
 * if any file outside this module contains:
 *   - UPDATE workout_sets / db.update(workoutSets)
 *   - INSERT INTO workout_set_segments / UPDATE workout_set_segments / DELETE FROM workout_set_segments
 *   - weight * reps  (raw ad-hoc volume computation)
 *   - weight * (1 + reps / 30)  (raw ad-hoc e1RM computation)
 */
import { eq, and } from "drizzle-orm";
import { getDrizzle } from "./helpers";
import { workoutSets, workoutSetSegments } from "./schema";
import { uuid } from "../uuid";
import type { SetSegment, SetType } from "../types";

export type { SetSegment };

/** Set types that support mini-set segments. When all segments are deleted, these sets
 *  must store reps=0 / cached_volume_kg=0 / cached_e1rm_kg=0 (not legacy parent fallback). */
export const ADVANCED_SET_TYPES: ReadonlySet<SetType> = new Set(["rest_pause", "cluster", "myo_reps"]);

const VALID_SET_TYPES: ReadonlySet<string> = new Set([
  "normal", "warmup", "dropset", "failure", "rest_pause", "cluster", "myo_reps",
]);

/** Tracks whether we've already warned about a given unknown value this process lifetime. */
const _warnedSetTypes = new Set<unknown>();

/**
 * Normalises an untrusted `set_type` value (from DB row, CSV, backup, share-link payload)
 * to a valid `SetType`.
 *
 * - Returns `raw` unchanged if it is one of the seven valid set-type strings.
 * - Coerces any other value (unknown string, null, undefined, "") to "normal".
 * - Emits a single `console.warn` per unknown value (dev-mode only) on first coercion.
 *
 * **Call this at every read boundary** — DB hydration, CSV import, backup restore,
 * share-payload deserialiser, and UI label lookup — so that unknown values from older
 * app versions or external sources never reach typed code as an invalid string.
 */
export function normalizeSetType(raw: unknown): SetType {
  if (typeof raw === "string" && VALID_SET_TYPES.has(raw)) {
    return raw as SetType;
  }
  if (__DEV__ && !_warnedSetTypes.has(raw)) {
    _warnedSetTypes.add(raw);
    console.warn(`[normalizeSetType] Unknown set_type "${String(raw)}" coerced to "normal"`);
  }
  return "normal";
}

// ─── Pure computation (exported for tests) ─────────────────────────────────

export type SegmentInput = { reps: number; weight: number | null };
export type ParentInput = {
  weight: number | null;
  reps: number | null;
  /** When true and segments is empty, returns zeros instead of legacy parent fallback. */
  isAdvancedSet?: boolean;
};

/**
 * Pure function: computes cached_volume_kg, cached_e1rm_kg, and total_reps
 * from a parent set and its segments. No DB access.
 *
 * For advanced set types (rest_pause, cluster, myo_reps) with zero segments,
 * returns zeros — the parent row reflects "0 reps, tap to add mini-set".
 *
 * For legacy set types with zero segments, falls back to parent.weight × parent.reps
 * (backwards-compatible with pre-BLD-1168 rows that have no segments).
 */
export function computeSetCacheValues(
  parent: ParentInput,
  segments: SegmentInput[],
): { cachedVolumeKg: number; cachedE1rmKg: number; totalReps: number } {
  if (segments.length === 0) {
    if (parent.isAdvancedSet) {
      // Advanced set with no mini-sets: parent is effectively "0 reps"
      return { cachedVolumeKg: 0, cachedE1rmKg: 0, totalReps: 0 };
    }
    const w = parent.weight ?? 0;
    const r = parent.reps ?? 0;
    return {
      cachedVolumeKg: w * r,
      cachedE1rmKg: r > 0 ? w * (1 + r / 30) : 0,
      totalReps: r,
    };
  }

  let cachedVolumeKg = 0;
  let cachedE1rmKg = 0;
  let totalReps = 0;

  for (const seg of segments) {
    const segWeight = seg.weight ?? parent.weight ?? 0;
    cachedVolumeKg += segWeight * seg.reps;
    totalReps += seg.reps;
    const e1rm = seg.reps > 0 ? segWeight * (1 + seg.reps / 30) : 0;
    if (e1rm > cachedE1rmKg) cachedE1rmKg = e1rm;
  }

  return { cachedVolumeKg, cachedE1rmKg, totalReps };
}

// ─── Cache recomputation ────────────────────────────────────────────────────

/**
 * Recomputes cached_volume_kg and cached_e1rm_kg for a parent workout_sets row
 * and updates the parent's reps to Σ segments.reps (for advanced set types).
 *
 * Formula:
 *   cached_volume_kg = Σ (seg.reps × (seg.weight ?? parent.weight))
 *   cached_e1rm_kg   = MAX over segments of (seg_weight × (1 + seg_reps / 30))
 *                      where seg_weight = seg.weight ?? parent.weight
 *
 * For rows with no segments (normal/warmup/dropset/failure), falls back to
 * parent.weight × parent.reps (same as legacy formula).
 *
 * This function is the ONLY path that writes cached_volume_kg and cached_e1rm_kg.
 * It must be called after every INSERT/UPDATE/DELETE on workout_set_segments,
 * and after any change to workout_sets.weight or workout_sets.reps.
 */
export async function recomputeSetCaches(setId: string): Promise<void> {
  const db = await getDrizzle();

  // Load parent set (including set_type to distinguish advanced vs legacy)
  const parent = await db
    .select({
      id: workoutSets.id,
      weight: workoutSets.weight,
      reps: workoutSets.reps,
      set_type: workoutSets.set_type,
    })
    .from(workoutSets)
    .where(eq(workoutSets.id, setId))
    .get();

  if (!parent) return; // set was deleted; nothing to recompute

  const isAdvancedSet = ADVANCED_SET_TYPES.has((parent.set_type ?? "normal") as SetType);

  // Load all segments ordered by segment_number
  const segments = await db
    .select({
      reps: workoutSetSegments.reps,
      weight: workoutSetSegments.weight,
    })
    .from(workoutSetSegments)
    .where(eq(workoutSetSegments.set_id, setId))
    .all();

  if (segments.length === 0 && !isAdvancedSet) {
    // Legacy/non-segmented set — caches stay as backfilled, reps untouched.
    return;
  }

  const { cachedVolumeKg, cachedE1rmKg, totalReps } = computeSetCacheValues(
    { weight: parent.weight ?? null, reps: parent.reps ?? null, isAdvancedSet },
    segments.map((s) => ({ reps: s.reps, weight: s.weight ?? null })),
  );

  // Write back — update both cached columns and parent.reps (for advanced types with segments).
  // For non-advanced sets parent.reps is unchanged (totalReps === parent.reps ?? 0).
  await db
    .update(workoutSets)
    .set({
      cached_volume_kg: cachedVolumeKg,
      cached_e1rm_kg: cachedE1rmKg,
      reps: totalReps,
    })
    .where(eq(workoutSets.id, setId));
}

// ─── Segment mutations ───────────────────────────────────────────────────────

export type InsertSegmentParams = {
  setId: string;
  segmentNumber: number;
  reps: number;
  weight?: number | null;
  restAfterSeconds?: number | null;
  completedAt?: number | null;
};

/** Insert a new mini-set segment and recompute parent caches. */
export async function insertSegment(params: InsertSegmentParams): Promise<SetSegment> {
  const db = await getDrizzle();
  const now = Date.now();
  const id = uuid();

  await db.insert(workoutSetSegments).values({
    id,
    set_id: params.setId,
    segment_number: params.segmentNumber,
    reps: params.reps,
    weight: params.weight ?? null,
    rest_after_seconds: params.restAfterSeconds ?? null,
    completed_at: params.completedAt ?? null,
    created_at: now,
  });

  await recomputeSetCaches(params.setId);

  return {
    id,
    set_id: params.setId,
    segment_number: params.segmentNumber,
    reps: params.reps,
    weight: params.weight ?? null,
    rest_after_seconds: params.restAfterSeconds ?? null,
    completed_at: params.completedAt ?? null,
    created_at: now,
  };
}

export type UpdateSegmentParams = {
  segmentId: string;
  setId: string;
  reps?: number;
  weight?: number | null;
  restAfterSeconds?: number | null;
  completedAt?: number | null;
};

/** Update an existing mini-set segment and recompute parent caches. */
export async function updateSegment(params: UpdateSegmentParams): Promise<void> {
  const db = await getDrizzle();

  const updates: Partial<{
    reps: number;
    weight: number | null;
    rest_after_seconds: number | null;
    completed_at: number | null;
  }> = {};

  if (params.reps !== undefined) updates.reps = params.reps;
  if ("weight" in params) updates.weight = params.weight ?? null;
  if ("restAfterSeconds" in params) updates.rest_after_seconds = params.restAfterSeconds ?? null;
  if ("completedAt" in params) updates.completed_at = params.completedAt ?? null;

  if (Object.keys(updates).length > 0) {
    await db
      .update(workoutSetSegments)
      .set(updates)
      .where(and(eq(workoutSetSegments.id, params.segmentId), eq(workoutSetSegments.set_id, params.setId)));
  }

  await recomputeSetCaches(params.setId);
}

/** Delete a mini-set segment and recompute parent caches. */
export async function deleteSegment(segmentId: string, setId: string): Promise<void> {
  const db = await getDrizzle();

  await db
    .delete(workoutSetSegments)
    .where(and(eq(workoutSetSegments.id, segmentId), eq(workoutSetSegments.set_id, setId)));

  await recomputeSetCaches(setId);
}

/** Delete all segments for a set (e.g., when changing set_type back to normal). */
export async function deleteAllSegmentsForSet(setId: string): Promise<void> {
  const db = await getDrizzle();
  await db.delete(workoutSetSegments).where(eq(workoutSetSegments.set_id, setId));
  await recomputeSetCaches(setId);
}

/** Load all segments for a set ordered by segment_number. */
export async function getSegmentsForSet(setId: string): Promise<SetSegment[]> {
  const db = await getDrizzle();
  const rows = await db
    .select()
    .from(workoutSetSegments)
    .where(eq(workoutSetSegments.set_id, setId))
    .orderBy(workoutSetSegments.segment_number)
    .all();

  return rows.map((r) => ({
    id: r.id,
    set_id: r.set_id,
    segment_number: r.segment_number,
    reps: r.reps,
    weight: r.weight ?? null,
    rest_after_seconds: r.rest_after_seconds ?? null,
    completed_at: r.completed_at ?? null,
    created_at: r.created_at,
  }));
}
