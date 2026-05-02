import { useReducer } from "react";
import type { DatePreset, HistoryFilters } from "@/lib/db";

/**
 * useHistoryFilters — single-select filter state machine for the history
 * screen (BLD-938).
 *
 * State shape mirrors `HistoryFilters` from `lib/db`. The chip's display
 * label for `templateId` is resolved by the caller against a cached
 * `getTemplatesWithSessions` lookup so it auto-updates on rename.
 *
 * The reducer is intentionally pure for unit-testability — see
 * `__tests__/hooks/useHistoryFilters.test.ts`.
 */

export type HistoryFilterKey = "templateId" | "muscleGroup" | "datePreset";

export type HistoryFiltersAction =
  | { type: "SET_TEMPLATE"; templateId: string | null }
  | { type: "SET_MUSCLE_GROUP"; muscleGroup: string | null }
  | { type: "SET_DATE_PRESET"; datePreset: DatePreset | null }
  | { type: "CLEAR_ONE"; key: HistoryFilterKey }
  | { type: "CLEAR_ALL" };

export const INITIAL_HISTORY_FILTERS: HistoryFilters = {
  templateId: null,
  muscleGroup: null,
  datePreset: null,
};

export function historyFiltersReducer(
  state: HistoryFilters,
  action: HistoryFiltersAction
): HistoryFilters {
  switch (action.type) {
    case "SET_TEMPLATE":
      if (state.templateId === action.templateId) return state;
      return { ...state, templateId: action.templateId };
    case "SET_MUSCLE_GROUP":
      if (state.muscleGroup === action.muscleGroup) return state;
      return { ...state, muscleGroup: action.muscleGroup };
    case "SET_DATE_PRESET":
      if (state.datePreset === action.datePreset) return state;
      return { ...state, datePreset: action.datePreset };
    case "CLEAR_ONE":
      if (state[action.key] === null) return state;
      return { ...state, [action.key]: null };
    case "CLEAR_ALL":
      if (
        state.templateId === null &&
        state.muscleGroup === null &&
        state.datePreset === null
      ) {
        return state;
      }
      return { ...INITIAL_HISTORY_FILTERS };
    default:
      return state;
  }
}

export function isAnyFilterActive(state: HistoryFilters): boolean {
  return (
    state.templateId !== null ||
    state.muscleGroup !== null ||
    state.datePreset !== null
  );
}

export function useHistoryFilters() {
  const [filters, dispatch] = useReducer(
    historyFiltersReducer,
    INITIAL_HISTORY_FILTERS
  );

  return {
    filters,
    setTemplate: (templateId: string | null) =>
      dispatch({ type: "SET_TEMPLATE", templateId }),
    setMuscleGroup: (muscleGroup: string | null) =>
      dispatch({ type: "SET_MUSCLE_GROUP", muscleGroup }),
    setDatePreset: (datePreset: DatePreset | null) =>
      dispatch({ type: "SET_DATE_PRESET", datePreset }),
    clearOne: (key: HistoryFilterKey) => dispatch({ type: "CLEAR_ONE", key }),
    clearAll: () => dispatch({ type: "CLEAR_ALL" }),
    anyActive: isAnyFilterActive(filters),
  };
}
