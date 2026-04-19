/**
 * Recovery Readiness — pure functions for computing template readiness
 * based on muscle recovery status.
 *
 * Scoring model:
 * - recovered = 1.0
 * - partial   = 0.5
 * - fatigued  = 0.0
 * - no_data   = 0.75  (assume ready if no workout history for that muscle)
 *
 * Badge thresholds:
 * - >= 0.8 → READY (green)
 * - >= 0.5 → PARTIAL (amber)
 * - <  0.5 → REST (red)
 * - no muscles / no data → NO_DATA
 */

import type { MuscleGroup } from "./types";
import type { MuscleRecoveryStatus, RecoveryStatus } from "./db/recovery";

export type ReadinessBadge = "READY" | "PARTIAL" | "REST" | "NO_DATA";

export type TemplateReadiness = {
  templateId: string;
  score: number;
  badge: ReadinessBadge;
};

const STATUS_SCORES: Record<RecoveryStatus, number> = {
  recovered: 1.0,
  partial: 0.5,
  fatigued: 0.0,
  no_data: 0.75,
};

/**
 * Compute readiness score for a single template.
 * Returns score between 0 and 1, or null if no muscles to evaluate.
 */
export function computeTemplateReadiness(
  primaryMuscles: MuscleGroup[],
  recoveryByMuscle: Map<MuscleGroup, RecoveryStatus>
): number | null {
  if (primaryMuscles.length === 0) return null;

  let totalScore = 0;
  for (const muscle of primaryMuscles) {
    const status = recoveryByMuscle.get(muscle) ?? "no_data";
    totalScore += STATUS_SCORES[status];
  }
  return totalScore / primaryMuscles.length;
}

/**
 * Map a readiness score to a badge.
 */
export function getReadinessBadge(score: number | null): ReadinessBadge {
  if (score === null) return "NO_DATA";
  if (score >= 0.8) return "READY";
  if (score >= 0.5) return "PARTIAL";
  return "REST";
}

/**
 * Build a muscle → recovery status lookup map from the recovery status array.
 */
export function buildRecoveryMap(
  recoveryStatus: MuscleRecoveryStatus[]
): Map<MuscleGroup, RecoveryStatus> {
  const map = new Map<MuscleGroup, RecoveryStatus>();
  for (const rs of recoveryStatus) {
    map.set(rs.muscle, rs.status);
  }
  return map;
}

/**
 * Check if the user has any workout history (i.e. any muscle is not "no_data").
 * If all muscles are no_data, we should hide badges entirely.
 */
export function hasWorkoutHistory(
  recoveryStatus: MuscleRecoveryStatus[]
): boolean {
  return recoveryStatus.some((rs) => rs.status !== "no_data");
}

/**
 * Compute readiness for multiple templates at once.
 */
export function computeAllTemplateReadiness(
  templateMuscles: Record<string, MuscleGroup[]>,
  recoveryStatus: MuscleRecoveryStatus[]
): Record<string, TemplateReadiness> {
  const recoveryMap = buildRecoveryMap(recoveryStatus);
  const result: Record<string, TemplateReadiness> = {};

  for (const [templateId, muscles] of Object.entries(templateMuscles)) {
    const score = computeTemplateReadiness(muscles, recoveryMap);
    result[templateId] = {
      templateId,
      score: score ?? 0,
      badge: getReadinessBadge(score),
    };
  }

  return result;
}
