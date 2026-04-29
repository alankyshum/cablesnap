import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  getExerciseById,
  getExerciseHistory,
  getExerciseRecords,
  getExerciseChartData,
  getExercise1RMChartData,
  getBodySettings,
  getBestSet,
  getVariantSetCount,
  type ExerciseSession,
  type ExerciseRecords as Records,
  type VariantScope,
} from "@/lib/db";
import type { Exercise } from "@/lib/types";

const PAGE_SIZE = 10;
const MAX_ITEMS = 50;

export { PAGE_SIZE, MAX_ITEMS };

export function useExerciseDetail(id: string | undefined) {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [unit, setUnit] = useState<"kg" | "lb">("kg");

  const [records, setRecords] = useState<Records | null>(null);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState(false);
  const [best, setBest] = useState<{ weight: number; reps: number } | null>(null);

  const [chart, setChart] = useState<{ date: number; value: number }[]>([]);
  const [chart1RM, setChart1RM] = useState<{ date: number; value: number }[]>([]);
  const [chartMode, setChartMode] = useState<"max" | "1rm">("max");
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState(false);

  const [history, setHistory] = useState<ExerciseSession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // BLD-788: per-exercise variant filter scope. Component-local; never persisted.
  // Empty object = "All variants" (default, current behavior).
  const [variantScope, setVariantScopeState] = useState<VariantScope>({});
  const [variantTotal, setVariantTotal] = useState<number>(0);

  const loadRecords = useCallback(async (eid: string, scope?: VariantScope) => {
    setRecordsLoading(true); setRecordsError(false);
    try {
      const [r, b] = await Promise.all([getExerciseRecords(eid, scope), getBestSet(eid, scope)]);
      setRecords(r);
      setBest(b);
    } catch { setRecordsError(true); }
    finally { setRecordsLoading(false); }
  }, []);

  const loadChart = useCallback(async (eid: string, scope?: VariantScope) => {
    setChartLoading(true); setChartError(false);
    try {
      const [c, c1rm] = await Promise.all([
        getExerciseChartData(eid, undefined, scope),
        getExercise1RMChartData(eid, undefined, scope),
      ]);
      setChart(c); setChart1RM(c1rm);
    }
    catch { setChartError(true); }
    finally { setChartLoading(false); }
  }, []);

  // BLD-788: load the badge count. When `scope` is non-empty, returns the
  // count for the active filter ("Showing: Rope · High (12 logged)"); when
  // empty, returns the global "any variant logged" count for the default
  // badge ("All variants (42 logged)").
  const loadVariantTotal = useCallback(async (eid: string, scope?: VariantScope) => {
    try { setVariantTotal(await getVariantSetCount(eid, scope)); }
    catch { setVariantTotal(0); }
  }, []);

  // Setter wrapper: state change + immediate reloads — event-driven so we
  // don't trigger ESLint's react-hooks/set-state-in-effect on a useEffect+setState
  // cascade. The reloads here are the user's intent, not a passive sync.
  // Both records AND chart must reload on scope change so the two cards on
  // the exercise-detail screen stay consistent (BLD-788 review feedback).
  const setVariantScope = useCallback(
    (next: VariantScope) => {
      setVariantScopeState(next);
      if (id) {
        loadRecords(id, next);
        loadChart(id, next);
        loadVariantTotal(id, next);
      }
    },
    [id, loadRecords, loadChart, loadVariantTotal]
  );

  const loadHistory = useCallback(async (eid: string) => {
    setHistoryLoading(true); setHistoryError(false);
    try { const h = await getExerciseHistory(eid, PAGE_SIZE, 0); setHistory(h); setHasMore(h.length >= PAGE_SIZE); }
    catch { setHistoryError(true); }
    finally { setHistoryLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    if (!id) return;
    getExerciseById(id).then(setExercise);
    getBodySettings().then((s) => setUnit(s.weight_unit));
    loadRecords(id, variantScope);
    loadChart(id, variantScope);
    loadHistory(id);
    // Default-state badge: count of any-variant-logged sets on this exercise.
    // Active-state badge count is updated through setVariantScope.
    loadVariantTotal(id);
    // variantScope intentionally omitted — setVariantScope handles in-screen
    // changes; focus-effect only re-runs on screen re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loadRecords, loadChart, loadHistory, loadVariantTotal]));

  const loadMore = useCallback(async () => {
    if (!id || loadingMore || !hasMore || history.length >= MAX_ITEMS) return;
    setLoadingMore(true);
    try {
      const more = await getExerciseHistory(id, PAGE_SIZE, history.length);
      setHistory((prev) => [...prev, ...more]);
      setHasMore(more.length >= PAGE_SIZE && history.length + more.length < MAX_ITEMS);
    } catch { /* silent */ }
    finally { setLoadingMore(false); }
  }, [id, loadingMore, hasMore, history.length]);

  const bw = records?.is_bodyweight ?? false;
  const activeChart = bw || chartMode === "max" ? chart : chart1RM;

  return {
    exercise, unit, records, recordsLoading, recordsError, best,
    chart, chart1RM, chartMode, setChartMode, chartLoading, chartError,
    history, historyLoading, historyError, loadingMore, hasMore,
    loadRecords, loadChart, loadHistory, loadMore,
    bw, activeChart,
    variantScope, setVariantScope, variantTotal,
  };
}
