import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import React from "react";
import { CompareView } from "../components/session/CompareView";
import { getClipsForExercise } from "../lib/media/form-clips";
import type { SetMediaRow } from "../lib/media/form-clips";

interface FindSetResult {
  exerciseId: string;
  set: object;
}

interface UseCompareFromPlayerParams {
  playerSetId: string | null;
  setPlayerSetId: (id: string | null) => void;
  setPlayerClip: (clip: SetMediaRow | null) => void;
  findSetById: (setId: string) => FindSetResult | null;
}

interface UseCompareFromPlayerResult {
  handleRequestCompare: (clipA: SetMediaRow) => void;
  getSibCount: (exerciseId: string) => number;
  renderCompareView: () => React.ReactElement | null;
}

/** Encapsulates compare-from-player wiring: state, sibling-count loading, and JSX render. */
export function useCompareFromPlayer({
  playerSetId,
  setPlayerSetId,
  setPlayerClip,
  findSetById,
}: UseCompareFromPlayerParams): UseCompareFromPlayerResult {
  const [compareClipA, setCompareClipA] = useState<SetMediaRow | null>(null);
  const [compareExerciseId, setCompareExerciseId] = useState<string | null>(null);
  const [siblingCounts, setSiblingCounts] = useState<Record<string, number>>({});

  // Load sibling clip count whenever the player opens a new set.
  useEffect(() => {
    if (!playerSetId) return;
    const found = findSetById(playerSetId);
    if (!found) return;
    getClipsForExercise(found.exerciseId)
      .then((clips) => setSiblingCounts((prev) => ({ ...prev, [found.exerciseId]: clips.length })))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerSetId]);

  const handleRequestCompare = useCallback((clipA: SetMediaRow) => {
    const found = playerSetId ? findSetById(playerSetId) : null;
    setPlayerSetId(null);
    setPlayerClip(null);
    setCompareClipA(clipA);
    setCompareExerciseId(found?.exerciseId ?? null);
  }, [playerSetId, findSetById, setPlayerSetId, setPlayerClip]);

  const closeCompare = useCallback(() => {
    setCompareClipA(null);
    setCompareExerciseId(null);
  }, []);

  const getSibCount = useCallback(
    (exerciseId: string) => siblingCounts[exerciseId] ?? 0,
    [siblingCounts],
  );

  const renderCompareView = useCallback(
    (): React.ReactElement | null =>
      Platform.OS !== "web" && compareClipA && compareExerciseId ? (
        <CompareView
          isVisible
          clipA={compareClipA}
          clipB={null}
          exerciseId={compareExerciseId}
          pickerEnabled
          pickerOpen
          onClose={closeCompare}
        />
      ) : null,
    [compareClipA, compareExerciseId, closeCompare],
  );

  return { handleRequestCompare, getSibCount, renderCompareView };
}
