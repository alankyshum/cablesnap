import { getNextWorkout, getPrograms, getProgramDayCounts } from "../../lib/programs";
import {
  getActiveSession, getAllCompletedSessionWeeks, getRecentPRs, getRecentSessions,
  getSessionAvgRPEs, getSessionSetCounts, getTemplateExerciseCounts,
  getTemplates, getTodaySchedule, getWeekAdherence, isTodayCompleted,
  getMuscleRecoveryStatus, getTemplatePrimaryMuscles, getWeeklyVolume, getE1RMTrends,
  getTotalSessionCount,
} from "../../lib/db";
import { computeStreak } from "../../lib/format";
import { computeAllTemplateReadiness, hasWorkoutHistory } from "../../lib/recovery-readiness";
import { generateInsight } from "../../lib/insights";

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
  const recoveryStatus = await getMuscleRecoveryStatus();
  const templateReadiness = computeAllTemplateReadiness(templateMuscles, recoveryStatus);
  const showReadiness = hasWorkoutHistory(recoveryStatus);
  const insight = generateInsight({ totalSessions, timestamps, e1rmTrends, weeklyVolume });
  return { templates: tpls, sessions: sess, active: act, streak: computeStreak(timestamps), recentPRs: prData, programs: progs, nextWorkout: nw, todaySchedule: sched, todayDone: done, adherence: adh, counts, setCounts, avgRPEs, dayCounts, recoveryStatus, templateReadiness, showReadiness, insight };
}
