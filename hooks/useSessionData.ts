/* eslint-disable max-lines-per-function, complexity, react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import { useToast } from "@/components/ui/bna-toast";
import {
  addSetsBatch,
  getBodySettings,
  getAllExercises,
  getMaxWeightByExercise,
  getRecentExerciseSetsBatch,
  getSessionById,
  getSessionSets,
  getSourceSessionSets,
  getTemplateById,
  getPreviousSetsBatch,
  getExercisesByIds,
  updateSetsBatch,
  updateExercisePositions,
} from "../lib/db";
import type { WorkoutSession, TrainingMode, Exercise } from "../lib/types";
import type { SetWithMeta, ExerciseGroup } from "../components/session/types";
import { epley, suggest, type Suggestion } from "../lib/rm";
import {
  formatPreviousPerformance,
  formatPreviousPerformanceAccessibility,
  type PreviousPerformance,
} from "../lib/format";
import { uuid } from "../lib/uuid";
import { getQueryVersion } from "../lib/query";
import { useThemeColors } from "@/hooks/useThemeColors";

type UseSessionDataArgs = {
  id: string | undefined;
  templateId: string | undefined;
  sourceSessionId: string | undefined;
};

export function useSessionData({ id, templateId, sourceSessionId }: UseSessionDataArgs) {
  const router = useRouter();
  const colors = useThemeColors();
  const { warning: showWarning } = useToast();

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [groups, setGroups] = useState<ExerciseGroup[]>([]);
  const [step, setStep] = useState(2.5);
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion | null>>({});
  const [modes, setModes] = useState<Record<string, TrainingMode>>({});
  const [maxes, setMaxes] = useState<Record<string, number>>({});
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);

  const initialized = useRef(false);
  const prevExerciseIds = useRef<string>("");
  const lastSessionVersion = useRef(-1);
  const lastExercisesVersion = useRef(-1);

  const linkIds = useMemo(() => {
    const ids: string[] = [];
    for (const g of groups) {
      if (g.link_id && !ids.includes(g.link_id)) ids.push(g.link_id);
    }
    return ids;
  }, [groups]);

  const palette = useMemo(
    () => [colors.tertiary, colors.secondary, colors.primary, colors.error, colors.inversePrimary],
    [colors],
  );

  const updateGroupSet = useCallback((setId: string, patch: Partial<SetWithMeta>) => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        sets: g.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
      }))
    );
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    const sess = await getSessionById(id);
    if (!sess) return;
    setSession(sess);

    if (sess.completed_at) {
      router.replace(`/session/detail/${id}`);
      return;
    }

    const sets = await getSessionSets(id);

    const body = await getBodySettings();
    const derived = body.weight_unit === "lb" ? 5 : 2.5;
    setStep(derived);
    setUnit(body.weight_unit);

    const exerciseIds = [...new Set(sets.map((s) => s.exercise_id))];

    const [prevCache, exerciseMeta, recentByExercise] = await Promise.all([
      getPreviousSetsBatch(exerciseIds, id),
      getExercisesByIds(exerciseIds),
      getRecentExerciseSetsBatch(exerciseIds, 2),
    ]);

    const key = exerciseIds.sort().join(",");
    if (key !== prevExerciseIds.current) {
      prevExerciseIds.current = key;
      const m = await getMaxWeightByExercise(exerciseIds, id);
      setMaxes(m);
    }

    const map = new Map<string, ExerciseGroup>();
    for (const s of sets) {
      if (!map.has(s.exercise_id)) {
        const ex = exerciseMeta[s.exercise_id];
        const parsed: TrainingMode[] = ex?.training_modes ?? [];
        map.set(s.exercise_id, {
          exercise_id: s.exercise_id,
          name: (s.exercise_name ?? "Unknown") + (s.exercise_deleted ? " (removed)" : ""),
          sets: [],
          link_id: s.link_id ?? null,
          training_modes: parsed,
          is_voltra: ex?.is_voltra ?? false,
          is_bodyweight: ex ? ex.equipment === "bodyweight" : false,
          trackingMode: parsed.includes("isometric" as TrainingMode) ? "duration" : "reps",
          equipment: ex?.equipment ?? "other",
          exercise_position: s.exercise_position ?? 0,
        });
      }
      const prev = prevCache[s.exercise_id]?.find(
        (p) => p.set_number === s.set_number
      );
      const group = map.get(s.exercise_id)!;
      const isDuration = group.trackingMode === "duration";
      let prevDisplay = "-";
      if (prev) {
        if (isDuration && prev.duration_seconds != null && prev.duration_seconds > 0) {
          const m = Math.floor(prev.duration_seconds / 60);
          const sec = prev.duration_seconds % 60;
          const durStr = `${m}:${sec.toString().padStart(2, "0")}`;
          prevDisplay = prev.weight != null && prev.weight > 0
            ? `${prev.weight} × ${durStr}`
            : durStr;
        } else if (prev.weight != null && prev.reps != null) {
          prevDisplay = prev.weight > 0 && prev.reps > 1
            ? `${prev.weight}×${prev.reps} (1RM: ${Math.round(epley(prev.weight, prev.reps))})`
            : `${prev.weight}×${prev.reps}`;
        }
      }
      group.sets.push({
        ...s,
        previous: prevDisplay,
      });
    }
    const groupList = [...map.values()];

    // Compute previous performance summary per exercise from prevCache
    for (const group of groupList) {
      const prevSets = prevCache[group.exercise_id];
      if (!prevSets || prevSets.length === 0) continue;

      // Filter out warmup sets
      const workingSets = prevSets.filter((s) => s.set_type !== "warmup");
      if (workingSets.length === 0) continue;

      const isDuration = group.trackingMode === "duration";
      const perf: PreviousPerformance = {
        setCount: workingSets.length,
        maxWeight: Math.max(0, ...workingSets.map((s) => s.weight ?? 0)),
        maxReps: Math.max(0, ...workingSets.map((s) => s.reps ?? 0)),
        isBodyweight: group.is_bodyweight,
        maxDuration: isDuration
          ? Math.max(0, ...workingSets.map((s) => s.duration_seconds ?? 0))
          : null,
      };
      group.previousSummary = formatPreviousPerformance(perf, body.weight_unit);
      group.previousSummaryA11y = formatPreviousPerformanceAccessibility(perf, body.weight_unit);
    }

    // Auto-assign positions for pre-migration sessions (all positions = 0)
    const allZero = groupList.every((g) => g.exercise_position === 0);
    if (allZero && groupList.length > 1) {
      const positionUpdates: { exerciseId: string; position: number }[] = [];
      groupList.forEach((g, i) => {
        g.exercise_position = i + 1;
        positionUpdates.push({ exerciseId: g.exercise_id, position: i + 1 });
      });
      // Fire-and-forget: persist auto-assigned positions
      updateExercisePositions(id, positionUpdates).catch(() => {});
    }

    setGroups(groupList);

    const entries: [string, Suggestion | null][] = exerciseIds.map((eid) => {
      try {
        const recent = recentByExercise[eid] ?? [];
        if (recent.length === 0) return [eid, null];
        const timeBased = recent.every((r) => r.reps === 1 && (r.weight === 0 || r.weight === null));
        if (timeBased) return [eid, null];
        const ex = exerciseMeta[eid];
        const bw = ex ? ex.equipment === "bodyweight" : false;
        return [eid, suggest(recent, derived, bw)];
      } catch {
        return [eid, null];
      }
    });
    const sugg: Record<string, Suggestion | null> = Object.fromEntries(entries);
    setSuggestions(sugg);
  }, [id, router]);

  // Initialize session from template or source session
  useEffect(() => {
    if (initialized.current || !id) return;
    initialized.current = true;

    (async () => {
      const sets = await getSessionSets(id);
      if (sets.length > 0) {
        await load();
        return;
      }

      if (templateId) {
        const tpl = await getTemplateById(templateId);
        if (tpl?.exercises) {
          const setsToInsert: Parameters<typeof addSetsBatch>[0] = [];
          for (const te of tpl.exercises) {
            for (let i = 1; i <= te.target_sets; i++) {
              setsToInsert.push({
                sessionId: id,
                exerciseId: te.exercise_id,
                setNumber: i,
                linkId: te.link_id ?? null,
                round: te.link_id ? i : null,
                exercisePosition: te.position,
              });
            }
          }
          await addSetsBatch(setsToInsert);

          const created = await getSessionSets(id);
          const exerciseIds = [...new Set(created.map((s) => s.exercise_id))];
          const prevCache = await getPreviousSetsBatch(exerciseIds, id);

          const setsToUpdate: { id: string; weight: number | null; reps: number | null }[] = [];
          for (const s of created) {
            const prev = prevCache[s.exercise_id]?.find((p) => p.set_number === s.set_number);
            if (prev && prev.weight != null) {
              setsToUpdate.push({ id: s.id, weight: prev.weight, reps: null });
            }
          }
          await updateSetsBatch(setsToUpdate);
        }
      } else if (sourceSessionId) {
        const sourceSets = await getSourceSessionSets(sourceSessionId);

        const deletedExerciseIds = new Set<string>();
        const validSets = sourceSets.filter((s) => {
          if (!s.exercise_exists) {
            deletedExerciseIds.add(s.exercise_id);
            return false;
          }
          return true;
        });

        if (deletedExerciseIds.size > 0) {
          showWarning(
            `${deletedExerciseIds.size} exercise${deletedExerciseIds.size > 1 ? "s were" : " was"} skipped (no longer available)`
          );
        }

        if (validSets.length > 0) {
          const linkIdMap = new Map<string, string>();
          for (const s of validSets) {
            if (s.link_id && !linkIdMap.has(s.link_id)) {
              linkIdMap.set(s.link_id, uuid());
            }
          }

          const setsToInsert: Parameters<typeof addSetsBatch>[0] = [];
          for (const s of validSets) {
            const newLinkId = s.link_id ? linkIdMap.get(s.link_id) ?? null : null;
            setsToInsert.push({
              sessionId: id,
              exerciseId: s.exercise_id,
              setNumber: s.set_number,
              linkId: newLinkId,
              round: newLinkId ? s.set_number : null,
              trainingMode: (s.training_mode as TrainingMode) ?? null,
              tempo: s.tempo ?? null,
              setType: s.set_type,
            });
          }
          const created = await addSetsBatch(setsToInsert);

          const setsToUpdate: { id: string; weight: number | null; reps: number | null }[] = [];
          for (let i = 0; i < created.length; i++) {
            const source = validSets[i];
            if (source && (source.weight != null || source.reps != null)) {
              setsToUpdate.push({
                id: created[i].id,
                weight: source.weight,
                reps: source.reps,
              });
            }
          }
          await updateSetsBatch(setsToUpdate);
        }
      }
      await load();
    })();
  }, [id, templateId, sourceSessionId, load]);

  // Reload only when session or exercises data has changed since last focus.
  // First focus always reloads; subsequent focuses only reload if version bumped.
  useFocusEffect(
    useCallback(() => {
      if (!initialized.current) return;

      const sessionVer = getQueryVersion("session");
      const exercisesVer = getQueryVersion("exercises");
      const isFirstFocus = lastSessionVersion.current === -1;

      let needsSessionReload = isFirstFocus;
      let needsExerciseReload = isFirstFocus;

      if (!isFirstFocus) {
        if (sessionVer !== lastSessionVersion.current) {
          needsSessionReload = true;
        }
        if (exercisesVer !== lastExercisesVersion.current) {
          needsExerciseReload = true;
          needsSessionReload = true;
        }
      }

      lastSessionVersion.current = sessionVer;
      lastExercisesVersion.current = exercisesVer;

      if (needsSessionReload && id) {
        load();
      }
      if (needsExerciseReload) {
        getAllExercises().then(setAllExercises).catch((err) => {
          if (__DEV__) console.warn("Failed to load exercises for substitution:", err);
        });
      }
    }, [id, load])
  );

  return {
    session,
    groups,
    setGroups,
    step,
    unit,
    suggestions,
    modes,
    setModes,
    maxes,
    allExercises,
    linkIds,
    palette,
    updateGroupSet,
    load,
  };
}
