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
  type ExerciseSession,
  type ExerciseRecords as Records,
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

  const loadRecords = useCallback(async (eid: string) => {
    setRecordsLoading(true); setRecordsError(false);
    try { const [r, b] = await Promise.all([getExerciseRecords(eid), getBestSet(eid)]); setRecords(r); setBest(b); }
    catch { setRecordsError(true); }
    finally { setRecordsLoading(false); }
  }, []);

  const loadChart = useCallback(async (eid: string) => {
    setChartLoading(true); setChartError(false);
    try { const [c, c1rm] = await Promise.all([getExerciseChartData(eid), getExercise1RMChartData(eid)]); setChart(c); setChart1RM(c1rm); }
    catch { setChartError(true); }
    finally { setChartLoading(false); }
  }, []);

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
    loadRecords(id); loadChart(id); loadHistory(id);
  }, [id, loadRecords, loadChart, loadHistory]));

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
  };
}
