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
  // BLD-938: removed legacy `results` state — text search now renders
  // from `filteredRows` populated by getFilteredSessions (plan §UI Hook).
  const [hasAny, setHasAny] = useState(true);
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
  // BLD-938 — plan §Performance: filter changes are debounced 300ms so
  // rapid chip/sheet taps collapse into a single query. Matches the
  // existing search debounce in `onSearch` below.
  const FILTER_DEBOUNCE_MS = 300;

  const useFilterMode = filterState.anyActive;
  // BLD-938 — derived predicate: are we rendering from getFilteredSessions
  // results, vs the unfiltered calendar/month path? True for any chip
  // filter OR a non-empty text search. This drives `filtered` rendering
  // and the `loadMoreFiltered` gate.
  //
  // Distinct from `useFilterMode` which is chip-only and controls the
  // calendar dim/disable UX (plan §65-69 — text search must NOT disable
  // the calendar).
  const useFilteredQueryPath = useFilterMode || query.trim().length > 0;

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReaderEnabled);
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotionEnabled);
    const srSub = AccessibilityInfo.addEventListener("screenReaderChanged", setScreenReaderEnabled);
    const rmSub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotionEnabled);
    return () => { srSub.remove(); rmSub.remove(); };
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
  //
  // Debounce: rapid filter taps (chip → sheet → tap → sheet → tap) MUST
  // collapse into a single query (plan §Performance — 300ms debounce, also
  // explicit acceptance criteria from QD R3). Pagination requests
  // (filterPage > 0) bypass the debounce — the user already paid the
  // visible cost of scrolling and we never want a "load more" request
  // dropped because a chip was tapped 100ms earlier.
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
    const offset = filterPage * FILTER_PAGE_SIZE;
    const runFetch = () => {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- starting async fetch; loading flag flipped back via .finally
      setFilterLoading(true);
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
    };

    // Pagination requests run immediately; user-driven filter/search
    // changes are reset to page 0 by their setters and routed here for
    // debouncing.
    if (filterPage > 0) {
      runFetch();
      return;
    }
    const t = setTimeout(runFetch, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(t);
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
    // BLD-938 — plan §UI Hook (line 209): "When any filter is non-null OR
    // text search active → call getFilteredSessions (paged, 20/page)."
    // The chip-filter path AND the text-search path both render from
    // `filteredRows`, populated by getFilteredSessions in the unified
    // effect above. The legacy in-memory searchSessions path is gone.
    //
    // NOTE on UX vs SQL routing: `useFilterMode` (chip-only) still
    // controls the calendar dim/disable + result-count caption per plan
    // §65-69. Text-only search uses the filtered SQL path but does NOT
    // disable the calendar — the calendar stays interactive for date
    // navigation alongside a name search, matching the prior UX.
    if (useFilteredQueryPath) return filteredRows;
    if (!selected) return sessions;
    return sessions.filter((s) => formatDateKey(s.started_at) === selected);
  }, [sessions, selected, useFilteredQueryPath, filteredRows]);

  const loadMoreFiltered = useCallback(() => {
    // Pagination is available whenever we're rendering from filteredRows —
    // text-only search OR any chip filter active.
    if (!useFilteredQueryPath) return;
    if (filterLoading) return;
    if (filteredRows.length >= filteredTotal) return;
    setFilterPage((p) => p + 1);
  }, [useFilteredQueryPath, filterLoading, filteredRows.length, filteredTotal]);

  const changeMonth = useCallback((direction: -1 | 1) => {
    const animDurationMs = reducedMotion ? 0 : animDuration.normal;
    const slideDistance = layout.width * direction * -1;
    translateX.value = slideDistance;
    translateX.value = withTiming(0, { duration: animDurationMs });
    setSelected(null); setQuery("");
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
    // BLD-938 — text search now routes through the unified
    // getFilteredSessions effect (debounced 300ms there). We just update
    // `query`, reset paging, and clear any calendar-day selection. The
    // legacy searchSessions in-memory call is gone — see plan §UI Hook
    // requirement: "When any filter is non-null OR text search active →
    // call getFilteredSessions (paged)."
    setQuery(text);
    setSelected(null);
    setFilterPage(0);
  };

  const clearFilter = () => {
    setSelected(null);
    setQuery("");
    setFilterPage(0);
    filterState.clearAll();
  };

  const tapDay = (key: string) => {
    setQuery("");
    if (!reduceMotionEnabled) {
      const { LayoutAnimation } = require("react-native");
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setSelected(selected === key ? null : key);
  };

  const onHeatmapDayPress = (dateKey: string) => {
    const [y, m] = dateKey.split("-").map(Number);
    if (y !== year || m - 1 !== month) { setYear(y); setMonth(m - 1); }
    setQuery(""); setSelected(dateKey);
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
    useFilteredQueryPath,
  };
}
