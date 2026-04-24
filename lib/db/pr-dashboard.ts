/**
 * PR Dashboard data layer — read-only queries for the Personal Records Dashboard.
 *
 * Uses Drizzle ORM with sql tagged templates per project conventions.
 * All queries filter for completed sets in completed sessions, excluding warmup sets.
 *
 * A "PR" is defined at exercise+session granularity: one PR event per exercise per session
 * where the max weight (or max reps for bodyweight exercises) exceeds the prior historical best.
 *
 * Duration/isometric PRs are out of scope for V1.
 */

import { query } from "./helpers";
import { epley } from "../rm";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PRStats = {
  totalPRs: number;
  prsThisMonth: number;
};

export type RecentPR = {
  exercise_id: string;
  name: string;
  category: string;
  weight: number | null;
  reps: number | null;
  previous_best: number | null;
  date: number;
  is_weighted: boolean;
};

export type AllTimeBest = {
  exercise_id: string;
  name: string;
  category: string;
  max_weight: number | null;
  max_reps: number | null;
  best_set_weight: number | null;
  best_set_reps: number | null;
  est_1rm: number | null;
  session_count: number;
  is_weighted: boolean;
  // BLD-541: weighted-bodyweight modifier PR signals (only non-null on BW exercises
  // with at least one non-null modifier recorded).
  best_added_kg: number | null;
  best_assisted_kg: number | null;
};

/**
 * Weighted-bodyweight PR aggregate per exercise (BLD-541).
 * Single GROUP BY over workout_sets joined to exercises filtered to
 * equipment = 'bodyweight'. Matches the single-aggregate pattern of
 * `getAllTimeBests` — no N+1.
 */
export type WeightedBodyweightPR = {
  exercise_id: string;
  best_added_kg: number | null;   // max positive modifier (best = most added)
  best_assisted_kg: number | null; // max negative modifier (best = least negative, closest to 0)
};

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Count total lifetime PRs and PRs this month.
 * A weight PR = session where MAX(weight) for an exercise exceeds all prior sessions.
 * A rep PR = session where MAX(reps) for a bodyweight exercise exceeds all prior sessions.
 * Deduped to one PR per exercise per session.
 */
export async function getPRStats(): Promise<PRStats> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartMs = monthStart.getTime();

  // Weight PRs: sessions where an exercise's max weight exceeds all prior sessions' max
  const weightPRs = await query<{ total: number; this_month: number }>(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) as this_month
     FROM (
       SELECT ws.exercise_id, ws.session_id, wss.started_at as date,
              MAX(ws.weight) as session_max
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.completed = 1
         AND ws.weight IS NOT NULL AND ws.weight > 0
         AND ws.set_type != 'warmup'
         AND wss.completed_at IS NOT NULL
       GROUP BY ws.exercise_id, ws.session_id
       HAVING session_max > (
         SELECT COALESCE(MAX(ws2.weight), 0)
         FROM workout_sets ws2
         JOIN workout_sessions wss2 ON ws2.session_id = wss2.id
         WHERE ws2.exercise_id = ws.exercise_id
           AND ws2.session_id != ws.session_id
           AND ws2.completed = 1
           AND ws2.weight IS NOT NULL AND ws2.weight > 0
           AND ws2.set_type != 'warmup'
           AND wss2.completed_at IS NOT NULL
           AND wss2.started_at < wss.started_at
       )
     )`,
    [monthStartMs]
  );

  // Rep PRs for bodyweight exercises (weight IS NULL or 0)
  const repPRs = await query<{ total: number; this_month: number }>(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) as this_month
     FROM (
       SELECT ws.exercise_id, ws.session_id, wss.started_at as date,
              MAX(ws.reps) as session_max
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       LEFT JOIN exercises e ON ws.exercise_id = e.id
       WHERE ws.completed = 1
         AND ws.reps IS NOT NULL AND ws.reps > 0
         AND (ws.weight IS NULL OR ws.weight = 0)
         AND ws.set_type != 'warmup'
         AND wss.completed_at IS NOT NULL
       GROUP BY ws.exercise_id, ws.session_id
       HAVING session_max > (
         SELECT COALESCE(MAX(ws2.reps), 0)
         FROM workout_sets ws2
         JOIN workout_sessions wss2 ON ws2.session_id = wss2.id
         WHERE ws2.exercise_id = ws.exercise_id
           AND ws2.session_id != ws.session_id
           AND ws2.completed = 1
           AND ws2.reps IS NOT NULL AND ws2.reps > 0
           AND (ws2.weight IS NULL OR ws2.weight = 0)
           AND ws2.set_type != 'warmup'
           AND wss2.completed_at IS NOT NULL
           AND wss2.started_at < wss.started_at
       )
     )`,
    [monthStartMs]
  );

  const w = weightPRs[0] ?? { total: 0, this_month: 0 };
  const r = repPRs[0] ?? { total: 0, this_month: 0 };

  return {
    totalPRs: (w.total ?? 0) + (r.total ?? 0),
    prsThisMonth: (w.this_month ?? 0) + (r.this_month ?? 0),
  };
}

/**
 * Recent PRs with improvement delta.
 * Returns weight PRs and rep PRs (bodyweight) ordered by date descending.
 */
export async function getRecentPRsWithDelta(
  limit: number = 20
): Promise<RecentPR[]> {
  // Weight PRs
  const weightPRs = await query<{
    exercise_id: string;
    name: string;
    category: string;
    weight: number;
    previous_best: number;
    date: number;
  }>(
    `SELECT
       sub.exercise_id,
       COALESCE(e.name, 'Deleted Exercise') as name,
       COALESCE(e.category, 'Other') as category,
       sub.session_max as weight,
       sub.prev_max as previous_best,
       sub.date
     FROM (
       SELECT ws.exercise_id, ws.session_id, wss.started_at as date,
              MAX(ws.weight) as session_max,
              (SELECT COALESCE(MAX(ws2.weight), 0)
               FROM workout_sets ws2
               JOIN workout_sessions wss2 ON ws2.session_id = wss2.id
               WHERE ws2.exercise_id = ws.exercise_id
                 AND ws2.session_id != ws.session_id
                 AND ws2.completed = 1
                 AND ws2.weight IS NOT NULL AND ws2.weight > 0
                 AND ws2.set_type != 'warmup'
                 AND wss2.completed_at IS NOT NULL
                 AND wss2.started_at < wss.started_at
              ) as prev_max
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.completed = 1
         AND ws.weight IS NOT NULL AND ws.weight > 0
         AND ws.set_type != 'warmup'
         AND wss.completed_at IS NOT NULL
       GROUP BY ws.exercise_id, ws.session_id
       HAVING session_max > prev_max
     ) sub
     LEFT JOIN exercises e ON sub.exercise_id = e.id
     ORDER BY sub.date DESC
     LIMIT ?`,
    [limit]
  );

  // Rep PRs for bodyweight exercises
  const repPRs = await query<{
    exercise_id: string;
    name: string;
    category: string;
    reps: number;
    previous_best: number;
    date: number;
  }>(
    `SELECT
       sub.exercise_id,
       COALESCE(e.name, 'Deleted Exercise') as name,
       COALESCE(e.category, 'Other') as category,
       sub.session_max as reps,
       sub.prev_max as previous_best,
       sub.date
     FROM (
       SELECT ws.exercise_id, ws.session_id, wss.started_at as date,
              MAX(ws.reps) as session_max,
              (SELECT COALESCE(MAX(ws2.reps), 0)
               FROM workout_sets ws2
               JOIN workout_sessions wss2 ON ws2.session_id = wss2.id
               WHERE ws2.exercise_id = ws.exercise_id
                 AND ws2.session_id != ws.session_id
                 AND ws2.completed = 1
                 AND ws2.reps IS NOT NULL AND ws2.reps > 0
                 AND (ws2.weight IS NULL OR ws2.weight = 0)
                 AND ws2.set_type != 'warmup'
                 AND wss2.completed_at IS NOT NULL
                 AND wss2.started_at < wss.started_at
              ) as prev_max
       FROM workout_sets ws
       JOIN workout_sessions wss ON ws.session_id = wss.id
       WHERE ws.completed = 1
         AND ws.reps IS NOT NULL AND ws.reps > 0
         AND (ws.weight IS NULL OR ws.weight = 0)
         AND ws.set_type != 'warmup'
         AND wss.completed_at IS NOT NULL
       GROUP BY ws.exercise_id, ws.session_id
       HAVING session_max > prev_max
     ) sub
     LEFT JOIN exercises e ON sub.exercise_id = e.id
     ORDER BY sub.date DESC
     LIMIT ?`,
    [limit]
  );

  // Merge and sort by date descending
  const all: RecentPR[] = [
    ...weightPRs.map((p) => ({
      exercise_id: p.exercise_id,
      name: p.name,
      category: p.category,
      weight: p.weight,
      reps: null as number | null,
      previous_best: p.previous_best,
      date: p.date,
      is_weighted: true,
    })),
    ...repPRs.map((p) => ({
      exercise_id: p.exercise_id,
      name: p.name,
      category: p.category,
      weight: null as number | null,
      reps: p.reps,
      previous_best: p.previous_best,
      date: p.date,
      is_weighted: false,
    })),
  ];

  all.sort((a, b) => b.date - a.date);
  return all.slice(0, limit);
}

/**
 * All-time bests per exercise, grouped by category.
 * For weighted exercises: best weight and est 1RM from best single set.
 * For bodyweight exercises: best reps.
 */
/**
 * Weighted-bodyweight PR aggregate for all bodyweight exercises.
 *
 * Single aggregate query (per techlead MAJOR T-1 — no per-exercise loop, no N+1).
 * Mirrors the single-GROUP-BY pattern of `getAllTimeBests`.
 *
 * Classifier: canonical `exercises.equipment = 'bodyweight'` (not the legacy
 * history-derived `exercise-history.ts:150` heuristic — retired in a follow-up).
 *
 * Returns `best_added_kg` (MAX of positive modifiers) and `best_assisted_kg`
 * (MAX of negative modifiers — least negative wins, closest to 0 = best).
 */
export async function getWeightedBodyweightPRs(): Promise<WeightedBodyweightPR[]> {
  return await query<WeightedBodyweightPR>(
    `SELECT
       ws.exercise_id,
       MAX(CASE WHEN ws.bodyweight_modifier_kg > 0 THEN ws.bodyweight_modifier_kg END) AS best_added_kg,
       MAX(CASE WHEN ws.bodyweight_modifier_kg < 0 THEN ws.bodyweight_modifier_kg END) AS best_assisted_kg
     FROM workout_sets ws
     INNER JOIN exercises e ON ws.exercise_id = e.id
     INNER JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE e.equipment = 'bodyweight'
       AND ws.bodyweight_modifier_kg IS NOT NULL
       AND ws.completed = 1
       AND ws.set_type != 'warmup'
       AND wss.completed_at IS NOT NULL
     GROUP BY ws.exercise_id`
  );
}

export async function getAllTimeBests(): Promise<AllTimeBest[]> {
  // Weighted exercises: max weight, best e1RM set, session count
  const weighted = await query<{
    exercise_id: string;
    name: string;
    category: string;
    max_weight: number;
    best_set_weight: number;
    best_set_reps: number;
    session_count: number;
  }>(
    `SELECT
       ws.exercise_id,
       COALESCE(e.name, 'Deleted Exercise') as name,
       COALESCE(e.category, 'Other') as category,
       MAX(ws.weight) as max_weight,
       best.weight as best_set_weight,
       best.reps as best_set_reps,
       COUNT(DISTINCT ws.session_id) as session_count
     FROM workout_sets ws
     LEFT JOIN exercises e ON ws.exercise_id = e.id
     INNER JOIN workout_sessions wss ON ws.session_id = wss.id
     LEFT JOIN (
       SELECT exercise_id, weight, reps,
              ROW_NUMBER() OVER (
                PARTITION BY exercise_id
                ORDER BY (weight * (1.0 + COALESCE(reps, 1) / 30.0)) DESC
              ) as rn
       FROM workout_sets ws_inner
       INNER JOIN workout_sessions wss_inner ON ws_inner.session_id = wss_inner.id
       WHERE ws_inner.completed = 1
         AND ws_inner.weight IS NOT NULL AND ws_inner.weight > 0
         AND ws_inner.reps IS NOT NULL AND ws_inner.reps > 0
         AND ws_inner.set_type != 'warmup'
         AND wss_inner.completed_at IS NOT NULL
     ) best ON best.exercise_id = ws.exercise_id AND best.rn = 1
     WHERE ws.completed = 1
       AND ws.weight IS NOT NULL AND ws.weight > 0
       AND ws.set_type != 'warmup'
       AND wss.completed_at IS NOT NULL
     GROUP BY ws.exercise_id
     ORDER BY e.category ASC, e.name ASC`
  );

  // Bodyweight exercises: max reps, session count
  const bodyweight = await query<{
    exercise_id: string;
    name: string;
    category: string;
    max_reps: number;
    session_count: number;
  }>(
    `SELECT
       ws.exercise_id,
       COALESCE(e.name, 'Deleted Exercise') as name,
       COALESCE(e.category, 'Other') as category,
       MAX(ws.reps) as max_reps,
       COUNT(DISTINCT ws.session_id) as session_count
     FROM workout_sets ws
     LEFT JOIN exercises e ON ws.exercise_id = e.id
     INNER JOIN workout_sessions wss ON ws.session_id = wss.id
     WHERE ws.completed = 1
       AND ws.reps IS NOT NULL AND ws.reps > 0
       AND (ws.weight IS NULL OR ws.weight = 0)
       AND ws.set_type != 'warmup'
       AND wss.completed_at IS NOT NULL
     GROUP BY ws.exercise_id
     ORDER BY e.category ASC, e.name ASC`
  );

  // BLD-541: Weighted-BW modifier PRs — augments bodyweight rows.
  const weightedBwPRs = await getWeightedBodyweightPRs();
  const bwPRMap = new Map<string, WeightedBodyweightPR>();
  for (const p of weightedBwPRs) bwPRMap.set(p.exercise_id, p);

  const results: AllTimeBest[] = [];

  // Weighted results with e1RM computation
  for (const w of weighted) {
    // Skip if this exercise also appears as bodyweight-only (avoid duplicates)
    // In practice, an exercise with weight>0 sets is considered weighted
    const e1rm =
      w.best_set_weight > 0 && w.best_set_reps > 0
        ? Math.round(epley(w.best_set_weight, w.best_set_reps) * 10) / 10
        : null;

    results.push({
      exercise_id: w.exercise_id,
      name: w.name,
      category: w.category,
      max_weight: w.max_weight,
      max_reps: null,
      best_set_weight: w.best_set_weight,
      best_set_reps: w.best_set_reps,
      est_1rm: e1rm,
      session_count: w.session_count,
      is_weighted: true,
      best_added_kg: null,
      best_assisted_kg: null,
    });
  }

  // Bodyweight results (only those not already in weighted)
  const weightedIds = new Set(weighted.map((w) => w.exercise_id));
  for (const b of bodyweight) {
    if (weightedIds.has(b.exercise_id)) continue;
    const bwPr = bwPRMap.get(b.exercise_id);
    results.push({
      exercise_id: b.exercise_id,
      name: b.name,
      category: b.category,
      max_weight: null,
      max_reps: b.max_reps,
      best_set_weight: null,
      best_set_reps: null,
      est_1rm: null,
      session_count: b.session_count,
      is_weighted: false,
      best_added_kg: bwPr?.best_added_kg ?? null,
      best_assisted_kg: bwPr?.best_assisted_kg ?? null,
    });
  }

  // Sort by category then name
  results.sort((a, b) => {
    const catCmp = a.category.localeCompare(b.category);
    if (catCmp !== 0) return catCmp;
    return a.name.localeCompare(b.name);
  });

  return results;
}
