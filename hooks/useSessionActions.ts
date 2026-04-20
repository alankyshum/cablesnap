/* eslint-disable max-lines-per-function, react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Keyboard, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  addSet,
  cancelSession,
  deleteSet,
  completeSession,
  completeSet,
  getRestSecondsForLink,
  uncompleteSet,
  updateSet,
  updateSetRPE,
  updateSetNotes,
  updateSetTrainingMode,
  getSessionSets,
  updateSetDuration,
  checkSetPR,
  updateExercisePositions,
  getGoalForExercise,
  achieveGoal,
  getCurrentBestWeight,
} from "../lib/db";
import { bumpQueryVersion } from "../lib/query";
import {
  getSessionProgramDayId,
  getProgramDayById,
  advanceProgram,
} from "../lib/programs";
import type { TrainingMode } from "../lib/types";
import { formatTime, computePrefillSets } from "../lib/format";
import { confirmAction } from "../lib/confirm";
import type { SetWithMeta, ExerciseGroup } from "../components/session/types";

/** Check if completing a set achieves a strength goal. Non-throwing. */
async function checkGoalAchievement(exerciseId: string): Promise<boolean> {
  try {
    const goal = await getGoalForExercise(exerciseId);
    if (goal?.target_weight != null) {
      const best = await getCurrentBestWeight(exerciseId);
      if (best != null && best >= goal.target_weight) {
        await achieveGoal(goal.id);
        return true;
      }
    }
  } catch {
    // Goal check must never block PR celebration
  }
  return false;
}

type Params = {
  id: string | undefined;
  groups: ExerciseGroup[];
  setGroups: React.Dispatch<React.SetStateAction<ExerciseGroup[]>>;
  modes: Record<string, TrainingMode>;
  setModes: React.Dispatch<React.SetStateAction<Record<string, TrainingMode>>>;
  updateGroupSet: (setId: string, updates: Partial<SetWithMeta>) => void;
  startRest: (exerciseId: string) => void;
  startRestWithDuration: (secs: number) => void;
  session: { started_at: number; name: string } | null;
  showToast: (msg: string) => void;
  showError: (msg: string) => void;
  triggerPR?: (exerciseName: string, goalAchieved?: boolean) => void;
  unit?: "kg" | "lb";
};

export function useSessionActions({
  id,
  groups,
  setGroups,
  modes,
  setModes,
  updateGroupSet,
  startRest,
  startRestWithDuration,
  session,
  showToast,
  showError,
  triggerPR,
  unit,
}: Params) {
  const router = useRouter();

  // --- local state ---
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [exerciseNotesOpen, setExerciseNotesOpen] = useState<Record<string, boolean>>({});
  const [exerciseNotesDraft, setExerciseNotesDraft] = useState<Record<string, string>>({});
  const [halfStep, setHalfStep] = useState<{ setId: string; base: number } | null>(null);
  const [nextHint, setNextHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Timer
  useEffect(() => {
    if (!session) return;
    const update = () => {
      setElapsed(Math.floor((Date.now() - session.started_at) / 1000));
    };
    update();
    timer.current = setInterval(update, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [session]);

  // Cleanup hint timer
  useEffect(() => {
    return () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, []);

  // --- handlers ---

  const handleUpdate = useCallback(async (
    setId: string,
    field: "weight" | "reps" | "duration_seconds",
    val: string
  ) => {
    let resolvedSet: SetWithMeta | undefined;
    setGroups((prev) => {
      for (const g of prev) {
        const s = g.sets.find((s) => s.id === setId);
        if (s) { resolvedSet = s; break; }
      }
      return prev;
    });
    if (!resolvedSet) return;

    const num = val === "" ? null : parseFloat(val);
    if (field === "weight") {
      updateGroupSet(setId, { weight: num });
      await updateSet(setId, num, resolvedSet.reps);
    } else if (field === "duration_seconds") {
      const rounded = num !== null ? Math.round(num) : null;
      updateGroupSet(setId, { duration_seconds: rounded });
      await updateSetDuration(setId, rounded);
    } else {
      const rounded = num !== null ? Math.round(num) : null;
      updateGroupSet(setId, { reps: rounded });
      await updateSet(setId, resolvedSet.weight, rounded);
    }
  }, [updateGroupSet]);

  /** Handle superset next-hint or rest timer for linked exercises. */
  const handleLinkedRest = useCallback(async (set: SetWithMeta) => {
    const linked = groups.filter((g) => g.link_id === set.link_id);
    const idx = linked.findIndex((g) => g.exercise_id === set.exercise_id);
    const next = idx >= 0 && idx < linked.length - 1 ? linked[idx + 1] : null;

    if (next) {
      setNextHint(`Next: ${next.name}`);
      AccessibilityInfo.announceForAccessibility(`Next: ${next.name}`);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setNextHint(null), 1500);
    } else {
      setNextHint(null);
      const secs = await getRestSecondsForLink(id!, set.link_id!);
      startRestWithDuration(secs);
    }
  }, [groups, id, startRestWithDuration]);

  const handleCheck = useCallback(async (set: SetWithMeta) => {
    if (set.completed) {
      updateGroupSet(set.id, { completed: false, completed_at: null });
      await uncompleteSet(set.id);
      return;
    }

    const now = Date.now();
    updateGroupSet(set.id, { completed: true, completed_at: now });
    await completeSet(set.id);

    // Live PR detection (non-blocking — errors never prevent set completion)
    if (set.set_type !== 'warmup' && set.weight && set.weight > 0 && id && triggerPR) {
      try {
        const isPR = await checkSetPR(set.exercise_id, set.weight, id);
        if (isPR) {
          const group = groups.find((g) => g.exercise_id === set.exercise_id);
          const goalAchieved = await checkGoalAchievement(set.exercise_id);
          triggerPR(group?.name ?? "exercise", goalAchieved);
          updateGroupSet(set.id, { is_pr: true });
        }
      } catch {
        // PR detection must never block set completion
      }
    }

    // Warmup sets skip rest timer — users don't need rest between warmup sets
    if (set.set_type === 'warmup') return;

    if (set.link_id) {
      await handleLinkedRest(set);
    } else {
      startRest(set.exercise_id);
    }
  }, [updateGroupSet, groups, id, startRest, startRestWithDuration, triggerPR, handleLinkedRest]);

  const handleAddSet = useCallback(async (exerciseId: string) => {
    const group = groups.find((g) => g.exercise_id === exerciseId);
    const num = (group?.sets.length ?? 0) + 1;
    const fallback = group?.is_voltra && group.training_modes.length > 1 ? group.training_modes[0] : null;
    const mode = modes[exerciseId] ?? fallback;
    const newSet = await addSet(id!, exerciseId, num, null, null, mode, null, undefined, undefined, group?.exercise_position ?? 0);
    setGroups((prev) =>
      prev.map((g) =>
        g.exercise_id === exerciseId
          ? { ...g, sets: [...g.sets, { ...newSet, previous: "-" }] }
          : g
      )
    );
  }, [id, groups, modes]);

  const handleModeChange = useCallback(async (exerciseId: string, mode: TrainingMode) => {
    setModes((prev) => ({ ...prev, [exerciseId]: mode }));
    const group = groups.find((g) => g.exercise_id === exerciseId);
    if (!group) return;
    setGroups((prev) =>
      prev.map((g) =>
        g.exercise_id === exerciseId
          ? { ...g, sets: g.sets.map((s) => (s.completed ? s : { ...s, training_mode: mode })) }
          : g
      )
    );
    for (const set of group.sets) {
      if (!set.completed) {
        await updateSetTrainingMode(set.id, mode);
      }
    }
  }, [groups]);

  const handleRPE = useCallback(async (set: SetWithMeta, val: number) => {
    const next = set.rpe === val ? null : val;
    updateGroupSet(set.id, { rpe: next });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateSetRPE(set.id, next);
  }, [updateGroupSet]);

  const handleHalfStep = useCallback(async (setId: string, val: number) => {
    updateGroupSet(setId, { rpe: val });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHalfStep(null);
    await updateSetRPE(setId, val);
  }, [updateGroupSet]);

  const handleDelete = useCallback(async (setId: string) => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        sets: g.sets.filter((s) => s.id !== setId)
          .map((s, i) => ({ ...s, set_number: i + 1 })),
      })).filter((g) => g.sets.length > 0)
    );
    await deleteSet(setId);
  }, []);

  const handleHalfStepClear = useCallback(() => setHalfStep(null), []);
  const handleHalfStepOpen = useCallback((setId: string, base: number) => {
    setHalfStep({ setId, base });
  }, []);

  const handleExerciseNotes = useCallback(async (exerciseId: string, text: string) => {
    const group = groups.find((g) => g.exercise_id === exerciseId);
    if (!group || group.sets.length === 0) return;
    const firstSetId = group.sets[0].id;
    updateGroupSet(firstSetId, { notes: text });
    setExerciseNotesDraft((prev) => { const n = { ...prev }; delete n[exerciseId]; return n; });
    await updateSetNotes(firstSetId, text);
  }, [updateGroupSet, groups]);

  const handleExerciseNotesDraftChange = useCallback((exerciseId: string, text: string) => {
    setExerciseNotesDraft((prev) => ({ ...prev, [exerciseId]: text }));
  }, []);

  const toggleExerciseNotes = useCallback((exerciseId: string) => {
    setExerciseNotesOpen((prev) => ({ ...prev, [exerciseId]: !prev[exerciseId] }));
  }, []);

  const handleMoveExercise = useCallback(async (exerciseId: string, direction: "up" | "down") => {
    if (!id) return;
    Keyboard.dismiss();
    // Find non-superset groups for reorder (supersets excluded)
    const reorderableGroups = groups.filter((g) => !g.link_id);
    const idx = reorderableGroups.findIndex((g) => g.exercise_id === exerciseId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= reorderableGroups.length) return;

    const a = reorderableGroups[idx];
    const b = reorderableGroups[swapIdx];

    // Swap positions in state
    const newPosA = b.exercise_position;
    const newPosB = a.exercise_position;

    setGroups((prev) => {
      const updated = prev.map((g) => {
        if (g.exercise_id === a.exercise_id) return { ...g, exercise_position: newPosA };
        if (g.exercise_id === b.exercise_id) return { ...g, exercise_position: newPosB };
        return g;
      });
      return updated.sort((x, y) => x.exercise_position - y.exercise_position);
    });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    AccessibilityInfo.announceForAccessibility(
      `${a.name} moved to position ${direction === "up" ? idx : idx + 2}`
    );

    // Persist position swap
    await updateExercisePositions(id, [
      { exerciseId: a.exercise_id, position: newPosA },
      { exerciseId: b.exercise_id, position: newPosB },
    ]);
  }, [id, groups]);

  const handleMoveUp = useCallback((exerciseId: string) => {
    handleMoveExercise(exerciseId, "up");
  }, [handleMoveExercise]);

  const handleMoveDown = useCallback((exerciseId: string) => {
    handleMoveExercise(exerciseId, "down");
  }, [handleMoveExercise]);

  const handlePrefillFromPrevious = useCallback(async (exerciseId: string) => {
    const group = groups.find((g) => g.exercise_id === exerciseId);
    if (!group?.previousSets) return;

    const progression = group.progressionSuggested && unit
      ? { suggested: true, weightUnit: unit, exerciseCategory: group.exerciseCategory ?? null }
      : undefined;
    const toFill = computePrefillSets(group.sets, group.previousSets, group.trackingMode, progression);
    if (toFill.length === 0) {
      const workingSets = group.sets.filter((s) => s.set_type !== "warmup");
      const allCompleted = workingSets.every((s) => s.completed);
      showToast(allCompleted ? "All sets already completed" : "Sets already have values");
      return;
    }

    // Update local state in one batch
    setGroups((prev) =>
      prev.map((g) => {
        if (g.exercise_id !== exerciseId) return g;
        return {
          ...g,
          sets: g.sets.map((s) => {
            const fill = toFill.find((f) => f.setId === s.id);
            if (!fill) return s;
            return { ...s, weight: fill.weight, reps: fill.reps, duration_seconds: fill.duration_seconds };
          }),
        };
      })
    );

    // Persist to DB
    try {
      for (const fill of toFill) {
        await updateSet(fill.setId, fill.weight, fill.reps, fill.duration_seconds);
      }
    } catch {
      showError("Failed to save prefilled values");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    showToast(`Filled ${toFill.length} set${toFill.length !== 1 ? "s" : ""} from last session`);
    AccessibilityInfo.announceForAccessibility(`Filled ${toFill.length} sets from last session`);
  }, [groups, setGroups, showToast, showError, unit]);

  const finish = () => {
    confirmAction(
      "Complete Workout?",
      `Duration: ${formatTime(elapsed)}`,
      async () => {
        await completeSession(id!);
        bumpQueryVersion("home");

        // Strava sync (non-blocking — never prevents workout completion)
        try {
          const { syncSessionToStrava } = await import("../lib/strava");
          const synced = await syncSessionToStrava(id!);
          if (synced) {
            showToast("Synced to Strava ✓");
          }
        } catch {
          showError("Strava sync failed");
        }

        // Health Connect sync (non-blocking, silent)
        if (Platform.OS === "android") {
          try {
            const { syncToHealthConnect } = await import("../lib/health-connect");
            await syncToHealthConnect(id!);
          } catch {
            // HC sync is silent
          }
        }

        try {
          const dayId = await getSessionProgramDayId(id!);
          if (dayId) {
            const day = await getProgramDayById(dayId);
            if (day) {
              const result = await advanceProgram(day.program_id, dayId, id!);
              if (result.wrapped) {
                showToast(`Cycle ${result.cycle} complete!`);
                AccessibilityInfo.announceForAccessibility(
                  `Cycle ${result.cycle} complete! Program wrapping to day 1.`
                );
                await new Promise((r) => setTimeout(r, 1500));
              } else {
                AccessibilityInfo.announceForAccessibility(
                  "Workout complete. Program advanced to next day."
                );
              }
            }
          }
        } catch {
          // Program advance failed — session already saved
        }

        const allSets = await getSessionSets(id!);
        const done = allSets.filter((s) => s.completed);
        if (done.length === 0) {
          router.replace("/(tabs)");
        } else {
          router.replace(`/session/summary/${id}`);
        }
      },
      false
    );
  };

  const cancel = () => {
    confirmAction(
      "Discard Workout?",
      "All logged sets will be lost.",
      async () => {
        await cancelSession(id!);
        bumpQueryVersion("home");
        router.back();
      },
      true
    );
  };

  return {
    elapsed,
    exerciseNotesOpen,
    exerciseNotesDraft,
    halfStep,
    nextHint,
    hintTimer,
    handleUpdate,
    handleCheck,
    handleAddSet,
    handleModeChange,
    handleRPE,
    handleHalfStep,
    handleHalfStepClear,
    handleHalfStepOpen,
    handleDelete,
    handleExerciseNotes,
    handleExerciseNotesDraftChange,
    toggleExerciseNotes,
    handleMoveUp,
    handleMoveDown,
    handlePrefillFromPrevious,
    finish,
    cancel,
  };
}
