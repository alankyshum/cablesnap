import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import {
  getBodySettings,
  getSessionById,
  getSessionComparison,
  getSessionPRs,
  getSessionRepPRs,
  getSessionSetCount,
  getSessionSets,
  getSessionWeightIncreases,
  buildAchievementContext,
  getEarnedAchievementIds,
  saveEarnedAchievements,
} from "../lib/db";
import { evaluateAchievements } from "../lib/achievements";
import type { AchievementDef } from "../lib/achievements";
import type { WorkoutSession, WorkoutSet } from "../lib/types";

type PR = { exercise_id: string; name: string; weight: number; previous_max: number };
type RepPR = { exercise_id: string; name: string; reps: number; previous_max: number };
type Increase = { exercise_id: string; name: string; current: number; previous: number };
type Comparison = {
  previous: { volume: number; duration: number; sets: number } | null;
  current: { volume: number; duration: number; sets: number };
} | null;

export type { PR, RepPR, Increase, Comparison };

export function useSummaryData(id: string | undefined) {
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [sets, setSets] = useState<(WorkoutSet & { exercise_name?: string })[]>([]);
  const [prs, setPrs] = useState<PR[]>([]);
  const [repPrs, setRepPrs] = useState<RepPR[]>([]);
  const [increases, setIncreases] = useState<Increase[]>([]);
  const [comparison, setComparison] = useState<Comparison>(null);
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [newAchievements, setNewAchievements] = useState<AchievementDef[]>([]);
  const [completedSetCount, setCompletedSetCount] = useState(0);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [sess, settings] = await Promise.all([
        getSessionById(id),
        getBodySettings(),
      ]);
      if (!sess) return;
      setSession(sess);
      setUnit(settings.weight_unit);

      const [setsData, prData, repPrData, incData, compData, setCount] = await Promise.all([
        getSessionSets(id),
        getSessionPRs(id),
        getSessionRepPRs(id),
        getSessionWeightIncreases(id),
        getSessionComparison(id),
        getSessionSetCount(id),
      ]);
      setSets(setsData);
      setPrs(prData);
      setCompletedSetCount(setCount);
      setRepPrs(repPrData);
      setIncreases(incData.filter(
        (inc) => !prData.some((pr) => pr.exercise_id === inc.exercise_id)
      ));
      setComparison(compData);

      try {
        const [ctx, alreadyEarnedIds] = await Promise.all([
          buildAchievementContext(),
          getEarnedAchievementIds(),
        ]);
        const earned = evaluateAchievements(ctx, alreadyEarnedIds);
        if (earned.length > 0) {
          await saveEarnedAchievements(earned.map((e) => e.achievement.id));
          setNewAchievements(earned.map((e) => e.achievement));
          if (Platform.OS !== "web") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          }
        }
      } catch (e) {
        if (__DEV__) console.warn("Achievement evaluation failed:", e);
      }

      AccessibilityInfo.announceForAccessibility("Workout Complete!");
    })();
  }, [id]);

  const completed = useMemo(
    () => sets.filter((s) => s.completed),
    [sets],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; sets: typeof completed }>();
    for (const s of completed) {
      const key = s.exercise_id;
      if (!map.has(key)) map.set(key, { name: s.exercise_name ?? key, sets: [] });
      map.get(key)!.sets.push(s);
    }
    return [...map.values()];
  }, [completed]);

  const volume = useMemo(() => {
    let total = 0;
    for (const s of completed) {
      if (s.weight && s.reps && !s.is_warmup) total += s.weight * s.reps;
    }
    return total;
  }, [completed]);

  const setTypeCounts = useMemo(() => {
    const counts = { normal: 0, warmup: 0, dropset: 0, failure: 0 };
    for (const s of completed) {
      const t = (s as { set_type?: string }).set_type ?? (s.is_warmup ? "warmup" : "normal");
      if (t in counts) counts[t as keyof typeof counts]++;
    }
    return counts;
  }, [completed]);

  const setsBreakdown = useMemo(() => {
    const parts: string[] = [];
    if (setTypeCounts.normal > 0) parts.push(`${setTypeCounts.normal} working`);
    if (setTypeCounts.warmup > 0) parts.push(`${setTypeCounts.warmup} warm-up`);
    if (setTypeCounts.dropset > 0) parts.push(`${setTypeCounts.dropset} dropset`);
    if (setTypeCounts.failure > 0) parts.push(`${setTypeCounts.failure} failure`);
    return parts.join(" · ");
  }, [setTypeCounts]);

  return {
    session, setSession,
    sets, completed, grouped,
    prs, repPrs, increases, comparison,
    unit, volume, setsBreakdown,
    newAchievements, completedSetCount,
  };
}
