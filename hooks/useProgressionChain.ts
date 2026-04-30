import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  getProgressionChain,
  getProgressionSuggestion,
  type ProgressionChainExercise,
  type ProgressionSuggestion,
} from "@/lib/db";

export type ProgressionChainState = {
  chain: ProgressionChainExercise[];
  suggestion: ProgressionSuggestion | null;
  loading: boolean;
};

/**
 * BLD-913: Fetches the progression chain and suggestion state for an exercise.
 * Returns empty chain if exercise is not in a progression group.
 */
export function useProgressionChain(exerciseId: string | undefined): ProgressionChainState {
  const [chain, setChain] = useState<ProgressionChainExercise[]>([]);
  const [suggestion, setSuggestion] = useState<ProgressionSuggestion | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!exerciseId) {
        setLoading(false);
        return;
      }

      let cancelled = false;
      setLoading(true);

      (async () => {
        try {
          const chainData = await getProgressionChain(exerciseId);
          if (cancelled) return;
          setChain(chainData);

          if (chainData.length > 0) {
            const suggestionData = await getProgressionSuggestion(exerciseId, chainData);
            if (cancelled) return;
            setSuggestion(suggestionData);
          } else {
            setSuggestion(null);
          }
        } catch {
          // Silent failure — progression is supplementary UI
          if (!cancelled) {
            setChain([]);
            setSuggestion(null);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [exerciseId])
  );

  return { chain, suggestion, loading };
}
