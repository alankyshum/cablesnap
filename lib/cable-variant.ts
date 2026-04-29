/**
 * BLD-771: Per-set cable variant logging — pure helper module.
 *
 * Source-of-truth vocabulary lives in `lib/types.ts`:
 *   - `Attachment` (7 values) and `ATTACHMENT_LABELS`
 *   - `MountPosition` (4 values) and `MOUNT_POSITION_LABELS`
 *
 * This module re-exports value arrays derived from those unions so every call
 * site (picker, autofill, analytics filter) imports vocab from a single place.
 * **No hardcoded string literals at any call site** — this is enforced by the
 * UX-audit step (`scripts/audit-vocab.sh`).
 *
 * Vocabulary expansion rule: extending `Attachment` or `MountPosition` happens
 * in `lib/types.ts`; this module's `*_VALUES` arrays auto-track via the
 * exhaustiveness assertion at the bottom of this file. Any drift surfaces as a
 * compile-time error, not a runtime bug.
 *
 * Hard exclusions (Behavior-Design Classification: NO):
 *   - no streaks, badges, celebrations, gamification on variant logging
 *   - no notifications, no auto-rotation suggestions
 *   - per-set variant is *pure data tracking*; if any of the above is added,
 *     flip Classification to YES and require fresh psychologist review.
 */

import {
  ATTACHMENT_LABELS,
  MOUNT_POSITION_LABELS,
  type Attachment,
  type MountPosition,
} from "./types";

/**
 * Canonical ordering for the bottom-sheet picker. Mirrors the order of the
 * `Attachment` union in `lib/types.ts:31` for cross-file consistency.
 */
export const ATTACHMENT_VALUES: readonly Attachment[] = [
  "handle",
  "ring_handle",
  "ankle_strap",
  "rope",
  "bar",
  "squat_harness",
  "carabiner",
] as const;

/**
 * Canonical ordering for the bottom-sheet picker. Mirrors the order of the
 * `MountPosition` union in `lib/types.ts:29`.
 */
export const MOUNT_POSITION_VALUES: readonly MountPosition[] = [
  "high",
  "mid",
  "low",
  "floor",
] as const;

// ─── Compile-time exhaustiveness guards ────────────────────────────────────
// If a new value is added to the `Attachment` or `MountPosition` union in
// `lib/types.ts` without being added to the `*_VALUES` arrays above, these
// type-level assertions force a TypeScript compile error.

type _AttachmentExhaustive = Exclude<Attachment, (typeof ATTACHMENT_VALUES)[number]> extends never
  ? true
  : "ATTACHMENT_VALUES is missing entries — sync with `lib/types.ts:Attachment`";
type _MountExhaustive = Exclude<MountPosition, (typeof MOUNT_POSITION_VALUES)[number]> extends never
  ? true
  : "MOUNT_POSITION_VALUES is missing entries — sync with `lib/types.ts:MountPosition`";
const _attachmentExhaustive: _AttachmentExhaustive = true;
const _mountExhaustive: _MountExhaustive = true;
void _attachmentExhaustive;
void _mountExhaustive;

/**
 * Sole gate for whether the variant chips render on a set row. Substring,
 * case-insensitive, NULL/empty-safe. Multi-equipment exercises like
 * `"Cable, Dumbbell"` count as cable.
 *
 * **Never** widen this to also accept `mount_position != null` as a fallback
 * gate — that would let stale variant data on a re-equipment'd exercise silently
 * gate UI for the new equipment (QD-A1).
 *
 * @example
 *   isCableExercise({ equipment: "Cable" })            // true
 *   isCableExercise({ equipment: "cable_machine" })    // true
 *   isCableExercise({ equipment: "Cable, Dumbbell" })  // true
 *   isCableExercise({ equipment: "dumbbell" })         // false
 *   isCableExercise({ equipment: "" })                 // false
 *   isCableExercise({ equipment: null })               // false
 *   isCableExercise(null)                              // false
 *   isCableExercise(undefined)                         // false
 */
export function isCableExercise(
  exercise: { equipment?: string | null } | null | undefined
): boolean {
  if (!exercise) return false;
  const eq = exercise.equipment;
  if (typeof eq !== "string" || eq.length === 0) return false;
  return eq.toLowerCase().includes("cable");
}

/**
 * Pretty-print an attachment value for accessibility labels.
 * Returns `"None"` for null/undefined to keep VoiceOver utterances natural.
 */
export function formatAttachmentLabel(value: Attachment | null | undefined): string {
  if (!value) return "None";
  return ATTACHMENT_LABELS[value];
}

/**
 * Pretty-print a mount-position value for accessibility labels.
 */
export function formatMountPositionLabel(value: MountPosition | null | undefined): string {
  if (!value) return "None";
  return MOUNT_POSITION_LABELS[value];
}

/**
 * Variant tuple resolved per-attribute. NULL on either field means
 * "no prior history for this exercise" — the chip surfaces a "Tap to set
 * variant" affordance and saves NULL until the user picks one.
 */
export type CableVariant = {
  attachment: Attachment | null;
  mount_position: MountPosition | null;
};

/**
 * Resolve autofill values for a new set. Each attribute is independent —
 * `attachment` and `mount_position` may resolve from different prior sets.
 *
 * Source order (UUIDv4-safe — see `lib/uuid.ts`):
 *   ORDER BY completed_at DESC NULLS LAST, set_number DESC
 *
 * @param history - completed prior sets for the same exercise (any session),
 *                  newest first per the order above. The caller is responsible
 *                  for providing the ordered window; this helper is pure.
 * @returns `{ attachment, mount_position }` — both NULL if no prior set
 *          carried that attribute. NEVER falls back to
 *          `exercises.attachment`/`exercises.mount_position` defaults
 *          (silent-default trap, QD-B2).
 */
export function getLastVariant(
  history: ReadonlyArray<Pick<CableVariant, "attachment" | "mount_position">>
): CableVariant {
  let attachment: Attachment | null = null;
  let mount_position: MountPosition | null = null;
  for (const row of history) {
    if (attachment === null && row.attachment != null) {
      attachment = row.attachment;
    }
    if (mount_position === null && row.mount_position != null) {
      mount_position = row.mount_position;
    }
    if (attachment !== null && mount_position !== null) break;
  }
  return { attachment, mount_position };
}

/**
 * Type guard: is the given string a valid `Attachment`? Used at deserialization
 * boundaries (CSV import, JSON import, URL params) to coerce unknown input.
 */
export function isAttachment(value: unknown): value is Attachment {
  return typeof value === "string" && (ATTACHMENT_VALUES as readonly string[]).includes(value);
}

/**
 * Type guard: is the given string a valid `MountPosition`? Symmetric with
 * `isAttachment`.
 */
export function isMountPosition(value: unknown): value is MountPosition {
  return typeof value === "string" && (MOUNT_POSITION_VALUES as readonly string[]).includes(value);
}
