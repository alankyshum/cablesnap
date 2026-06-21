import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import {
  getBodySettings,
  getSessionById,
  getSessionComparison,
  getSessionPRs,
  getSessionRepPRs,
  getSessionDurationPRs,
  getSessionSetCount,
  getSessionSets,
  getSessionWeightIncreases,
  getExercisesByIds,
  buildAchievementContext,
  getEarnedAchievementIds,
  saveEarnedAchievements,
} from "../lib/db";
import { evaluateAchievements } from "../lib/achievements";
import type { AchievementDef } from "../lib/achievements";
import type { WorkoutSession, WorkoutSet, MuscleGroup } from "../lib/types";
import { aggregateMuscles } from "../lib/aggregate-muscles";

type PR = { exercise_id: string; name: string; weight: number; previous_max: number };
type RepPR = { exercise_id: string; name: string; reps: number; previous_max: number };
type DurationPR = { exercise_id: string; name: string; duration: number; previous_max: number };
type Increase = { exercise_id: string; name: string; current: number; previous: number };
type Comparison = {
  previous: { volume: number; duration: number; sets: number } | null;
  current: { volume: number; duration: number; sets: number };
} | null;

export type { PR, RepPR, DurationPR, Increase, Comparison };

export function useSummaryData(id: string | undefined) {
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [sets, setSets] = useState<(WorkoutSet & { exercise_name?: string })[]>([]);
  const [prs, setPrs] = useState<PR[]>([]);
  const [repPrs, setRepPrs] = useState<RepPR[]>([]);
  const [durationPrs, setDurationPrs] = useState<DurationPR[]>([]);
  const [increases, setIncreases] = useState<Increase[]>([]);
  const [comparison, setComparison] = useState<Comparison>(null);
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [newAchievements, setNewAchievements] = useState<AchievementDef[]>([]);
  const [completedSetCount, setCompletedSetCount] = useState(0);
  const [primaryMuscles, setPrimaryMuscles] = useState<MuscleGroup[]>([]);
  const [secondaryMuscles, setSecondaryMuscles] = useState<MuscleGroup[]>([]);
  // BLD-1636: defense-in-depth. The data load runs in an async IIFE inside
  // useEffect, so a throw here (e.g. a cold-worker `Sync operation timeout`
  // from a drizzle sync `.get()`) becomes an UNHANDLED promise rejection that
  // React's render-phase ErrorBoundary cannot catch — on web's Expo dev build
  // it surfaces as the full-screen error overlay (BLD-1635). Capture it in
  // state and re-throw during render (see app/session/summary/[id].tsx) so the
  // route ErrorBoundary's retry/share-report UI renders instead of a white
  // screen / dev overlay. The primary fix is warming the worker at init
  // (lib/db/helpers.ts#warmSyncWorker); this is the safety net.
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [sess, settings] = await Promise.all([
          getSessionById(id),
          getBodySettings(),
        ]);
        if (cancelled) return;
        if (!sess) return;
        setSession(sess);
        setUnit(settings.weight_unit);

        const [setsData, prData, repPrData, durationPrData, incData, compData, setCount] = await Promise.all([
          getSessionSets(id),
          getSessionPRs(id),
          getSessionRepPRs(id),
          getSessionDurationPRs(id),
          getSessionWeightIncreases(id),
          getSessionComparison(id),
          getSessionSetCount(id),
        ]);
        if (cancelled) return;
        setSets(setsData);
        setPrs(prData);
        setCompletedSetCount(setCount);
        setRepPrs(repPrData);
        setDurationPrs(durationPrData);
        setIncreases(incData.filter(
          (inc) => !prData.some((pr) => pr.exercise_id === inc.exercise_id)
        ));
        setComparison(compData);

        // Aggregate muscles from completed exercises
        const completedSets = setsData.filter((s) => s.completed);
        const exerciseIds = [...new Set(completedSets.map((s) => s.exercise_id))];
        if (exerciseIds.length > 0) {
          const exerciseMap = await getExercisesByIds(exerciseIds);
          if (cancelled) return;
          const exerciseList = Object.values(exerciseMap);
          const { primary, secondary } = aggregateMuscles(exerciseList);
          setPrimaryMuscles(primary);
          setSecondaryMuscles(secondary);
        }

        try {
          const [ctx, alreadyEarnedIds] = await Promise.all([
            buildAchievementContext(),
            getEarnedAchievementIds(),
          ]);
          const earned = evaluateAchievements(ctx, alreadyEarnedIds);
          if (cancelled) return;
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
      } catch (e) {
        // BLD-1636: surface load failures (e.g. a cold-worker drizzle
        // "Sync operation timeout") via state so the route ErrorBoundary's
        // retry UI renders, instead of letting it escape as an unhandled
        // promise rejection / Expo dev overlay.
        if (cancelled) return;
        const err = e instanceof Error ? e : new Error(String(e));
        if (__DEV__) console.warn("[useSummaryData] load failed:", err);
        setError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const completed = useMemo(
    () => sets.filter((s) => s.completed),
    [sets],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; sets: typeof completed }>();
    for (const s of completed) {
      if (s.set_type === "warmup") continue;
      const key = s.exercise_id;
      if (!map.has(key)) map.set(key, { name: s.exercise_name ?? key, sets: [] });
      map.get(key)!.sets.push(s);
    }
    return [...map.values()];
  }, [completed]);

  const volume = useMemo(() => {
    let total = 0;
    for (const s of completed) {
      // BLD-1174: use cached_volume_kg (segment-aware); fall back to weight*reps for legacy rows
      if (s.set_type !== 'warmup') {
        total += s.cached_volume_kg ?? (s.weight && s.reps ? s.weight * s.reps : 0);
      }
    }
    return total;
  }, [completed]);

  const setTypeCounts = useMemo(() => {
    const counts = { normal: 0, warmup: 0, dropset: 0, failure: 0 };
    for (const s of completed) {
      const t = (s as { set_type?: string }).set_type ?? "normal";
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
    prs, repPrs, durationPrs, increases, comparison,
    unit, volume, setsBreakdown,
    newAchievements, completedSetCount,
    primaryMuscles, secondaryMuscles,
    error,
  };
}
