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
  }, [load, loadHeatmap]));

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
    if (results) return results;
    if (!selected) return sessions;
    return sessions.filter((s) => formatDateKey(s.started_at) === selected);
  }, [sessions, selected, results]);

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
    setQuery(text); setSelected(null);
    if (timer.current) clearTimeout(timer.current);
    if (!text.trim()) { setResults(null); return; }
    timer.current = setTimeout(async () => { const data = await searchSessions(text.trim()); setResults(data); }, 300);
  };

  const clearFilter = () => { setSelected(null); setQuery(""); setResults(null); };

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
  };
}
