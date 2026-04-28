import { useCallback, useState } from "react";
import * as Haptics from "expo-haptics";
import { updateSetVariant } from "@/lib/db/session-sets";
import { queryClient } from "@/lib/query";
import type { ExerciseGroup, SetWithMeta } from "@/components/session/types";
import type { Attachment, MountPosition } from "@/lib/types";

type Patch = Partial<SetWithMeta>;

type UseVariantPickerSheetArgs = {
  groups: ExerciseGroup[];
  updateGroupSet: (setId: string, patch: Patch) => void;
  showError: (msg: string) => void;
};

/**
 * BLD-771: orchestrates the cable variant picker bottom sheet for the session
 * screen. Encapsulates the open/clear/save callbacks (DB persistence,
 * optimistic local update, and the ['variant-history', exerciseId] cache
 * invalidation path) and the initial values used to prefill the sheet.
 *
 * Mirrors `useBodyweightModifierSheet` (BLD-541). Both hooks invalidate
 * their respective autofill cache keys on every write so the next add-set
 * autofill reflects just-written values (closes a class of stale-cache bugs
 * that hit BLD-541 in review).
 *
 * Per-set writes route through `updateSetVariant` — the SAME entry point
 * `handleAddSet` uses for autofill (hooks/useSessionActions.ts:466). Single
 * write path → uniform silent-default-trap closure (QD-B2).
 */
export function useVariantPickerSheet({
  groups,
  updateGroupSet,
  showError,
}: UseVariantPickerSheetArgs) {
  const [setId, setPendingSetId] = useState<string | null>(null);

  const findExerciseIdForSet = useCallback((id: string): string | null => {
    for (const g of groups) {
      if (g.sets.some((s) => s.id === id)) return g.exercise_id;
    }
    return null;
  }, [groups]);

  const invalidateHistoryCache = useCallback((exerciseId: string | null) => {
    if (!exerciseId) return;
    queryClient.invalidateQueries({
      queryKey: ["variant-history", exerciseId],
    });
  }, []);

  const handleOpen = useCallback((id: string) => {
    setPendingSetId(id);
  }, []);

  const handleClose = useCallback(() => {
    setPendingSetId(null);
  }, []);

  const handleClear = useCallback(async (id: string) => {
    try {
      // Long-press from the chip footer: write NULL/NULL through the SAME
      // entry point as the picker's Clear action. updateSetVariant accepts
      // null for both args; passing undefined would leave them untouched.
      await updateSetVariant(id, null, null);
      updateGroupSet(id, { attachment: null, mount_position: null });
      invalidateHistoryCache(findExerciseIdForSet(id));
      Haptics.selectionAsync().catch(() => {});
    } catch (err) {
      showError((err as Error).message);
    }
  }, [updateGroupSet, showError, findExerciseIdForSet, invalidateHistoryCache]);

  const handleConfirm = useCallback(async (next: {
    attachment: Attachment | null;
    mount: MountPosition | null;
  }) => {
    if (!setId) {
      setPendingSetId(null);
      return;
    }
    try {
      await updateSetVariant(setId, next.attachment, next.mount);
      updateGroupSet(setId, {
        attachment: next.attachment,
        mount_position: next.mount,
      });
      invalidateHistoryCache(findExerciseIdForSet(setId));
      setPendingSetId(null);
    } catch (err) {
      showError((err as Error).message);
    }
  }, [setId, updateGroupSet, showError, findExerciseIdForSet, invalidateHistoryCache]);

  // Pre-populate the sheet with whatever is on the set right now — `null` if
  // never set. Computed inline (no useMemo) because the work is trivial and
  // the values flow into the picker only while it's mounted (sheet remounts
  // its body on each open per the BLD-771 picker contract).
  let initialAttachment: Attachment | null = null;
  let initialMount: MountPosition | null = null;
  let initialSetNumber: number | undefined = undefined;
  if (setId) {
    for (const g of groups) {
      const s = g.sets.find((x) => x.id === setId);
      if (s) {
        initialAttachment = s.attachment ?? null;
        initialMount = s.mount_position ?? null;
        initialSetNumber = s.set_number;
        break;
      }
    }
  }
  const initialValues = {
    attachment: initialAttachment,
    mount: initialMount,
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
