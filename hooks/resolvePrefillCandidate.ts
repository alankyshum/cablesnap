/**
 * BLD-682 — Auto-prefill a new set's weight + reps (or duration) from
 * either the most recent in-session working set (BLD-655 path) or, if
 * none exists, the matching set from the previous workout.
 *
 * Pure helper. No DB access, no React state. The caller is responsible
 * for fetching `previousSetForSlot` (e.g. via `getPreviousSetsBatch`)
 * AND for wrapping the resulting write in a single `updateSet` call —
 * single-write-path / write-on-intent.
 *
 * Match rule: warmup sets are NEVER a valid prefill source. A row whose
 * weight, reps, AND duration_seconds are all null returns null.
 */

export type PrefillCandidate = {
  weight: number | null;
  reps: number | null;
  duration_seconds: number | null;
};

type SetLike = {
  weight: number | null;
  reps: number | null;
  duration_seconds: number | null;
  set_type: string | null;
};

type GroupLike = {
  trackingMode: "reps" | "duration";
  sets: SetLike[];
};

function shapeCandidate(
  source: SetLike,
  trackingMode: "reps" | "duration",
): PrefillCandidate | null {
  const weight = source.weight ?? null;
  const reps = trackingMode === "duration" ? null : (source.reps ?? null);
  const duration_seconds =
    trackingMode === "duration" ? (source.duration_seconds ?? null) : null;
  if (weight == null && reps == null && duration_seconds == null) return null;
  return { weight, reps, duration_seconds };
}

/**
 * Resolve a prefill candidate for a newly added set.
 *
 * Priority:
 *   1. Most recent in-session working set in `group.sets` (BLD-655).
 *   2. Otherwise, the supplied `previousSetForSlot` from the previous workout
 *      (BLD-682 fallback). Caller-supplied; pass `null` to skip.
 *
 * Warmup sources are filtered out at every stage. Returns null when no
 * usable source exists (silent no-op contract — AC3).
 */
export function resolvePrefillCandidate(
  group: GroupLike,
  previousSetForSlot: SetLike | null,
): PrefillCandidate | null {
  // 1. In-session lookup — last non-warmup set in the group.
  const lastWorking = [...group.sets]
    .filter((s) => s.set_type !== "warmup")
    .slice(-1)[0];
  if (lastWorking) return shapeCandidate(lastWorking, group.trackingMode);

  // 2. Previous-workout fallback.
  if (previousSetForSlot && previousSetForSlot.set_type !== "warmup") {
    return shapeCandidate(previousSetForSlot, group.trackingMode);
  }
  return null;
}

/**
 * BLD-682 — Display-only prefillCandidate derivation for `useSessionData`.
 *
 * Pristine guard MUST match AC17 exactly:
 *   weight==null && reps==null && duration_seconds==null
 *   && completed===false && (notes==null || notes==="")
 *   && bodyweight_modifier_kg==null
 *
 * If pristine, look up the previous-workout row by `set_number`, reject
 * warmup, shape per `trackingMode`. Pure / referentially-stable for
 * AC17's idempotence guarantee — same input → same output object shape.
 *
 * Returns null when the row is non-pristine OR no usable prev row exists.
 */
export type PristineRow = {
  weight: number | null;
  reps: number | null;
  duration_seconds: number | null;
  completed: boolean;
  notes: string | null;
  bodyweight_modifier_kg: number | null | undefined;
  set_number: number;
};

export function derivePristinePrefillCandidate(
  row: PristineRow,
  prevSets: Array<SetLike & { set_number: number; completed: boolean }> | undefined | null,
  trackingMode: "reps" | "duration",
): PrefillCandidate | null {
  const isPristine =
    row.weight == null &&
    row.reps == null &&
    row.duration_seconds == null &&
    !row.completed &&
    (row.notes == null || row.notes === "") &&
    (row.bodyweight_modifier_kg == null);
  if (!isPristine) return null;
  if (!prevSets || prevSets.length === 0) return null;
  // AC13 + reviewer/techlead/QD BLOCKER (2026-04-27 16:03Z): match by
  // set_number AND require completed=true. lib/db/session-sets.ts:469
  // intentionally returns ALL prior-session rows (progression detection
  // needs them); every prefill consumer filters `&& p.completed` to
  // avoid flashing/persisting an un-confirmed value. Warmup filter at
  // helper layer (not SQL).
  const candidate = prevSets.find((p) => p.set_number === row.set_number && p.completed);
  if (!candidate) return null;
  if (candidate.set_type === "warmup") return null;
  return shapeCandidate(candidate, trackingMode);
}
