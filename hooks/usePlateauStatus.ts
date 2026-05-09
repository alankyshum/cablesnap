/**
 * BLD-1122: Per-exercise plateau status hook (detail screen only).
 *
 * React Query hook keyed ['plateau', exerciseId].
 * Fetches the single-exercise plateau window, reads the consolidated
 * plateau_state blob, runs classifyPlateau (pure), and owns dismissal
 * lifecycle + GC of progressing entries.
 *
 * staleTime: 5 min. Invalidation key prefix: ['plateau'].
 */
import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  classifyPlateau,
  type PlateauResult,
  type BreakThroughSuggestion,
  DISMISSAL_DURATION_MS,
} from "../lib/plateau";
import { getPlateauWindow } from "../lib/db/exercise-history";
import {
  getPlateauState,
  dismissPlateau,
  queuePlateauPending,
  clearPlateauEntries,
} from "../lib/db/settings";
import { getBodySettings } from "../lib/db";

export type PlateauStatusResult = {
  result: PlateauResult | null;
  dismissedUntil: Date | null;
  isLoading: boolean;
  onDismiss: () => Promise<void>;
  onQueuePending: (suggestion: BreakThroughSuggestion) => Promise<void>;
};

const STALE_TIME_MS = 5 * 60 * 1000; // 5 minutes

async function loadPlateauStatus(exerciseId: string): Promise<{
  result: PlateauResult | null;
  dismissedUntil: Date | null;
}> {
  const [sessions, bodySettings, plateauState] = await Promise.all([
    getPlateauWindow(exerciseId, 4),
    getBodySettings(),
    getPlateauState(),
  ]);

  if (sessions.length < 3) {
    return { result: null, dismissedUntil: null };
  }

  const step = bodySettings.weight_unit === "lb" ? 5 : 2.5;
  // Determine bodyweight: all sessions have null/0 top-set weight
  const isBodyweight = sessions.every(
    (s) => s.top_set_weight == null || s.top_set_weight === 0,
  );
  const plateauResult = classifyPlateau(sessions, isBodyweight, step, bodySettings.weight_unit);

  // Check dismissal
  const dismissal = plateauState.dismissals[exerciseId];
  let dismissedUntil: Date | null = null;
  if (dismissal) {
    const ts = new Date(dismissal.dismissed_at).getTime();
    if (!isNaN(ts) && Date.now() - ts < DISMISSAL_DURATION_MS) {
      dismissedUntil = new Date(ts + DISMISSAL_DURATION_MS);
    }
  }

  return { result: plateauResult, dismissedUntil };
}

export function usePlateauStatus(exerciseId: string | undefined): PlateauStatusResult {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["plateau", exerciseId],
    queryFn: () => (exerciseId ? loadPlateauStatus(exerciseId) : Promise.resolve({ result: null, dismissedUntil: null })),
    enabled: exerciseId != null,
    staleTime: STALE_TIME_MS,
  });

  const onDismiss = useCallback(async () => {
    if (!exerciseId) return;
    await dismissPlateau(exerciseId);
    queryClient.invalidateQueries({ queryKey: ["plateau"] });
  }, [exerciseId, queryClient]);

  const onQueuePending = useCallback(async (suggestion: BreakThroughSuggestion) => {
    if (!exerciseId) return;
    if (suggestion.kind === "form_check") return;
    await queuePlateauPending(exerciseId, {
      weight: suggestion.weight,
      reps: suggestion.reps,
      kind: suggestion.kind,
      queued_at: new Date().toISOString(),
    });
    queryClient.invalidateQueries({ queryKey: ["plateau"] });
  }, [exerciseId, queryClient]);

  const result = data?.result ?? null;

  // GC: clear dismissal + pending once when classification becomes "progressing".
  // Guard with a ref so we don't fire repeatedly while the query re-fetches.
  const gcFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (result?.classification === "progressing" && exerciseId && gcFiredRef.current !== exerciseId) {
      gcFiredRef.current = exerciseId;
      clearPlateauEntries(exerciseId).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["plateau", exerciseId] });
    } else if (result?.classification !== "progressing") {
      gcFiredRef.current = null;
    }
  }, [result?.classification, exerciseId, queryClient]);

  return {
    result,
    dismissedUntil: data?.dismissedUntil ?? null,
    isLoading,
    onDismiss,
    onQueuePending,
  };
}
