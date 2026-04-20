import { getNextWorkout, getPrograms, getProgramDayCounts } from "../../lib/programs";
import {
  getActiveSession, getAllCompletedSessionWeeks, getRecentPRs, getRecentSessions,
  getSessionAvgRPEs, getSessionSetCounts, getTemplateExerciseCounts,
  getTemplates, getTodaySchedule, getWeekAdherence, isTodayCompleted,
  getMuscleRecoveryStatus, getTemplatePrimaryMuscles, getWeeklyVolume, getE1RMTrends,
  getTotalSessionCount, getTemplateDurationEstimates,
} from "../../lib/db";
import { computeStreak } from "../../lib/format";
import { computeAllTemplateReadiness, hasWorkoutHistory } from "../../lib/recovery-readiness";
import { generateInsight, type GoalInsightRow } from "../../lib/insights";
import { getActiveGoals, getCurrentBestWeight, getCurrentBestReps } from "../../lib/db";
import { getExerciseById } from "../../lib/db";

export async function loadHomeData() {
  const [tpls, sess, act, timestamps, prData, progs, nw, sched, done, adh] = await Promise.all([
    getTemplates(), getRecentSessions(5), getActiveSession(), getAllCompletedSessionWeeks(),
    getRecentPRs(5), getPrograms(), getNextWorkout(), getTodaySchedule(), isTodayCompleted(), getWeekAdherence(),
  ]);
  const [counts, setCounts, avgRPEs, dayCounts, templateMuscles, weeklyVolume, e1rmTrends, totalSessions] = await Promise.all([
    getTemplateExerciseCounts(tpls.map((t) => t.id)),
    getSessionSetCounts(sess.map((s) => s.id)),
    getSessionAvgRPEs(sess.map((s) => s.id)),
    getProgramDayCounts(progs.map((p) => p.id)),
    getTemplatePrimaryMuscles(tpls.map((t) => t.id)),
    getWeeklyVolume(8),
    getE1RMTrends(),
    getTotalSessionCount(),
  ]);

  // Load duration estimates (degrade gracefully — home screen must not crash)
  let durationEstimates: Record<string, number | null> = {};
  try {
    const nonStarterIds = tpls.filter((t) => !t.is_starter).map((t) => t.id);
    durationEstimates = await getTemplateDurationEstimates(nonStarterIds);
  } catch {
    // Fallback to empty map — no duration badges shown
  }

  const recoveryStatus = await getMuscleRecoveryStatus();
  const templateReadiness = computeAllTemplateReadiness(templateMuscles, recoveryStatus);
  const showReadiness = hasWorkoutHistory(recoveryStatus);

  // Load goal insights (degrade gracefully if no goals)
  const goalInsights = await loadGoalInsights();

  const insight = generateInsight({ totalSessions, timestamps, e1rmTrends, weeklyVolume, goalInsights });
  return { templates: tpls, sessions: sess, active: act, streak: computeStreak(timestamps), recentPRs: prData, programs: progs, nextWorkout: nw, todaySchedule: sched, todayDone: done, adherence: adh, counts, setCounts, avgRPEs, dayCounts, recoveryStatus, templateReadiness, showReadiness, insight, durationEstimates };
}

async function loadGoalInsights(): Promise<GoalInsightRow[]> {
  try {
    const activeGoals = await getActiveGoals();
    const results: GoalInsightRow[] = [];
    for (const goal of activeGoals.slice(0, 3)) {
      const exercise = await getExerciseById(goal.exercise_id);
      if (!exercise) continue;
      const isBodyweight = goal.target_reps != null && goal.target_weight == null;
      const best = isBodyweight
        ? await getCurrentBestReps(goal.exercise_id)
        : await getCurrentBestWeight(goal.exercise_id);
      const target = isBodyweight ? (goal.target_reps ?? 0) : (goal.target_weight ?? 0);
      const pct = target > 0 && best != null ? Math.round((best / target) * 100) : 0;
      results.push({ exercise_id: goal.exercise_id, exercise_name: exercise.name, progressPct: pct });
    }
    return results;
  } catch {
    // Goals not available (e.g. first launch before migration)
    return [];
  }
}
