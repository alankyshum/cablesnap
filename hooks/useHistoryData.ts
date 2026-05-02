import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import {
  useSharedValue,
  useReducedMotion,
  withTiming,
  useAnimatedStyle,
} from "react-native-reanimated";
import { Gesture } from "react-native-gesture-handler";
import { useFocusEffect } from "expo-router";
import {
  getAllCompletedSessionWeeks,
  getRecentSessions,
  getSessionCountsByDay,
  getSessionsByMonth,
  getTotalSessionCount,
  searchSessions,
  getTemplatesWithSessions,
  getMuscleGroupsWithSessions,
  getFilteredSessions,
  type TemplateOption,
  type DatePreset,
} from "@/lib/db";
import { getSchedule, type ScheduleEntry } from "@/lib/db/settings";
import type { WorkoutSession } from "@/lib/types";
import {
  computeLongestStreak,
  computeStreak,
  formatDateKey,
} from "@/lib/format";
import { duration as animDuration } from "@/constants/design-tokens";
import { useLayout } from "@/lib/layout";
import { View } from "react-native";
import { useHistoryFilters, type HistoryFilterKey } from "@/hooks/useHistoryFilters";

export type SessionRow = WorkoutSession & { set_count: number };

export function weekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

const SWIPE_THRESHOLD = 20;

export function useHistoryData() {
  const layout = useLayout();
  const reducedMotion = useReducedMotion();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SessionRow[] | null>(null);
  const [hasAny, setHasAny] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const dayDetailRef = useRef<View>(null);
  const selectedCellRef = useRef<View>(null);
  const prevSelected = useRef<string | null>(null);

  const translateX = useSharedValue(0);
  const animatedCalendarStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const [heatmapData, setHeatmapData] = useState<Map<string, number>>(new Map());
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [heatmapError, setHeatmapError] = useState(false);
  const [heatmapExpanded, setHeatmapExpanded] = useState(true);

  // BLD-938: history filters (template / muscle group / date range)
  const filterState = useHistoryFilters();
  const [templateOptions, setTemplateOptions] = useState<TemplateOption[]>([]);
  const [muscleGroupOptions, setMuscleGroupOptions] = useState<string[]>([]);
  const [filteredRows, setFilteredRows] = useState<SessionRow[]>([]);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [filterLoading, setFilterLoading] = useState(false);
  const [filterPage, setFilterPage] = useState(0);
  const filterFetchSeqRef = useRef(0);
  const FILTER_PAGE_SIZE = 20;

  const useFilterMode = filterState.anyActive;

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReaderEnabled);
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotionEnabled);
    const srSub = AccessibilityInfo.addEventListener("screenReaderChanged", setScreenReaderEnabled);
    const rmSub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotionEnabled);
    return () => { srSub.remove(); rmSub.remove(); if (timer.current) clearTimeout(timer.current); };
  }, []);

  useEffect(() => {
    if (selected && selected !== prevSelected.current) {
      setTimeout(() => { dayDetailRef.current?.focus?.(); }, 100);
    } else if (!selected && prevSelected.current) {
      setTimeout(() => { selectedCellRef.current?.focus?.(); }, 100);
    }
    prevSelected.current = selected;
  }, [selected]);

  const load = useCallback(async () => {
    const [data, any] = await Promise.all([getSessionsByMonth(year, month), getRecentSessions(1)]);
    setSessions(data);
    setHasAny(any.length > 0);
  }, [year, month]);

  const loadHeatmap = useCallback(async () => {
    setHeatmapLoading(true);
    setHeatmapError(false);
    try {
      const today = new Date();
      const endTs = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime();
      const startTs = endTs - 16 * 7 * 24 * 60 * 60 * 1000;
      const [counts, allWeeks, total] = await Promise.all([
        getSessionCountsByDay(startTs, endTs), getAllCompletedSessionWeeks(), getTotalSessionCount(),
      ]);
      const map = new Map<string, number>();
      for (const row of counts) map.set(row.date, row.count);
      setHeatmapData(map);
      setCurrentStreak(computeStreak(allWeeks));
      setLongestStreak(computeLongestStreak(allWeeks));
      setTotalWorkouts(total);
    } catch {
      setHeatmapError(true);
    } finally {
      setHeatmapLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    loadHeatmap();
    getSchedule().then(setSchedule).catch(() => setSchedule([]));
    // BLD-938: cache the available filter option lists once per visit.
    getTemplatesWithSessions().then(setTemplateOptions).catch(() => setTemplateOptions([]));
    getMuscleGroupsWithSessions().then(setMuscleGroupOptions).catch(() => setMuscleGroupOptions([]));
  }, [load, loadHeatmap]));

  // BLD-938: when any filter is active OR text search active, fetch from
  // getFilteredSessions paged. When all filters cleared, the calendar/month
  // path resumes via `filtered` below.
  //
  // Page index is intentionally captured into the dependency array so that
  // tapping "load more" (which dispatches setFilterPage(p => p+1) — an
  // event-time setter, lint-clean) re-runs this effect with a higher offset.
  // The reset-to-page-zero on filter/query change is handled in the setter
  // callbacks below (NOT a derived effect), which keeps lint happy
  // (react-hooks/set-state-in-effect).
  useEffect(() => {
    const seq = ++filterFetchSeqRef.current;
    if (!useFilterMode && !query.trim()) {
      // Fully unfiltered: nothing to fetch. We do NOT reset
      // filteredRows/filteredTotal here (would be a setState-in-effect lint
      // violation). Instead, the `filtered` memo below short-circuits to
      // `sessions` whenever `useFilterMode` is false, so any stale
      // filteredRows are simply ignored until the next filtered fetch
      // overwrites them.
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starting async fetch; loading flag flipped back via .finally
    setFilterLoading(true);
    const offset = filterPage * FILTER_PAGE_SIZE;
    getFilteredSessions(filterState.filters, query, FILTER_PAGE_SIZE, offset)
      .then((res) => {
        // Drop stale fetches.
        if (seq !== filterFetchSeqRef.current) return;
        setFilteredRows((prev) => (filterPage === 0 ? res.rows : [...prev, ...res.rows]));
        setFilteredTotal(res.total);
      })
      .catch(() => {
        if (seq !== filterFetchSeqRef.current) return;
        setFilteredRows([]);
        setFilteredTotal(0);
      })
      .finally(() => {
        if (seq !== filterFetchSeqRef.current) return;
        setFilterLoading(false);
      });
  }, [useFilterMode, filterState.filters, query, filterPage]);

  // BLD-938: clear calendar selection when filters become active, AND reset
  // paging — both done in the filter setter handlers (event-time, lint-clean
  // alternative to a derived effect). When the user clears all filters we
  // deliberately do NOT restore the prior selection (per plan §UX — filter
  // mode resets calendar's selection on activation).
  const setTemplateFilter = useCallback(
    (templateId: string | null) => {
      if (templateId !== null) setSelected(null);
      setFilterPage(0);
      filterState.setTemplate(templateId);
    },
    [filterState],
  );
  const setMuscleGroupFilter = useCallback(
    (muscleGroup: string | null) => {
      if (muscleGroup !== null) setSelected(null);
      setFilterPage(0);
      filterState.setMuscleGroup(muscleGroup);
    },
    [filterState],
  );
  const setDatePresetFilter = useCallback(
    (datePreset: DatePreset | null) => {
      if (datePreset !== null) setSelected(null);
      setFilterPage(0);
      filterState.setDatePreset(datePreset);
    },
    [filterState],
  );
  const clearOneFilter = useCallback(
    (key: HistoryFilterKey) => {
      setFilterPage(0);
      filterState.clearOne(key);
    },
    [filterState],
  );
  const clearAllFilters = useCallback(() => {
    setFilterPage(0);
    filterState.clearAll();
  }, [filterState]);

  const dotMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) { const key = formatDateKey(s.started_at); map.set(key, (map.get(key) ?? 0) + 1); }
    return map;
  }, [sessions]);

  const scheduleMap = useMemo(() => {
    const map = new Map<number, ScheduleEntry>();
    for (const entry of schedule) map.set(entry.day_of_week, entry);
    return map;
  }, [schedule]);

  const monthSummary = useMemo(() => {
    const count = sessions.length;
    const totalHours = sessions.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0) / 3600;
    return { count, totalHours: Math.round(totalHours * 10) / 10 };
  }, [sessions]);

  const filtered = useMemo(() => {
    // BLD-938: filter mode (chips) takes precedence — uses paged filtered rows.
    if (useFilterMode) return filteredRows;
    // Existing text-search path
    if (results) return results;
    if (!selected) return sessions;
    return sessions.filter((s) => formatDateKey(s.started_at) === selected);
  }, [sessions, selected, results, useFilterMode, filteredRows]);

  const loadMoreFiltered = useCallback(() => {
    if (!useFilterMode) return;
    if (filterLoading) return;
    if (filteredRows.length >= filteredTotal) return;
    setFilterPage((p) => p + 1);
  }, [useFilterMode, filterLoading, filteredRows.length, filteredTotal]);

  const changeMonth = useCallback((direction: -1 | 1) => {
    const animDurationMs = reducedMotion ? 0 : animDuration.normal;
    const slideDistance = layout.width * direction * -1;
    translateX.value = slideDistance;
    translateX.value = withTiming(0, { duration: animDurationMs });
    setSelected(null); setQuery(""); setResults(null);
    if (direction === -1) { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); }
    else { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); }
  }, [month, year, layout.width, reducedMotion, translateX]);

  const swipeGesture = useMemo(() =>
    Gesture.Pan().activeOffsetX([-SWIPE_THRESHOLD, SWIPE_THRESHOLD]).enabled(!screenReaderEnabled)
      .onEnd((e: { translationX: number }) => {
        if (e.translationX < -SWIPE_THRESHOLD) changeMonth(1);
        else if (e.translationX > SWIPE_THRESHOLD) changeMonth(-1);
      }).runOnJS(true),
    [screenReaderEnabled, changeMonth]);

  const onSearch = (text: string) => {
    setQuery(text); setSelected(null); setFilterPage(0);
    if (timer.current) clearTimeout(timer.current);
    if (!text.trim()) { setResults(null); return; }
    timer.current = setTimeout(async () => { const data = await searchSessions(text.trim()); setResults(data); }, 300);
  };

  const clearFilter = () => {
    setSelected(null);
    setQuery("");
    setResults(null);
    setFilterPage(0);
    filterState.clearAll();
  };

  const tapDay = (key: string) => {
    setQuery(""); setResults(null);
    if (!reduceMotionEnabled) {
      const { LayoutAnimation } = require("react-native");
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setSelected(selected === key ? null : key);
  };

  const onHeatmapDayPress = (dateKey: string) => {
    const [y, m] = dateKey.split("-").map(Number);
    if (y !== year || m - 1 !== month) { setYear(y); setMonth(m - 1); }
    setQuery(""); setResults(null); setSelected(dateKey);
  };

  const dayDetailSessions = useMemo(() => {
    if (!selected) return [];
    return sessions.filter((s) => formatDateKey(s.started_at) === selected);
  }, [sessions, selected]);

  const selectedDayScheduleEntry = useMemo(() => {
    if (!selected) return null;
    const parts = selected.split("-").map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return scheduleMap.get(weekday(d)) ?? null;
  }, [selected, scheduleMap]);

  const isSelectedDayFuture = useMemo(() => {
    if (!selected) return false;
    const parts = selected.split("-").map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    return d.getTime() > todayStart.getTime();
  }, [selected]);

  const emptyMessage = () => {
    if (useFilterMode) return "No workouts match these filters";
    if (query.trim()) return `No workouts matching "${query}"`;
    if (selected) return "Rest day!";
    if (!hasAny) return "No workouts yet. Start your first workout!";
    return `No workouts in ${monthLabel(year, month)}`;
  };

  return {
    year, month, sessions, selected, query, filtered, hasAny,
    dayDetailRef, selectedCellRef, animatedCalendarStyle,
    heatmapData, currentStreak, longestStreak, totalWorkouts,
    heatmapLoading, heatmapError, heatmapExpanded, setHeatmapExpanded,
    dotMap, scheduleMap, monthSummary, swipeGesture,
    dayDetailSessions, selectedDayScheduleEntry, isSelectedDayFuture,
    changeMonth, onSearch, clearFilter, tapDay, onHeatmapDayPress, emptyMessage,
    screenReaderEnabled, reduceMotionEnabled,
    // BLD-938 history filters
    filters: filterState.filters,
    anyFilterActive: filterState.anyActive,
    setTemplateFilter,
    setMuscleGroupFilter,
    setDatePresetFilter,
    clearOneFilter,
    clearAllFilters,
    templateOptions,
    muscleGroupOptions,
    filteredTotal,
    filterLoading,
    loadMoreFiltered,
    useFilterMode,
  };
}
