/**
 * Overreaching Detection Engine — pure functions for computing overreaching signals.
 * V1: 3 signals (e1RM trend, RPE trend, session ratings).
 * No side effects — all computation operates on pre-fetched data.
 */

// ---- Types ----

export type SignalId = "e1rm" | "rpe" | "rating";

export type OverreachingSignal = {
  id: SignalId;
  fired: boolean;
  weight: number;
  label: string;
  detail: string;
  accessibilityLabel: string;
};

export type OverreachingResult = {
  score: number;
  signals: OverreachingSignal[];
  shouldNudge: boolean;
};

export type DismissalState = {
  dismissedAt: number;
  scoreAtDismissal: number;
};

/** Weekly e1RM data for a single exercise. */
export type WeeklyE1RMRow = {
  exercise_id: string;
  name: string;
  week_start: number;
  max_e1rm: number;
};

/** Session RPE data. */
export type SessionRPERow = {
  session_id: string;
  started_at: number;
  avg_rpe: number;
};

/** Session rating data. */
export type SessionRatingRow = {
  session_id: string;
  started_at: number;
  rating: number;
};

// ---- Constants ----

const SIGNAL_WEIGHT_E1RM = 3;
const SIGNAL_WEIGHT_RPE = 3;
const SIGNAL_WEIGHT_RATING = 2;

const E1RM_DECLINE_THRESHOLD = 0.05; // 5% decline
const RPE_INCREASE_THRESHOLD = 0.5;
const MIN_E1RM_WEEKS = 3;
const MIN_RPE_SESSIONS = 3;
const MIN_RATING_SESSIONS = 4;
const NUDGE_SCORE_THRESHOLD = 3;
const DISMISSAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// ---- Dismissal Logic ----

export function isDismissed(state: DismissalState | null, now: number): boolean {
  if (!state) return false;
  return now - state.dismissedAt < DISMISSAL_DURATION_MS;
}

export function parseDismissalState(raw: string | null): DismissalState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.dismissedAt === "number" &&
      typeof parsed.scoreAtDismissal === "number"
    ) {
      return parsed as DismissalState;
    }
    return null;
  } catch {
    return null;
  }
}

export function serializeDismissalState(state: DismissalState): string {
  return JSON.stringify(state);
}

// ---- Signal Computations ----

/** Partition e1RM rows into per-exercise averages for two time windows. */
function partitionE1RMWindows(
  rows: WeeklyE1RMRow[],
  recentStart: number,
  priorStart: number,
  priorEnd: number,
): { declining: { name: string; pctDrop: number }[] } {
  const exerciseRecent = new Map<string, { sum: number; count: number; name: string }>();
  const exercisePrior = new Map<string, { sum: number; count: number; name: string }>();

  for (const row of rows) {
    if (row.week_start >= recentStart) {
      const cur = exerciseRecent.get(row.exercise_id) ?? { sum: 0, count: 0, name: row.name };
      cur.sum += row.max_e1rm;
      cur.count += 1;
      exerciseRecent.set(row.exercise_id, cur);
    } else if (row.week_start >= priorStart && row.week_start < priorEnd) {
      const cur = exercisePrior.get(row.exercise_id) ?? { sum: 0, count: 0, name: row.name };
      cur.sum += row.max_e1rm;
      cur.count += 1;
      exercisePrior.set(row.exercise_id, cur);
    }
  }

  const declining: { name: string; pctDrop: number }[] = [];
  for (const [exId, recent] of exerciseRecent) {
    const prior = exercisePrior.get(exId);
    if (!prior) continue;
    const recentAvg = recent.sum / recent.count;
    const priorAvg = prior.sum / prior.count;
    if (priorAvg <= 0) continue;
    const change = (recentAvg - priorAvg) / priorAvg;
    if (change <= -E1RM_DECLINE_THRESHOLD) {
      declining.push({ name: recent.name, pctDrop: Math.round(Math.abs(change) * 100) });
    }
  }

  declining.sort((a, b) => b.pctDrop - a.pctDrop);
  return { declining };
}

/**
 * Compute e1RM signal: compare recent 2 weeks avg e1RM vs prior 2 weeks.
 * Requires ≥3 weeks of data with at least 1 exercise tracked across both windows.
 */
export function computeE1RMSignal(
  rows: WeeklyE1RMRow[],
  now: number,
): OverreachingSignal {
  const base: OverreachingSignal = {
    id: "e1rm",
    fired: false,
    weight: SIGNAL_WEIGHT_E1RM,
    label: "Strength declining",
    detail: "",
    accessibilityLabel: "",
  };

  if (rows.length === 0) return base;

  const uniqueWeeks = new Set(rows.map((r) => r.week_start));
  if (uniqueWeeks.size < MIN_E1RM_WEEKS) return base;

  const twoWeeksAgo = now - 2 * WEEK_MS;
  const fourWeeksAgo = now - 4 * WEEK_MS;
  const { declining } = partitionE1RMWindows(rows, twoWeeksAgo, fourWeeksAgo, twoWeeksAgo);

  if (declining.length === 0) return base;

  const top = declining[0];
  const detail =
    declining.length === 1
      ? `${top.name} estimated 1RM down ${top.pctDrop}% over 2 weeks`
      : `${top.name} down ${top.pctDrop}% and ${declining.length - 1} more exercise${declining.length > 2 ? "s" : ""} declining`;

  return {
    ...base,
    fired: true,
    detail,
    accessibilityLabel: `Strength signal: ${detail}`,
  };
}

/**
 * Compute RPE signal: avg RPE increasing ≥0.5 over 2 weeks while e1RM not improving.
 * Only fires if e1RM signal also fired (weights flat/declining).
 */
export function computeRPESignal(
  rpeRows: SessionRPERow[],
  e1rmFired: boolean,
  now: number,
): OverreachingSignal {
  const base: OverreachingSignal = {
    id: "rpe",
    fired: false,
    weight: SIGNAL_WEIGHT_RPE,
    label: "Effort increasing",
    detail: "",
    accessibilityLabel: "",
  };

  if (!e1rmFired) return base;

  const withRPE = rpeRows.filter((r) => r.avg_rpe > 0);
  if (withRPE.length < MIN_RPE_SESSIONS) return base;

  const twoWeeksAgo = now - 2 * WEEK_MS;
  const fourWeeksAgo = now - 4 * WEEK_MS;

  const recent = withRPE.filter((r) => r.started_at >= twoWeeksAgo);
  const prior = withRPE.filter((r) => r.started_at >= fourWeeksAgo && r.started_at < twoWeeksAgo);

  if (recent.length === 0 || prior.length === 0) return base;

  const recentAvg = recent.reduce((s, r) => s + r.avg_rpe, 0) / recent.length;
  const priorAvg = prior.reduce((s, r) => s + r.avg_rpe, 0) / prior.length;
  const increase = recentAvg - priorAvg;

  if (increase < RPE_INCREASE_THRESHOLD) return base;

  const detail = `Average RPE up ${increase.toFixed(1)} (${priorAvg.toFixed(1)} → ${recentAvg.toFixed(1)}) over 2 weeks`;

  return {
    ...base,
    fired: true,
    detail,
    accessibilityLabel: `Effort signal: ${detail}`,
  };
}

/**
 * Compute session ratings signal: trending down over 4+ sessions within 6 weeks.
 */
export function computeRatingSignal(
  ratingRows: SessionRatingRow[],
  now: number,
): OverreachingSignal {
  const base: OverreachingSignal = {
    id: "rating",
    fired: false,
    weight: SIGNAL_WEIGHT_RATING,
    label: "Session satisfaction declining",
    detail: "",
    accessibilityLabel: "",
  };

  const sixWeeksAgo = now - 6 * WEEK_MS;
  const inWindow = ratingRows.filter((r) => r.started_at >= sixWeeksAgo && r.rating > 0);

  if (inWindow.length < MIN_RATING_SESSIONS) return base;

  const sorted = [...inWindow].sort((a, b) => a.started_at - b.started_at);

  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);

  if (firstHalf.length === 0 || secondHalf.length === 0) return base;

  const firstAvg = firstHalf.reduce((s, r) => s + r.rating, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((s, r) => s + r.rating, 0) / secondHalf.length;

  if (firstAvg - secondAvg < 0.5) return base;

  const detail = `Session ratings dropped from ${firstAvg.toFixed(1)} to ${secondAvg.toFixed(1)} avg`;

  return {
    ...base,
    fired: true,
    detail,
    accessibilityLabel: `Rating signal: ${detail}`,
  };
}

// ---- Main Computation ----

/**
 * Compute overreaching score from pre-fetched data.
 * Returns signals, total score, and whether to show nudge.
 */
export function computeOverreachingScore(
  e1rmRows: WeeklyE1RMRow[],
  rpeRows: SessionRPERow[],
  ratingRows: SessionRatingRow[],
  now: number = Date.now(),
): OverreachingResult {
  const e1rmSignal = computeE1RMSignal(e1rmRows, now);
  const rpeSignal = computeRPESignal(rpeRows, e1rmSignal.fired, now);
  const ratingSignal = computeRatingSignal(ratingRows, now);

  const signals = [e1rmSignal, rpeSignal, ratingSignal];
  const score = signals.reduce((s, sig) => s + (sig.fired ? sig.weight : 0), 0);

  return {
    score,
    signals,
    shouldNudge: score >= NUDGE_SCORE_THRESHOLD,
  };
}
