/**
 * Session Pacing Insights — pure computation (BLD-1144).
 *
 * computePacing(sets, session) → PacingBreakdown
 *
 * Working-time estimator is the same COALESCE heuristic used by lib/rest-resolver.ts.
 * We import WORK_ESTIMATE_SECONDS_PER_REP from there — single source of truth.
 * If that constant changes, pacing changes consistently.
 * See lib/rest-resolver.ts:21 for the canonical definition.
 *
 * Rest cap: REST_CAP_SECONDS = 600 (10 min) — prevents a phone-locked gap from
 * dominating the chart. Fixed cap accepted as v1 trade-off (no per-set DB lookup).
 */

import { WORK_ESTIMATE_SECONDS_PER_REP } from "./rest-resolver";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum rest credited per consecutive same-exercise set pair (10 minutes). */
export const REST_CAP_SECONDS = 600;

// ─── Types ────────────────────────────────────────────────────────────────────

export type PacingSet = {
  exercise_id: string;
  completed_at: number | null; // Unix ms
  duration_seconds: number | null;
  reps: number | null;
};

export type PacingSession = {
  started_at: number | null; // Unix ms
  completed_at: number | null; // Unix ms
  edited_at?: number | null; // Unix ms — used by cache key, not computation
};

export type ExercisePacing = {
  exercise_id: string;
  working: number; // seconds
  rest: number; // seconds
  other: number; // seconds (proportional share of session Other)
};

export type PacingBreakdown = {
  working: number; // seconds
  rest: number; // seconds
  other: number; // seconds
  gross: number; // session.completed_at − session.started_at (seconds)
  perExercise: ExercisePacing[];
  isEmpty: boolean; // true when 0 completed sets
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function workingEstimate(set: PacingSet): number {
  if (set.duration_seconds != null) return set.duration_seconds;
  if (set.reps != null) return WORK_ESTIMATE_SECONDS_PER_REP * set.reps;
  return 0;
}

/**
 * Group completed sets by exercise_id and sort within each group by completed_at.
 */
function groupByExercise(sets: PacingSet[]): Map<string, PacingSet[]> {
  const byExercise = new Map<string, PacingSet[]>();
  for (const s of sets) {
    const list = byExercise.get(s.exercise_id) ?? [];
    list.push(s);
    byExercise.set(s.exercise_id, list);
  }
  for (const group of byExercise.values()) {
    group.sort((a, b) => (a.completed_at ?? 0) - (b.completed_at ?? 0));
  }
  return byExercise;
}

/**
 * Compute working and rest totals for a single exercise's set group.
 */
function computeExercisePacing(
  group: PacingSet[]
): { working: number; rest: number } {
  let exWorking = 0;
  let exRest = 0;
  for (let i = 0; i < group.length; i++) {
    const setWorking = workingEstimate(group[i]);
    exWorking += setWorking;
    if (i > 0) {
      const prevAt = group[i - 1].completed_at ?? 0;
      const currAt = group[i].completed_at ?? 0;
      const gapSeconds = Math.round((currAt - prevAt) / 1000);
      const rawRest = gapSeconds - setWorking;
      exRest += Math.min(Math.max(rawRest, 0), REST_CAP_SECONDS);
    }
  }
  return { working: exWorking, rest: exRest };
}

/**
 * Distribute Other time proportionally across exercises by their working fraction.
 */
function distributeOther(perExercise: ExercisePacing[], totalWorking: number, totalOther: number): void {
  if (totalWorking === 0 || totalOther === 0) return;
  let distributed = 0;
  for (let i = 0; i < perExercise.length; i++) {
    if (i === perExercise.length - 1) {
      perExercise[i].other = totalOther - distributed;
    } else {
      const exOther = Math.round((perExercise[i].working / totalWorking) * totalOther);
      perExercise[i].other = exOther;
      distributed += exOther;
    }
  }
}

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Compute pacing breakdown from raw set and session rows.
 * Pure function — no DB access, no React, fully testable.
 */
export function computePacing(
  sets: PacingSet[],
  session: PacingSession
): PacingBreakdown {
  const completedSets = sets.filter((s) => s.completed_at != null);

  const gross =
    session.started_at != null && session.completed_at != null
      ? Math.round((session.completed_at - session.started_at) / 1000)
      : 0;

  if (
    completedSets.length === 0 ||
    session.started_at == null ||
    session.completed_at == null
  ) {
    return { working: 0, rest: 0, other: 0, gross, perExercise: [], isEmpty: true };
  }

  // Warn once per session for sets missing both estimators
  const missingCount = completedSets.filter(
    (s) => s.duration_seconds == null && s.reps == null
  ).length;
  if (missingCount > 0) {
    console.warn(
      `[session-pacing] ${missingCount} set(s) missing both duration_seconds and reps — contributing 0 working time`
    );
  }

  const byExercise = groupByExercise(completedSets);

  let totalWorking = 0;
  let totalRest = 0;
  const perExercise: ExercisePacing[] = [];

  for (const [exerciseId, group] of byExercise) {
    const { working: exWorking, rest: exRest } = computeExercisePacing(group);
    totalWorking += exWorking;
    totalRest += exRest;
    perExercise.push({ exercise_id: exerciseId, working: exWorking, rest: exRest, other: 0 });
  }

  const rawOther = gross - totalWorking - totalRest;
  const totalOther = Math.max(rawOther, 0);

  if (rawOther < 0) {
    console.warn(
      `[session-pacing] Other clamped to 0 (clock-skew or rounding); gross=${gross}s working=${totalWorking}s rest=${totalRest}s`
    );
  }

  distributeOther(perExercise, totalWorking, totalOther);

  return { working: totalWorking, rest: totalRest, other: totalOther, gross, perExercise, isEmpty: false };
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/** Format seconds as mm:ss (< 1 h) or h:mm:ss (≥ 1 h). */
export function formatPacingTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Spoken form for accessibility: "18 minutes 42 seconds". */
export function formatPacingTimeSpoken(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h !== 1 ? "s" : ""}`);
  if (m > 0) parts.push(`${m} minute${m !== 1 ? "s" : ""}`);
  if (s > 0 || parts.length === 0) parts.push(`${s} second${s !== 1 ? "s" : ""}`);
  return parts.join(" ");
}
