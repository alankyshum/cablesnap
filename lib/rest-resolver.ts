/**
 * History-based Smart Rest Timer — 5-tier resolver (BLD-1100).
 *
 * Priority order (first defined wins):
 *   1. user_override  — per-set override already in progress (external to this module)
 *   2. pinned         — exercises.user_rest_seconds set by user
 *   3. history        — median actual_rest over last 30 days (straight sets only)
 *   4. template       — template_exercises.rest_seconds for the active session
 *   5. default        — hard-coded 90 s
 *
 * All I/O is async (SQLite queries). Pure logic helpers are synchronous and
 * unit-testable in isolation.
 */

import * as Sentry from "@sentry/react-native";
import { getDatabase } from "./db/helpers";
import type { SetType } from "./types";

// ─── Public constants ─────────────────────────────────────────────────────────

export const WORK_ESTIMATE_SECONDS_PER_REP = 2;
export const HISTORY_MIN_SAMPLES = 4;
export const HISTORY_WINDOW_DAYS = 30;
export const HISTORY_FLOOR_SECONDS = 15;
export const HISTORY_CEILING_SECONDS = 600;
export const PIN_BOUNDS_SECONDS: readonly [number, number] = [15, 600];

// ─── Types ────────────────────────────────────────────────────────────────────

export type RestSource =
  | { kind: "user_override"; seconds: number }
  | { kind: "pinned"; seconds: number }
  | { kind: "history"; seconds: number; sampleCount: number; windowDays: 30 }
  | { kind: "template"; seconds: number }
  | { kind: "default"; seconds: 90 };

export type RestResolverBreadcrumbPayload = {
  source: RestSource["kind"];
  seconds: number;
  exerciseId: string;
  sampleCount?: number;
};

export type ResolveRestOptions = {
  /** When true, skips the history tier (linked/circuit groups). */
  linkScope?: boolean;
};

// ─── Error ───────────────────────────────────────────────────────────────────

export class RestBoundsError extends Error {
  constructor(seconds: number) {
    super(`user_rest_seconds ${seconds} is outside [${PIN_BOUNDS_SECONDS[0]}, ${PIN_BOUNDS_SECONDS[1]}]`);
    this.name = "RestBoundsError";
  }
}

// ─── Breadcrumb helper (AC12) ─────────────────────────────────────────────────

/**
 * Emit a Sentry breadcrumb for a resolver decision.
 *
 * Privacy contract: payload is UUID-only (exerciseId) plus numeric fields.
 * No exercise name, no user-entered content.
 * Category "rest-resolver" is separate from "session" (sessionBreadcrumb) by design.
 */
export function restResolverBreadcrumb(payload: RestResolverBreadcrumbPayload): void {
  try {
    Sentry.addBreadcrumb({
      category: "rest-resolver",
      level: "info",
      data: payload,
    });
  } catch {
    // Sentry not initialised — breadcrumbs are observability glue, never critical path.
  }
}

// ─── Core resolver ────────────────────────────────────────────────────────────

/**
 * Resolve the rest duration for a set completion.
 *
 * Returns the first defined tier in priority order.
 * `options.linkScope = true` skips the `history` tier (circuit/superset groups).
 */
export async function resolveRest(
  sessionId: string,
  exerciseId: string,
  setType: SetType,
  options?: ResolveRestOptions,
): Promise<RestSource> {
  const database = await getDatabase();

  // ── Tier 2: pinned ──────────────────────────────────────────────────────────
  const pinnedRow = await database.getFirstAsync<{ user_rest_seconds: number | null }>(
    "SELECT user_rest_seconds FROM exercises WHERE id = ?",
    [exerciseId],
  );
  if (pinnedRow?.user_rest_seconds != null) {
    const seconds = pinnedRow.user_rest_seconds;
    const source: RestSource = { kind: "pinned", seconds };
    restResolverBreadcrumb({ source: "pinned", seconds, exerciseId });
    return source;
  }

  // ── Tier 3: history (skipped for linkScope) ─────────────────────────────────
  if (!options?.linkScope) {
    const historyResult = await queryHistoryMedian(database, exerciseId, setType);
    if (historyResult != null) {
      const source: RestSource = {
        kind: "history",
        seconds: historyResult.median,
        sampleCount: historyResult.sampleCount,
        windowDays: 30,
      };
      restResolverBreadcrumb({
        source: "history",
        seconds: historyResult.median,
        exerciseId,
        sampleCount: historyResult.sampleCount,
      });
      return source;
    }
  }

  // ── Tier 4: template ────────────────────────────────────────────────────────
  const templateRow = await database.getFirstAsync<{ rest_seconds: number | null }>(
    `SELECT te.rest_seconds
       FROM workout_sessions ws
       LEFT JOIN template_exercises te
         ON te.template_id = ws.template_id
        AND te.exercise_id = ?
      WHERE ws.id = ?`,
    [exerciseId, sessionId],
  );
  if (templateRow?.rest_seconds != null) {
    const seconds = templateRow.rest_seconds;
    const source: RestSource = { kind: "template", seconds };
    restResolverBreadcrumb({ source: "template", seconds, exerciseId });
    return source;
  }

  // ── Tier 5: default ─────────────────────────────────────────────────────────
  const source: RestSource = { kind: "default", seconds: 90 };
  restResolverBreadcrumb({ source: "default", seconds: 90, exerciseId });
  return source;
}

// ─── History median query ────────────────────────────────────────────────────

type HistoryResult = { median: number; sampleCount: number };

async function queryHistoryMedian(
  database: import("expo-sqlite").SQLiteDatabase,
  exerciseId: string,
  setType: SetType,
): Promise<HistoryResult | null> {
  const windowStart = Math.floor(Date.now() / 1000) - HISTORY_WINDOW_DAYS * 86400;

  // Consecutive-pair CTE using LAG. Both prev and curr must have link_id IS NULL
  // (straight sets only) and completed_at in the window.
  // actual_rest = (completed_at_curr - work_estimate_curr) - completed_at_prev
  //   where work_estimate = COALESCE(duration_seconds, 2 * COALESCE(reps, 0))
  // Index used: idx_workout_sets_exercise_completed_at (EXPLAIN-asserted in AC8 bench).
  const rows = await database.getAllAsync<{ actual_rest: number }>(
    `WITH pairs AS (
       SELECT
         completed_at AS curr_at,
         LAG(completed_at) OVER w AS prev_at,
         COALESCE(duration_seconds, ${WORK_ESTIMATE_SECONDS_PER_REP} * COALESCE(reps, 0)) AS work_est,
         link_id AS curr_link_id,
         LAG(link_id) OVER w AS prev_link_id,
         set_type
       FROM workout_sets
       WHERE exercise_id = ?
         AND completed_at IS NOT NULL
         AND completed_at >= ?
       WINDOW w AS (ORDER BY completed_at ASC)
     )
     SELECT (curr_at - work_est - prev_at) AS actual_rest
     FROM pairs
     WHERE prev_at IS NOT NULL
       AND curr_link_id IS NULL
       AND prev_link_id IS NULL
       AND set_type = ?
       AND (curr_at - work_est - prev_at) >= ${HISTORY_FLOOR_SECONDS}
       AND (curr_at - work_est - prev_at) <= ${HISTORY_CEILING_SECONDS}`,
    [exerciseId, windowStart, setType],
  );

  if (rows.length < HISTORY_MIN_SAMPLES) return null;

  // Median via sort + midpoint index — SQLite has no PERCENTILE_CONT.
  const sorted = [...rows].sort((a, b) => a.actual_rest - b.actual_rest);
  const medianIdx = Math.floor((sorted.length - 1) / 2);
  const median = Math.round(sorted[medianIdx].actual_rest);

  return { median, sampleCount: sorted.length };
}

// ─── Mutation: setUserRestSeconds ────────────────────────────────────────────

/**
 * Persist a pinned per-exercise rest default.
 *
 * Pass `null` to unpin. Throws `RestBoundsError` if `seconds` is non-null
 * and outside [15, 600].
 */
export async function setUserRestSeconds(
  exerciseId: string,
  seconds: number | null,
): Promise<void> {
  if (seconds != null) {
    if (
      !Number.isFinite(seconds)
      || !Number.isInteger(seconds)
      || seconds < PIN_BOUNDS_SECONDS[0]
      || seconds > PIN_BOUNDS_SECONDS[1]
    ) {
      throw new RestBoundsError(seconds);
    }
  }
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE exercises SET user_rest_seconds = ? WHERE id = ?",
    [seconds ?? null, exerciseId],
  );
}
