import { useCallback, useMemo, useRef, useState } from "react";
import type BottomSheet from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import {
  updateSetBodyweightModifier,
  normalizeBodyweightModifier,
} from "@/lib/db/session-sets";
import { queryClient } from "@/lib/query";
import type { ExerciseGroup, SetWithMeta } from "@/components/session/types";

type Patch = Partial<SetWithMeta>;

type UseBodyweightModifierSheetArgs = {
  groups: ExerciseGroup[];
  updateGroupSet: (setId: string, patch: Patch) => void;
  showError: (msg: string) => void;
};

/**
 * BLD-541: orchestrates the bodyweight-modifier bottom sheet for the session
 * screen. Encapsulates the ref, the pending-set id, the open/clear/save
 * callbacks (including DB persistence, optimistic local update, and the
 * ['bw-modifier-default', exerciseId] cache invalidation path — AC-26), and
 * the initial-value memo used to prefill the sheet on re-open.
 *
 * Extracted from app/session/[id].tsx to keep the session main file under
 * the FTA decomposition ceiling.
 */
export function useBodyweightModifierSheet({
  groups,
  updateGroupSet,
  showError,
}: UseBodyweightModifierSheetArgs) {
  const sheetRef = useRef<BottomSheet>(null);
  const [setId, setPendingSetId] = useState<string | null>(null);

  const findExerciseIdForSet = useCallback((id: string): string | null => {
    for (const g of groups) {
      if (g.sets.some((s) => s.id === id)) return g.exercise_id;
    }
    return null;
  }, [groups]);

  const invalidateDefaultCache = useCallback((exerciseId: string | null) => {
    if (!exerciseId) return;
    queryClient.invalidateQueries({
      queryKey: ["bw-modifier-default", exerciseId],
    });
  }, []);

  const handleOpen = useCallback((id: string) => {
    setPendingSetId(id);
    sheetRef.current?.snapToIndex(0);
  }, []);

  const handleClear = useCallback(async (id: string) => {
    try {
      await updateSetBodyweightModifier(id, null);
      updateGroupSet(id, { bodyweight_modifier_kg: null });
      invalidateDefaultCache(findExerciseIdForSet(id));
      Haptics.selectionAsync().catch(() => {});
    } catch (err) {
      showError((err as Error).message);
    }
  }, [updateGroupSet, showError, findExerciseIdForSet, invalidateDefaultCache]);

  const handleSave = useCallback(async (modifierKg: number | null) => {
    if (!setId) {
      sheetRef.current?.close();
      return;
    }
    const normalized = normalizeBodyweightModifier(modifierKg);
    try {
      await updateSetBodyweightModifier(setId, normalized);
      updateGroupSet(setId, { bodyweight_modifier_kg: normalized });
      invalidateDefaultCache(findExerciseIdForSet(setId));
      sheetRef.current?.close();
    } catch (err) {
      showError((err as Error).message);
    }
  }, [setId, updateGroupSet, showError, findExerciseIdForSet, invalidateDefaultCache]);

  const handleDismiss = useCallback(() => {
    setPendingSetId(null);
  }, []);

  const initialModifierKg = useMemo(() => {
    if (!setId) return null;
    for (const g of groups) {
      const s = g.sets.find((x) => x.id === setId);
      if (s) return s.bodyweight_modifier_kg ?? null;
    }
    return null;
  }, [setId, groups]);

  return {
    sheetRef,
    handleOpen,
    handleClear,
    handleSave,
    handleDismiss,
    initialModifierKg,
  };
}
