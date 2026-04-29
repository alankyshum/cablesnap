import { useCallback, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import * as Haptics from "expo-haptics";
import { updateSetBodyweightVariant } from "@/lib/db/session-sets";
import { queryClient } from "@/lib/query";
import type { ExerciseGroup, SetWithMeta } from "@/components/session/types";
import type { GripType, GripWidth } from "@/lib/types";

type Patch = Partial<SetWithMeta>;

type UseBodyweightGripPickerSheetArgs = {
  groups: ExerciseGroup[];
  updateGroupSet: (setId: string, patch: Patch) => void;
  showError: (msg: string) => void;
};

/**
 * BLD-822: orchestrates the bodyweight grip picker bottom sheet for the
 * session screen. Sibling of `useVariantPickerSheet` (BLD-771); intentionally
 * NOT a parameterization of it (PLAN-BLD-768.md "Hook Decision").
 *
 * Encapsulates open/clear/save callbacks (DB persistence via the SAME
 * `updateSetBodyweightVariant` entry point that autofill in
 * `useSessionActions.handleAddSet` will use, optimistic local update via
 * `updateGroupSet`, and the
 * ['bodyweight-grip-history', exerciseId] cache invalidation path).
 *
 * **QD-10 invariant — focus-return-isolation:** this hook MUST own its own
 * `returnFocusHandleRef` (`useRef`), independent of `useVariantPickerSheet`'s
 * ref. Sharing across hooks would cause the cable picker's dismiss to refocus
 * a bodyweight footer (or vice-versa) when both rows are present in the same
 * render tree (e.g. cable Pulldown + bodyweight Pull-Up in the same session).
 * Test: `__tests__/hooks/grip-picker-focus-isolation.test.tsx` mounts both
 * SetRows in the SAME render tree inside a single `it()` to catch shared-
 * state bugs (TL-N2 fixture-shape requirement).
 */
export function useBodyweightGripPickerSheet({
  groups,
  updateGroupSet,
  showError,
}: UseBodyweightGripPickerSheetArgs) {
  const [setId, setPendingSetId] = useState<string | null>(null);
  // QD-10 / reviewer blocker #4 (mirrored from BLD-771): hook-local ref so the
  // bodyweight grip picker never shares focus state with the cable picker.
  const returnFocusHandleRef = useRef<number | null>(null);

  const findExerciseIdForSet = useCallback((id: string): string | null => {
    for (const g of groups) {
      if (g.sets.some((s) => s.id === id)) return g.exercise_id;
    }
    return null;
  }, [groups]);

  const invalidateHistoryCache = useCallback((exerciseId: string | null) => {
    if (!exerciseId) return;
    queryClient.invalidateQueries({
      queryKey: ["bodyweight-grip-history", exerciseId],
    });
  }, []);

  const handleOpen = useCallback((id: string, returnFocusHandle: number | null = null) => {
    returnFocusHandleRef.current = returnFocusHandle;
    setPendingSetId(id);
  }, []);

  const restoreFocus = useCallback(() => {
    // setAccessibilityFocus is a no-op when no screen reader is active, so
    // it's safe to call unconditionally. setTimeout so the sheet's exit
    // animation finishes before the platform attempts to move focus.
    const handle = returnFocusHandleRef.current;
    returnFocusHandleRef.current = null;
    if (handle == null) return;
    setTimeout(() => {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }, 100);
  }, []);

  const handleClose = useCallback(() => {
    setPendingSetId(null);
    restoreFocus();
  }, [restoreFocus]);

  const handleClear = useCallback(async (id: string) => {
    try {
      // Long-press from the grip footer: write NULL/NULL through the SAME
      // entry point as the picker's Clear action. Passing `null` clears;
      // passing `undefined` would leave them untouched (per
      // updateSetBodyweightVariant's 3-way contract).
      await updateSetBodyweightVariant(id, null, null);
      updateGroupSet(id, { grip_type: null, grip_width: null });
      invalidateHistoryCache(findExerciseIdForSet(id));
      Haptics.selectionAsync().catch(() => {});
    } catch (err) {
      showError((err as Error).message);
    }
  }, [updateGroupSet, showError, findExerciseIdForSet, invalidateHistoryCache]);

  const handleConfirm = useCallback(async (next: {
    gripType: GripType | null;
    gripWidth: GripWidth | null;
  }) => {
    if (!setId) {
      setPendingSetId(null);
      restoreFocus();
      return;
    }
    try {
      await updateSetBodyweightVariant(setId, next.gripType, next.gripWidth);
      updateGroupSet(setId, {
        grip_type: next.gripType,
        grip_width: next.gripWidth,
      });
      invalidateHistoryCache(findExerciseIdForSet(setId));
      setPendingSetId(null);
      restoreFocus();
    } catch (err) {
      showError((err as Error).message);
    }
  }, [setId, updateGroupSet, showError, findExerciseIdForSet, invalidateHistoryCache, restoreFocus]);

  // Pre-populate the sheet with whatever is on the set right now — `null` if
  // never set. Computed inline (no useMemo) because the work is trivial and
  // the values flow into the picker only while it's mounted (sheet remounts
  // its body on each open per the BLD-771 picker contract, mirrored here).
  let initialGripType: GripType | null = null;
  let initialGripWidth: GripWidth | null = null;
  let initialSetNumber: number | undefined = undefined;
  if (setId) {
    for (const g of groups) {
      const s = g.sets.find((x) => x.id === setId);
      if (s) {
        initialGripType = s.grip_type ?? null;
        initialGripWidth = s.grip_width ?? null;
        initialSetNumber = s.set_number;
        break;
      }
    }
  }
  const initialValues = {
    gripType: initialGripType,
    gripWidth: initialGripWidth,
    setNumber: initialSetNumber,
  };

  return {
    isVisible: setId !== null,
    setId,
    handleOpen,
    handleClose,
    handleClear,
    handleConfirm,
    initialValues,
  };
}
