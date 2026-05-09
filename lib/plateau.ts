/**
 * Per-exercise plateau detection engine — pure functions (no DB, no React,
 * no app_settings writes). Mirrors the style of lib/overreaching.ts.
 *
 * BLD-1122 / PLAN-BLD-1121 (rev 4 APPROVED).
 *
 * Internal classification token `regressing` MUST NEVER appear in
 * user-visible strings (psych binding change #1). The source-contract test
 * in __tests__/source-contracts-batch.test.ts enforces this for all files
 * under components/, app/, and hooks/.
 */

import { epley } from "./rm";

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Internal token — never render in UI.
 * Source-contract test prevents the string "regressing" from appearing in
 * components/, app/, hooks/.
 */
export type PlateauClassification = "progressing" | "maintaining" | "stalled" | "regressing";

export type BreakThroughSuggestion =
  | { kind: "deload"; weight: number; reps: number; reason: string }
  | { kind: "rep_target"; weight: number; reps: number; reason: string }
  | { kind: "rep_plus_one"; weight: number | null; reps: number; reason: string }
  | { kind: "form_check"; reason: string };

export type PlateauResult = {
  classification: PlateauClassification;
  sessionsObserved: number;
  topSetWeight: number | null;
  topSetReps: number | null;
  avgRPE: number | null;
  primarySuggestion: BreakThroughSuggestion | null;
  secondarySuggestion: BreakThroughSuggestion | null;
};

/** One row per completed session, aggregated from working sets. */
export type PlateauSessionRow = {
  session_id: string;
  started_at: number;
  /** Highest weight × reps from set_type='normal' sets */
  top_set_weight: number | null;
  top_set_reps: number | null;
  top_set_rpe: number | null;
  avg_rpe: number | null;
  all_completed: boolean;
  set_count: number;
  bodyweight_modifier_kg: number | null;
};

// ── Constants ─────────────────────────────────────────────────────────────

const STALL_WINDOW = 3; // consecutive identical sessions to classify as stalled
const REGRESSION_WINDOW = 3; // sessions for e1RM regression check (same value as STALL_WINDOW)
const REGRESSION_THRESHOLD = 0.05; // 5% e1RM drop
const DISMISSAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/** Number of extra reps added for a rep_target break-through suggestion. */
export const REP_TARGET_DELTA = 2;

export { DISMISSAL_DURATION_MS };

// Unit conversion constants (local to keep plateau.ts pure/no-import)
const KG_TO_LB = 2.20462;
const LB_TO_KG = 0.453592;

// ── plateau_state storage type ────────────────────────────────────────────

export type PlateauDismissal = { dismissed_at: string };
export type PlateauPending = {
  weight: number | null;
  reps: number;
  kind: string;
  queued_at: string;
};

export type PlateauState = {
  dismissals: Record<string, PlateauDismissal>;
  pending: Record<string, PlateauPending>;
};

export function parsePlateauState(raw: string | null): PlateauState {
  if (!raw) return { dismissals: {}, pending: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<PlateauState>;
    return {
      dismissals:
        parsed.dismissals && typeof parsed.dismissals === "object"
          ? (parsed.dismissals as PlateauState["dismissals"])
          : {},
      pending:
        parsed.pending && typeof parsed.pending === "object"
          ? (parsed.pending as PlateauState["pending"])
          : {},
    };
  } catch {
    return { dismissals: {}, pending: {} };
  }
}

export function serializePlateauState(state: PlateauState): string {
  return JSON.stringify(state);
}

/** Drop dismissals older than 14 days. Returns a new state object. */
export function gcPlateauState(state: PlateauState, now: number = Date.now()): PlateauState {
  const dismissals: PlateauState["dismissals"] = {};
  for (const [exId, d] of Object.entries(state.dismissals)) {
    const ts = new Date(d.dismissed_at).getTime();
    if (!isNaN(ts) && now - ts < DISMISSAL_DURATION_MS) {
      dismissals[exId] = d;
    }
  }
  return { dismissals, pending: state.pending };
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Round weight down to the nearest step (e.g. step=2.5 → 52.5 for 54). */
export function roundDownToStep(weight: number, step: number): number {
  if (step <= 0) return weight;
  return Math.floor(weight / step) * step;
}

function avgRPEFromSessions(sessions: PlateauSessionRow[]): number | null {
  const withRPE = sessions.filter((s) => s.avg_rpe != null && s.avg_rpe > 0);
  if (withRPE.length === 0) return null;
  return withRPE.reduce((acc, s) => acc + s.avg_rpe!, 0) / withRPE.length;
}

/** Returns true when the most recent session improved vs the prior session. */
function checkProgressing(sessions: PlateauSessionRow[]): boolean {
  if (sessions.length < 2) return false;
  const latest = sessions[0];
  const prior = sessions[1];
  const weightImproved =
    latest.top_set_weight != null &&
    prior.top_set_weight != null &&
    latest.top_set_weight > prior.top_set_weight;
  const repsImproved =
    latest.top_set_reps != null &&
    prior.top_set_reps != null &&
    latest.top_set_reps > prior.top_set_reps;
  return weightImproved || repsImproved;
}

/**
 * Returns a form_check suggestion if e1RM drops ≥5% over REGRESSION_WINDOW
 * sessions (loaded only). Returns null otherwise.
 */
function checkRegression(
  window: PlateauSessionRow[],
  isBodyweight: boolean,
): BreakThroughSuggestion | null {
  if (isBodyweight || window.length < REGRESSION_WINDOW) return null;
  const hasWeights = window
    .slice(0, REGRESSION_WINDOW)
    .every(
      (s) => s.top_set_weight != null && s.top_set_weight > 0 && s.top_set_reps != null,
    );
  if (!hasWeights) return null;
  const e1rms = window
    .slice(0, REGRESSION_WINDOW)
    .map((s) => epley(s.top_set_weight!, s.top_set_reps!));
  const oldest = e1rms[REGRESSION_WINDOW - 1];
  const newest = e1rms[0];
  if (oldest > 0 && (oldest - newest) / oldest >= REGRESSION_THRESHOLD) {
    return { kind: "form_check", reason: "e1RM trending down ≥5% over 3 sessions" };
  }
  return null;
}

/** Returns true if the last STALL_WINDOW sessions show no top-set improvement. */
function checkStalled(window: PlateauSessionRow[], isBodyweight: boolean): boolean {
  const stallWindow = window.slice(0, STALL_WINDOW);
  const latest = stallWindow[0];
  if (isBodyweight) {
    if (latest.top_set_reps == null) return false;
    return stallWindow.every((s) => s.top_set_reps === latest.top_set_reps);
  }
  if (latest.top_set_weight == null || latest.top_set_reps == null) return false;
  return stallWindow.every(
    (s) =>
      s.top_set_weight === latest.top_set_weight &&
      s.top_set_reps === latest.top_set_reps,
  );
}

// ── Main classifier ────────────────────────────────────────────────────────

/**
 * Classify plateau state for a single exercise over a window of sessions.
 *
 * @param sessions   Pre-fetched, sorted DESC by started_at (newest first).
 *                   Each row contains the top working set metrics per session.
 * @param isBodyweight  Whether this exercise is bodyweight (unit: reps, not weight).
 * @param unitStep   Smallest weight increment (e.g. 2.5 kg or 5 lb).
 */
export function classifyPlateau(
  sessions: PlateauSessionRow[],
  isBodyweight: boolean,
  unitStep: number,
  unit: "kg" | "lb" = "kg",
): PlateauResult {
  const nullResult: PlateauResult = {
    classification: "progressing",
    sessionsObserved: sessions.length,
    topSetWeight: null,
    topSetReps: null,
    avgRPE: null,
    primarySuggestion: null,
    secondarySuggestion: null,
  };

  if (sessions.length < STALL_WINDOW) return nullResult;

  // Use only the most recent window for stall/regression (both windows are STALL_WINDOW)
  const window = sessions.slice(0, STALL_WINDOW);
  const latest = window[0];
  const lastWeight = latest.top_set_weight;
  const lastReps = latest.top_set_reps;

  // ── Progressing check ────────────────────────────────────────────────────
  if (checkProgressing(sessions)) {
    return {
      classification: "progressing",
      sessionsObserved: sessions.length,
      topSetWeight: lastWeight,
      topSetReps: lastReps,
      avgRPE: avgRPEFromSessions(window),
      primarySuggestion: null,
      secondarySuggestion: null,
    };
  }

  // ── Regression check (loaded only) ───────────────────────────────────────
  const regressionSuggestion = checkRegression(window, isBodyweight);
  if (regressionSuggestion) {
    return {
      classification: "regressing",
      sessionsObserved: sessions.length,
      topSetWeight: lastWeight,
      topSetReps: lastReps,
      avgRPE: avgRPEFromSessions(window),
      primarySuggestion: regressionSuggestion,
      secondarySuggestion: null,
    };
  }

  // ── Stall check ──────────────────────────────────────────────────────────
  if (!checkStalled(window, isBodyweight)) {
    return {
      classification: "maintaining",
      sessionsObserved: sessions.length,
      topSetWeight: lastWeight,
      topSetReps: lastReps,
      avgRPE: avgRPEFromSessions(window),
      primarySuggestion: null,
      secondarySuggestion: null,
    };
  }

  const stallWindow = window.slice(0, STALL_WINDOW);
  const avgRPE = avgRPEFromSessions(stallWindow);

  // ── Bodyweight stall → rep_plus_one (no secondary) ───────────────────────
  if (isBodyweight) {
    const reps = lastReps ?? 0;
    return {
      classification: "stalled",
      sessionsObserved: sessions.length,
      topSetWeight: null,
      topSetReps: reps,
      avgRPE,
      primarySuggestion: {
        kind: "rep_plus_one",
        weight: null,
        reps: reps + 1,
        reason: `${STALL_WINDOW} sessions at ${reps} reps — bodyweight tiny-habit +1 rep`,
      },
      secondarySuggestion: null,
    };
  }

  // ── Loaded stall → deload primary (RPE ≥ 8) or rep_target primary ────────
  const weight = lastWeight!;
  const reps = lastReps!;
  // Round deload weight in display units so lb users get clean 5 lb steps (AC1/AC10)
  const deloadWeight = unit === "lb"
    ? roundDownToStep(weight * KG_TO_LB * 0.9, unitStep) * LB_TO_KG
    : roundDownToStep(weight * 0.9, unitStep);
  const repTargetReps = reps + REP_TARGET_DELTA;

  const deloadSuggestion: BreakThroughSuggestion = {
    kind: "deload",
    weight: deloadWeight,
    reps,
    reason: `${STALL_WINDOW}+ sessions at ${weight} × ${reps}, avg RPE ≥ 8 — deload to ${deloadWeight}`,
  };
  const repTargetSuggestion: BreakThroughSuggestion = {
    kind: "rep_target",
    weight,
    reps: repTargetReps,
    reason: `${STALL_WINDOW}+ sessions at ${weight} × ${reps}, avg RPE < 8 — push for ${repTargetReps} reps`,
  };

  // If no RPE data, fall back to deload primary (AC edge case: zero RPE across window)
  const rpeHigh = avgRPE == null || avgRPE >= 8;

  return {
    classification: "stalled",
    sessionsObserved: sessions.length,
    topSetWeight: weight,
    topSetReps: reps,
    avgRPE,
    primarySuggestion: rpeHigh ? deloadSuggestion : repTargetSuggestion,
    secondarySuggestion: rpeHigh ? repTargetSuggestion : deloadSuggestion,
  };
}

// ── applyBreakThroughFill ─────────────────────────────────────────────────

/**
 * Build the updates array for onApplyBreakThrough.
 *
 * Fully-empty predicate: include a set when:
 *   !completed && weight in (null, 0) && reps in (null, 0)
 *
 * For `rep_plus_one` (reps-only branches): weight is preserved bit-for-bit
 * from the existing set (0 stays 0, null stays null) — null is NOT a no-op
 * for updateSetsBatch (it would overwrite the column).
 *
 * Pure function — does not call any DB or React APIs.
 */
export function applyBreakThroughFill(
  suggestion: BreakThroughSuggestion,
  sets: { id: string; weight: number | null; reps: number | null; completed: boolean }[],
): { id: string; weight: number | null; reps: number | null }[] {
  if (suggestion.kind === "form_check") return [];

  return sets
    .filter(
      (s) =>
        !s.completed &&
        (s.weight == null || s.weight === 0) &&
        (s.reps == null || s.reps === 0),
    )
    .map((s) => {
      if (suggestion.kind === "rep_plus_one") {
        // Preserve existing weight bit-for-bit (0 stays 0, null stays null).
        return { id: s.id, weight: s.weight, reps: suggestion.reps };
      }
      return { id: s.id, weight: suggestion.weight, reps: suggestion.reps };
    });
}
