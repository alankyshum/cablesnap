/**
 * BLD-1086 Phase 0a: Variant scope helpers extracted from exercise-history.ts.
 *
 * `VariantScope` now includes all five variant-key dimensions used by the
 * global PR Dashboard aggregation:
 *   (exercise_id, attachment, mount_position, grip_type, stack_unit_at_log)
 *
 * Existing call-sites pass `gripType: undefined, stackUnitAtLog: undefined`
 * (or nothing) so behavior is unchanged. New call-sites opt in by supplying values.
 *
 * NULL semantics per dimension:
 *   - `field === undefined` → no constraint (wildcard)
 *   - `field === null`      → match rows WHERE field IS NULL
 *   - `field === <value>`   → match rows WHERE field = <value>
 */

import { eq, isNull } from "drizzle-orm";
import { workoutSets } from "./schema";
import type { Attachment, MountPosition, GripType } from "../types";

export type VariantScope = {
  attachment?: Attachment | null;
  mount_position?: MountPosition | null;
  gripType?: GripType | null;
  stackUnitAtLog?: string | null;
};

/**
 * Build raw SQL fragment for variant filtering (for use in raw `query()` calls).
 *
 * Returns `{ sql: " AND ws.attachment = ? …", params: [...] }`.
 * Returns `{ sql: "", params: [] }` when scope is undefined or fully unconstrained.
 *
 * The caller is responsible for placing the fragment in a context where `ws`
 * is bound to `workout_sets`.
 */
export function buildVariantSql(scope?: VariantScope): { sql: string; params: (string | null)[] } {
  if (!scope) return { sql: "", params: [] };
  const parts: string[] = [];
  const params: (string | null)[] = [];

  if (scope.attachment !== undefined) {
    if (scope.attachment === null) {
      parts.push("ws.attachment IS NULL");
    } else {
      parts.push("ws.attachment = ?");
      params.push(scope.attachment);
    }
  }
  if (scope.mount_position !== undefined) {
    if (scope.mount_position === null) {
      parts.push("ws.mount_position IS NULL");
    } else {
      parts.push("ws.mount_position = ?");
      params.push(scope.mount_position);
    }
  }
  if (scope.gripType !== undefined) {
    if (scope.gripType === null) {
      parts.push("ws.grip_type IS NULL");
    } else {
      parts.push("ws.grip_type = ?");
      params.push(scope.gripType);
    }
  }
  if (scope.stackUnitAtLog !== undefined) {
    if (scope.stackUnitAtLog === null) {
      parts.push("ws.stack_unit_at_log IS NULL");
    } else {
      parts.push("ws.stack_unit_at_log = ?");
      params.push(scope.stackUnitAtLog);
    }
  }

  if (parts.length === 0) return { sql: "", params: [] };
  return { sql: " AND " + parts.join(" AND "), params };
}

/**
 * Drizzle-flavored variant predicate. Returns SQL fragments to AND into a
 * Drizzle `where()` chain. Returns `[]` when scope is empty.
 */
export function variantDrizzleConditions(scope?: VariantScope) {
  const conds: ReturnType<typeof eq | typeof isNull>[] = [];
  if (!scope) return conds;

  if (scope.attachment !== undefined) {
    conds.push(scope.attachment === null
      ? isNull(workoutSets.attachment)
      : eq(workoutSets.attachment, scope.attachment));
  }
  if (scope.mount_position !== undefined) {
    conds.push(scope.mount_position === null
      ? isNull(workoutSets.mount_position)
      : eq(workoutSets.mount_position, scope.mount_position));
  }
  if (scope.gripType !== undefined) {
    conds.push(scope.gripType === null
      ? isNull(workoutSets.grip_type)
      : eq(workoutSets.grip_type, scope.gripType));
  }
  if (scope.stackUnitAtLog !== undefined) {
    conds.push(scope.stackUnitAtLog === null
      ? isNull(workoutSets.stack_unit_at_log)
      : eq(workoutSets.stack_unit_at_log, scope.stackUnitAtLog));
  }

  return conds;
}
