/**
 * BLD-768 / BLD-822: Per-set bodyweight grip variant logging — pure helper module.
 *
 * Sibling of `lib/cable-variant.ts` (BLD-771). Same shape, same contracts,
 * different vocabulary. **Intentionally NOT a parameterization** of the cable
 * module — see PLAN-BLD-768.md "Sibling vs Parameterize" decision: BLD-771
 * was just merged in PR #426 and generalizing it now risks regressing the
 * production cable-variant flow for asymmetric benefit.
 *
 * Source-of-truth vocabulary lives in `lib/types.ts`:
 *   - `GripType` (4 values) and `GRIP_TYPE_LABELS`
 *   - `GripWidth` (3 values) and `GRIP_WIDTH_LABELS`
 *
 * Hard exclusions (Behavior-Design Classification: NO):
 *   - no streaks, badges, celebrations, gamification on grip logging
 *   - no notifications, no auto-rotation suggestions
 *   - per-set grip is *pure data tracking*; if any of the above is added,
 *     flip Classification to YES and require fresh psychologist review.
 */

import {
  GRIP_TYPE_LABELS,
  GRIP_WIDTH_LABELS,
  type GripType,
  type GripWidth,
} from "./types";

/**
 * Canonical ordering for the bottom-sheet picker. Mirrors the `GripType`
 * union order in `lib/types.ts` for cross-file consistency.
 */
export const GRIP_TYPE_VALUES: readonly GripType[] = [
  "overhand",
  "underhand",
  "neutral",
  "mixed",
] as const;

/**
 * Canonical ordering for the bottom-sheet picker. Mirrors the `GripWidth`
 * union order in `lib/types.ts`.
 */
export const GRIP_WIDTH_VALUES: readonly GripWidth[] = [
  "narrow",
  "shoulder",
  "wide",
] as const;

// ─── Compile-time exhaustiveness guards ────────────────────────────────────
// If a new value is added to `GripType` or `GripWidth` in `lib/types.ts`
// without being added to the `*_VALUES` arrays above, these type-level
// assertions force a TypeScript compile error.

type _GripTypeExhaustive = Exclude<GripType, (typeof GRIP_TYPE_VALUES)[number]> extends never
  ? true
  : "GRIP_TYPE_VALUES is missing entries — sync with `lib/types.ts:GripType`";
type _GripWidthExhaustive = Exclude<GripWidth, (typeof GRIP_WIDTH_VALUES)[number]> extends never
  ? true
  : "GRIP_WIDTH_VALUES is missing entries — sync with `lib/types.ts:GripWidth`";
const _gripTypeExhaustive: _GripTypeExhaustive = true;
const _gripWidthExhaustive: _GripWidthExhaustive = true;
void _gripTypeExhaustive;
void _gripWidthExhaustive;

/**
 * Sole gate for whether the bodyweight grip chips render on a set row.
 *
 * Match strategy: BOTH `equipment === "bodyweight"` AND case-insensitive name
 * regex. Equipment alone is too broad (push-ups, dips, planks all share
 * `bodyweight` but have no grip variants in scope for BLD-822). Name alone
 * is too loose (a hypothetical custom `{equipment:"cable", name:"Pull-Up"}`
 * is a cable lat-pulldown variant tracked by BLD-771's gate, not this one).
 *
 * **Asymmetry vs `isCableExercise`** (`lib/cable-variant.ts`): cable gates on
 * `equipment.includes("cable")` only because cable equipment has a 1:1
 * relationship with the cable variant family. Bodyweight equipment is a
 * many-family bucket; we narrow with a name regex. Documented intentionally
 * — do NOT "simplify" by dropping either half.
 *
 * Patterns (Phase 1 scope per PLAN-BLD-768.md):
 *   - /pull-?ups?/i        → "Pull-up", "Pullups", "Pull-Ups"
 *   - /chin-?ups?/i        → "Chin-up", "Chinups"
 *   - /inverted\s+row/i    → "Inverted Row"
 *   - /trx\s+row/i         → "TRX Row"
 *   - /australian\s+pull/i → "Australian Pull-up" (alternate term)
 *
 * **Documented limitation:** `"Pull Up"` (with a space, no hyphen) is REJECTED
 * because the regex requires the optional hyphen-or-concatenation form.
 * CableSnap's seed names use hyphens (`"Pull-Up"`, `"Chin-Up"` at
 * `seed-community.ts:413,422`). Custom user exercises named `"Pull Up"` won't
 * match — acceptable v1 trade-off; user can rename. Phase 2 (BLD-818) adds
 * a structural `movement_pattern` column on `exercises` that fixes this
 * properly.
 *
 * **Phase 2 expansion** (BLD-818): dips will gate via name regex too — DO
 * NOT widen this function; add a separate `isDipExercise()` gate so each
 * exercise family stays independently auditable.
 *
 * Exclusions:
 *   - push-ups (already 6 separate seed exercises by grip — no per-set gate needed)
 *   - rope climbs, muscle-ups (Phase 3+, out of scope)
 *
 * @example
 *   isBodyweightGripExercise({ equipment:"bodyweight", name:"Pull-Up" })  // true
 *   isBodyweightGripExercise({ equipment:"bodyweight", name:"pullup" })   // true
 *   isBodyweightGripExercise({ equipment:"bodyweight", name:"Chin-Up" })  // true
 *   isBodyweightGripExercise({ equipment:"bodyweight", name:"Inverted Row" }) // true
 *   isBodyweightGripExercise({ equipment:"bodyweight", name:"Push-Up" })  // false
 *   isBodyweightGripExercise({ equipment:"bodyweight", name:"Pulldown" }) // false
 *   isBodyweightGripExercise({ equipment:"cable", name:"Pull-Up" })       // false (equipment fails)
 *   isBodyweightGripExercise({ equipment:"bodyweight", name:"Pull Up" })  // false (space — documented limitation)
 *   isBodyweightGripExercise({ name:"Pull-up" })                          // false (no equipment)
 *   isBodyweightGripExercise(null)                                        // false
 */
const BODYWEIGHT_GRIP_PATTERNS: readonly RegExp[] = [
  /pull-?ups?/i,
  /chin-?ups?/i,
  /inverted\s+row/i,
  /trx\s+row/i,
  /australian\s+pull/i,
];

export function isBodyweightGripExercise(
  exercise: { equipment?: string | null; name?: string | null } | null | undefined
): boolean {
  if (!exercise) return false;
  if (exercise.equipment !== "bodyweight") return false;
  const name = exercise.name;
  if (typeof name !== "string" || name.length === 0) return false;
  return BODYWEIGHT_GRIP_PATTERNS.some((re) => re.test(name));
}

/**
 * Pretty-print a grip-type value for accessibility labels.
 * Returns `"None"` for null/undefined to keep VoiceOver utterances natural.
 */
export function formatGripTypeLabel(value: GripType | null | undefined): string {
  if (!value) return "None";
  return GRIP_TYPE_LABELS[value];
}

/**
 * Pretty-print a grip-width value for accessibility labels.
 */
export function formatGripWidthLabel(value: GripWidth | null | undefined): string {
  if (!value) return "None";
  return GRIP_WIDTH_LABELS[value];
}

/**
 * Variant tuple resolved per-attribute. NULL on either field means "no prior
 * history for this exercise" — the chip surfaces a "Tap to set grip"
 * affordance and saves NULL until the user picks one.
 */
export type BodyweightGripVariant = {
  grip_type: GripType | null;
  grip_width: GripWidth | null;
};

/**
 * Resolve autofill values for a new set. Each attribute is independent —
 * `grip_type` and `grip_width` may resolve from different prior sets.
 *
 * Source order (UUIDv4-safe):
 *   ORDER BY completed_at DESC NULLS LAST, set_number DESC
 *
 * @param history - completed prior sets for the same exercise (any session),
 *                  newest first per the order above. Caller provides the
 *                  ordered window; this helper is pure.
 * @returns `{ grip_type, grip_width }` — both NULL if no prior set carried
 *          that attribute. **NEVER** falls back to any exercise-level
 *          default (silent-default trap, QD-B2 in BLD-771 review carried
 *          forward).
 */
export function getLastBodyweightGripVariant(
  history: ReadonlyArray<Pick<BodyweightGripVariant, "grip_type" | "grip_width">>
): BodyweightGripVariant {
  let grip_type: GripType | null = null;
  let grip_width: GripWidth | null = null;
  for (const row of history) {
    if (grip_type === null && row.grip_type != null) {
      grip_type = row.grip_type;
    }
    if (grip_width === null && row.grip_width != null) {
      grip_width = row.grip_width;
    }
    if (grip_type !== null && grip_width !== null) break;
  }
  return { grip_type, grip_width };
}

/**
 * Type guard: is the given string a valid `GripType`? Used at deserialization
 * boundaries (CSV import, JSON import, URL params) to coerce unknown input.
 */
export function isGripType(value: unknown): value is GripType {
  return typeof value === "string" && (GRIP_TYPE_VALUES as readonly string[]).includes(value);
}

/**
 * Type guard: is the given string a valid `GripWidth`? Symmetric with
 * `isGripType`.
 */
export function isGripWidth(value: unknown): value is GripWidth {
  return typeof value === "string" && (GRIP_WIDTH_VALUES as readonly string[]).includes(value);
}
