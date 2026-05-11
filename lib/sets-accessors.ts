/**
 * BLD-1172: Named reps accessors for WorkoutSet rows.
 *
 * ARCHITECTURE INVARIANT: All callers that need a "reps" value from a
 * WorkoutSet must use one of the four functions below instead of reading
 * `set.reps` directly. For advanced set types (rest_pause, cluster, myo_reps)
 * `set.reps` is the SUM of all mini-set reps — using it directly inflates
 * overload decisions and plateau detection.
 *
 * The architecture grep-test (__tests__/architecture-set-write-path.test.ts)
 * enforces this invariant and will fail CI if any file outside
 * lib/db/sets.ts / lib/sets-accessors.ts reads `.reps` on a WorkoutSet.
 */
import type { WorkoutSet, SetSegment } from "./types";
import { ADVANCED_SET_TYPES } from "./db/sets";

/**
 * Returns the reps count to use when deciding whether to increase load
 * (overload decision). For advanced set types this is the heaviest
 * single-segment reps (first segment, which holds the highest rep count for
 * rest-pause/cluster; activation segment for myo-reps). For legacy types it
 * returns `set.reps`.
 *
 * Use when asking "did the user achieve the target reps to progress weight?".
 */
export function getWorkingRepsForOverloadDecision(
  set: WorkoutSet,
  segments: SetSegment[],
): number {
  if (!ADVANCED_SET_TYPES.has(set.set_type) || segments.length === 0) {
    return set.reps ?? 0;
  }
  // First segment (lowest segment_number) holds the working rep count.
  const sorted = [...segments].sort((a, b) => a.segment_number - b.segment_number);
  return sorted[0].reps;
}

/**
 * Returns the reps count to use for plateau / PR detection.
 *
 * - myo_reps: returns activation segment reps (first segment), NOT the total.
 *   The activation set quality determines effort; the mini-clusters are
 *   fatigue-extension work.
 * - cluster / rest_pause: returns the heaviest single-segment reps (first
 *   segment).
 * - normal / warmup / dropset / failure: returns `set.reps`.
 */
export function getEffortRepsForPlateau(
  set: WorkoutSet,
  segments: SetSegment[],
): number {
  if (!ADVANCED_SET_TYPES.has(set.set_type) || segments.length === 0) {
    return set.reps ?? 0;
  }
  // First segment = activation set (myo_reps) or heaviest cluster (rest_pause/cluster).
  const sorted = [...segments].sort((a, b) => a.segment_number - b.segment_number);
  return sorted[0].reps;
}

/**
 * Returns the reps of the segment with the most reps (the "heaviest" segment
 * in terms of rep count). For legacy set types returns `set.reps`.
 *
 * Useful for display and for 1RM estimation using the segment with the highest
 * load × reps product (combined with segment weight).
 */
export function getHeaviestSegmentReps(
  set: WorkoutSet,
  segments: SetSegment[],
): number {
  if (!ADVANCED_SET_TYPES.has(set.set_type) || segments.length === 0) {
    return set.reps ?? 0;
  }
  return Math.max(...segments.map((s) => s.reps));
}

/**
 * Returns the total reps across all segments (Σ segments.reps). For legacy
 * set types returns `set.reps` (which equals the total anyway for non-advanced
 * rows, since there are no segments).
 *
 * Use when computing training volume (total reps × load).
 */
export function getTotalRepsForVolume(
  set: WorkoutSet,
  segments: SetSegment[],
): number {
  if (!ADVANCED_SET_TYPES.has(set.set_type) || segments.length === 0) {
    return set.reps ?? 0;
  }
  return segments.reduce((sum, s) => sum + s.reps, 0);
}
