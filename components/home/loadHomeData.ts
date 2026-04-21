import { getNextWorkout, getPrograms, getProgramDayCounts } from "../../lib/programs";
import {
  getActiveSession, getAllCompletedSessionWeeks, getRecentPRs, getRecentSessions,
  getSessionAvgRPEs, getSessionSetCounts, getTemplateExerciseCounts,
  getTemplates, getTodaySchedule, getWeekAdherence, isTodayCompleted,
  getMuscleRecoveryStatus, getTemplatePrimaryMuscles, getWeeklyVolume, getE1RMTrends,
  getTotalSessionCount, getTemplateDurationEstimates,
  getAppSetting, getWeeklyCompletedCount,
  getWeeklyE1RMTrends, getRecentSessionRPEs, getRecentSessionRatings,
  getWeeklyWorkouts, getBodySettings,
} from "../../lib/db";
import { computeStreak, mondayOf } from "../../lib/format";
import { computeAllTemplateReadiness, hasWorkoutHistory } from "../../lib/recovery-readiness";
import { generateInsight, type GoalInsightRow } from "../../lib/insights";
import {
  computeOverreachingScore,
  parseDismissalState,
  isDismissed,
  type OverreachingResult,
} from "../../lib/overreaching";
import { getActiveGoals, getCurrentBestWeight, getCurrentBestReps } from "../../lib/db";
import { getExerciseById } from "../../lib/db";

export type WeeklyGoalProgress = {
  mode: "schedule" | "frequency" | "hidden";
  /** Dots for AdherenceBar to render (goalCount length in frequency mode, 7 in schedule) */
  slots: { scheduled: boolean; completed: boolean }[];
  /** Actual completed workout count this week (may exceed targetCount) */
  completedCount: number;
  /** Target count (scheduled days for schedule mode, goal number for frequency) */
  targetCount: number;
};

export async function loadHomeData() {
  const [tpls, sess, act, timestamps, prData, progs, nw, sched, done, adh, weeklyWorkouts, bodySettings] = await Promise.all([
    getTemplates(), getRecentSessions(5), getActiveSession(), getAllCompletedSessionWeeks(),
    getRecentPRs(5), getPrograms(), getNextWorkout(), getTodaySchedule(), isTodayCompleted(), getWeekAdherence(),
    getWeeklyWorkouts(mondayOf(new Date())), getBodySettings(),
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

  // Compute overreaching score (degrade gracefully — must not break home screen)
  let overreachingResult: OverreachingResult | null = null;
  try {
    const now = Date.now();
    const [weeklyE1RMData, sessionRPEData, sessionRatingData, deloadDismissalRaw] = await Promise.all([
      getWeeklyE1RMTrends(),
      getRecentSessionRPEs(),
      getRecentSessionRatings(),
      getAppSetting("deload_nudge_dismissal"),
    ]);
    const result = computeOverreachingScore(weeklyE1RMData, sessionRPEData, sessionRatingData, now);
    const dismissalState = parseDismissalState(deloadDismissalRaw);
    if (result.shouldNudge && !isDismissed(dismissalState, now)) {
      overreachingResult = result;
    }
  } catch {
    // Overreaching detection failed — degrade to no nudge
  }

  // Build weekly goal progress (frequency goal fallback)
  const weeklyGoalProgress = await buildWeeklyGoalProgress(adh);

  return { templates: tpls, sessions: sess, active: act, streak: computeStreak(timestamps), recentPRs: prData, programs: progs, nextWorkout: nw, todaySchedule: sched, todayDone: done, adherence: adh, counts, setCounts, avgRPEs, dayCounts, recoveryStatus, templateReadiness, showReadiness, insight, overreachingResult, durationEstimates, weeklyGoalProgress, weeklyWorkouts, unitSystem: (bodySettings?.weight_unit ?? "kg") as "kg" | "lb" };
}

export async function buildWeeklyGoalProgress(
  adh: { day: number; scheduled: boolean; completed: boolean }[],
): Promise<WeeklyGoalProgress> {
  const scheduledDays = adh.filter((a) => a.scheduled);

  // Priority 1: Active program with schedule
  if (scheduledDays.length > 0) {
    const completedCount = adh.filter((a) => a.completed).length;
    return {
      mode: "schedule",
      slots: adh,
      completedCount,
      targetCount: scheduledDays.length,
    };
  }

  // Priority 2: Frequency goal (no program schedule)
  try {
    const raw = await getAppSetting("weekly_training_goal");
    const goal = raw != null ? parseInt(raw, 10) : NaN;
    if (!isNaN(goal) && goal >= 1 && goal <= 7) {
      const completedCount = await getWeeklyCompletedCount();
      const filledCount = Math.min(completedCount, goal);
      const slots = Array.from({ length: goal }, (_, i) => ({
        scheduled: true,
        completed: i < filledCount,
      }));
      return { mode: "frequency", slots, completedCount, targetCount: goal };
    }
  } catch {
    // Degrade gracefully — treat as no goal set
  }

  // Priority 3: No schedule, no goal — hidden
  return { mode: "hidden", slots: [], completedCount: 0, targetCount: 0 };
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
