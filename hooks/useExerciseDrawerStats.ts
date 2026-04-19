import { useEffect, useReducer } from "react";
import {
  getExerciseRecords,
  getBestSet,
  getExerciseHistory,
  type ExerciseRecords,
  type ExerciseSession,
} from "@/lib/db/exercise-history";

export type ExerciseDrawerStats = {
  records: ExerciseRecords | null;
  bestSet: { weight: number; reps: number } | null;
  lastSession: ExerciseSession | null;
  loading: boolean;
  error: boolean;
};

type State = {
  data: {
    records: ExerciseRecords;
    bestSet: { weight: number; reps: number } | null;
    lastSession: ExerciseSession | null;
  } | null;
  fetchedId: string | null;
  pending: boolean;
  error: boolean;
};

type Action =
  | { type: "fetch"; id: string }
  | { type: "success"; id: string; records: ExerciseRecords; bestSet: { weight: number; reps: number } | null; lastSession: ExerciseSession | null }
  | { type: "failure"; id: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "fetch":
      return { ...state, pending: true, error: false };
    case "success":
      return {
        data: { records: action.records, bestSet: action.bestSet, lastSession: action.lastSession },
        fetchedId: action.id,
        pending: false,
        error: false,
      };
    case "failure":
      return { data: null, fetchedId: action.id, pending: false, error: true };
  }
}

const INITIAL_STATE: State = { data: null, fetchedId: null, pending: false, error: false };

export function useExerciseDrawerStats(
  exerciseId: string | null
): ExerciseDrawerStats {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  useEffect(() => {
    if (!exerciseId) return;

    let cancelled = false;
    dispatch({ type: "fetch", id: exerciseId });

    Promise.all([
      getExerciseRecords(exerciseId),
      getBestSet(exerciseId),
      getExerciseHistory(exerciseId, 1, 0),
    ])
      .then(([r, b, h]) => {
        if (cancelled) return;
        dispatch({
          type: "success",
          id: exerciseId,
          records: r,
          bestSet: b,
          lastSession: h.length > 0 ? h[0] : null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        dispatch({ type: "failure", id: exerciseId });
      });

    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

  // If exerciseId is null or doesn't match last fetched, return empty
  if (!exerciseId || state.fetchedId !== exerciseId) {
    return {
      records: null,
      bestSet: null,
      lastSession: null,
      loading: !!exerciseId && state.pending,
      error: false,
    };
  }

  return {
    records: state.data?.records ?? null,
    bestSet: state.data?.bestSet ?? null,
    lastSession: state.data?.lastSession ?? null,
    loading: state.pending,
    error: state.error,
  };
}
