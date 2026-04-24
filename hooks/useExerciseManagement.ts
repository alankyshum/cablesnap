/* eslint-disable react-hooks/preserve-manual-memoization, react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import BottomSheet from "@gorhom/bottom-sheet";
import { useToast } from "@/components/ui/bna-toast";
import {
  addSet,
  deleteSetsBatch,
  getExerciseById,
  swapExerciseInSession,
  undoSwapInSession,
} from "../lib/db";
import type { Exercise } from "../lib/types";
import type { ExerciseGroup } from "../components/session/types";

type UseExerciseManagementArgs = {
  id: string | undefined;
  groups: ExerciseGroup[];
  setGroups: React.Dispatch<React.SetStateAction<ExerciseGroup[]>>;
  load: () => Promise<void>;
  startRest: (exerciseId: string) => Promise<void>;
  dismissRest: () => void;
};

export function useExerciseManagement({
  id, groups, setGroups, load, startRest, dismissRest,
}: UseExerciseManagementArgs) {
  const { info: showToast, error: showError, warning: showWarning } = useToast();

  // --- Exercise detail ---
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);
  const detailSheetRef = useRef<BottomSheet>(null);

  const handleShowDetail = useCallback(async (exerciseId: string) => {
    const ex = await getExerciseById(exerciseId);
    setDetailExercise(ex);
    detailSheetRef.current?.snapToIndex(0);
  }, []);

  // --- Substitution ---
  const [swapSource, setSwapSource] = useState<Exercise | null>(null);
  const swapSheetRef = useRef<BottomSheet>(null);
  const swapUndoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swapUndoRef = useRef<{ setIds: string[]; originalExerciseId: string } | null>(null);

  const handleSwapOpen = useCallback(async (exerciseId: string) => {
    const group = groups.find((g) => g.exercise_id === exerciseId);
    if (group && group.sets.every((s) => s.completed)) {
      showWarning("All sets completed — nothing to swap");
      return;
    }
    const ex = await getExerciseById(exerciseId);
    if (!ex) return;
    setSwapSource(ex);
    swapSheetRef.current?.snapToIndex(0);
  }, [groups]);

  const handleSwapUndo = useCallback(async () => {
    if (!swapUndoRef.current) return;
    try {
      await undoSwapInSession(swapUndoRef.current.setIds, swapUndoRef.current.originalExerciseId);
      swapUndoRef.current = null;
      if (swapUndoTimer.current) {
        clearTimeout(swapUndoTimer.current);
        swapUndoTimer.current = null;
      }
      await load();
    } catch {
      showError("Failed to undo swap");
    }
  }, [load]);

  const handleSwapSelect = useCallback(async (newExercise: Exercise) => {
    if (!id || !swapSource) return;
    try {
      const modifiedIds = await swapExerciseInSession(id, swapSource.id, newExercise.id);
      if (modifiedIds.length === 0) {
        showWarning("All sets completed — nothing to swap");
        setSwapSource(null);
        return;
      }
      const originalId = swapSource.id;
      setSwapSource(null);
      await load();

      startRest(newExercise.id);

      swapUndoRef.current = { setIds: modifiedIds, originalExerciseId: originalId };

      if (swapUndoTimer.current) clearTimeout(swapUndoTimer.current);
      showToast(`Swapped to ${newExercise.name}`, { action: { label: "Undo", onPress: handleSwapUndo } });
      swapUndoTimer.current = setTimeout(() => {
        swapUndoTimer.current = null;
        swapUndoRef.current = null;
      }, 5000);
    } catch {
      showError("Failed to swap exercise");
    }
  }, [id, swapSource, load, startRest, handleSwapUndo]);

  // --- Exercise picker ---
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleAddExercise = useCallback(() => {
    setPickerOpen(true);
  }, []);

  const handlePickExercise = useCallback(async (exercise: { id: string }) => {
    if (!id) return;
    setPickerOpen(false);
    for (let i = 1; i <= 3; i++) {
      await addSet(id, exercise.id, i);
    }
    await load();
  }, [id, load]);

  // --- Long-press exercise delete with countdown ---
  const deleteExerciseRef = useRef<{ exerciseId: string; setIds: string[]; removedGroup: ExerciseGroup; originalIndex: number } | null>(null);
  const deleteExerciseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteCountdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const commitPendingDelete = useCallback(async () => {
    if (!deleteExerciseRef.current) return;
    const { setIds } = deleteExerciseRef.current;
    deleteExerciseRef.current = null;
    if (deleteExerciseTimer.current) {
      clearTimeout(deleteExerciseTimer.current);
      deleteExerciseTimer.current = null;
    }
    if (deleteCountdownInterval.current) {
      clearInterval(deleteCountdownInterval.current);
      deleteCountdownInterval.current = null;
    }
    try {
      await deleteSetsBatch(setIds);
    } catch {
      // Best-effort: pending delete failed but UI already moved on
    }
  }, []);

  const handleDeleteExerciseUndo = useCallback(() => {
    if (!deleteExerciseRef.current) return;
    const { removedGroup, originalIndex } = deleteExerciseRef.current;
    setGroups((prev) => {
      const exists = prev.some((g) => g.exercise_id === removedGroup.exercise_id);
      if (exists) return prev;
      const next = [...prev];
      next.splice(Math.min(originalIndex, next.length), 0, removedGroup);
      return next;
    });
    deleteExerciseRef.current = null;
    if (deleteExerciseTimer.current) {
      clearTimeout(deleteExerciseTimer.current);
      deleteExerciseTimer.current = null;
    }
    if (deleteCountdownInterval.current) {
      clearInterval(deleteCountdownInterval.current);
      deleteCountdownInterval.current = null;
    }
  }, []);

  const handleDeleteExercise = useCallback((exerciseId: string) => {
    const groupIndex = groups.findIndex((g) => g.exercise_id === exerciseId);
    if (groupIndex === -1) return;
    const group = groups[groupIndex];

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const setIds = group.sets.map((s) => s.id);

    commitPendingDelete();

    setGroups((prev) => prev.filter((g) => g.exercise_id !== exerciseId));

    dismissRest();

    deleteExerciseRef.current = { exerciseId, setIds, removedGroup: group, originalIndex: groupIndex };

    let remaining = 5;
    showToast(`Removing ${group.name}... (5s)`, { action: { label: "UNDO", onPress: handleDeleteExerciseUndo } });

    deleteCountdownInterval.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (deleteCountdownInterval.current) {
          clearInterval(deleteCountdownInterval.current);
          deleteCountdownInterval.current = null;
        }
      } else {
        showToast(`Removing ${group.name}... (${remaining}s)`);
      }
    }, 1000);

    deleteExerciseTimer.current = setTimeout(async () => {
      deleteExerciseTimer.current = null;
      deleteExerciseRef.current = null;
      if (deleteCountdownInterval.current) {
        clearInterval(deleteCountdownInterval.current);
        deleteCountdownInterval.current = null;
      }
      try {
        await deleteSetsBatch(setIds);
      } catch {
        setGroups((prev) => {
          const exists = prev.some((g) => g.exercise_id === group.exercise_id);
          if (exists) return prev;
          const next = [...prev];
          next.splice(Math.min(groupIndex, next.length), 0, group as ExerciseGroup);
          return next;
        });
        showError('Failed to delete exercise. Restored.');
      }
    }, 5000);
  }, [groups, dismissRest, handleDeleteExerciseUndo, commitPendingDelete]);

  // Cleanup refs on unmount
  const cleanupRefs = {
    swapUndoTimer,
    deleteExerciseTimer,
    deleteCountdownInterval,
  };

  // BLD-577 battery fix: the three timer refs above (swap undo, pending
  // delete commit, delete countdown) were previously only cleared on the
  // user-driven paths (undo, commit, next delete). If the session screen
  // unmounts with one of them live — e.g. the user backs out of the
  // session within the 5-second delete window — the setInterval / setTimeout
  // keeps running in the background and eventually runs against a stale
  // closure (`setGroups` on an unmounted component). This hook-level
  // unmount effect guarantees they're always released.
  useEffect(() => {
    return () => {
      if (swapUndoTimer.current) {
        clearTimeout(swapUndoTimer.current);
        swapUndoTimer.current = null;
      }
      if (deleteExerciseTimer.current) {
        clearTimeout(deleteExerciseTimer.current);
        deleteExerciseTimer.current = null;
      }
      if (deleteCountdownInterval.current) {
        clearInterval(deleteCountdownInterval.current);
        deleteCountdownInterval.current = null;
      }
    };
  }, []);

  return {
    detailExercise,
    setDetailExercise,
    detailSheetRef,
    handleShowDetail,
    swapSource,
    setSwapSource,
    swapSheetRef,
    handleSwapOpen,
    handleSwapSelect,
    pickerOpen,
    setPickerOpen,
    handleAddExercise,
    handlePickExercise,
    handleDeleteExercise,
    cleanupRefs,
  };
}
