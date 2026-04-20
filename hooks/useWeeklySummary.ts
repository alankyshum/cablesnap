import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Share } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
} from "react-native-reanimated";

import { getWeeklySummary, getBodySettings } from "@/lib/db";
import type { WeeklySummaryData } from "@/lib/db";
import type { BodySettings } from "@/lib/types";
import { mondayOf, formatDuration } from "@/lib/format";
import { toDisplay } from "@/lib/units";
import { duration, easing } from "@/constants/design-tokens";

// ─── Constants ─────────────────────────────────────────────────────

export const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_WEEKS_BACK = 12;

// ─── Helpers ───────────────────────────────────────────────────────

export function formatWeekRange(weekStartMs: number): string {
  const start = new Date(weekStartMs);
  const end = new Date(weekStartMs + 6 * 24 * 60 * 60 * 1000);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function volumeChangePercent(current: number, previous: number | null): string | null {
  if (previous === null || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return null;
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

// ─── Hook ──────────────────────────────────────────────────────────

export function useWeeklySummary() {
  const reducedMotion = useReducedMotion();

  const [expanded, setExpanded] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState<WeeklySummaryData | null>(null);
  const [settings, setSettings] = useState<BodySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const cacheRef = useRef<Record<number, WeeklySummaryData>>({});

  const currentMonday = useMemo(() => mondayOf(new Date()), []);
  const weekStartMs = currentMonday + weekOffset * ONE_WEEK_MS;

  // Animation
  const expandHeight = useSharedValue(0);
  const expandOpacity = useSharedValue(0);

  const expandAnimStyle = useAnimatedStyle(() => ({
    maxHeight: expandHeight.value,
    opacity: expandOpacity.value,
    overflow: "hidden" as const,
  }));

  useEffect(() => {
    if (reducedMotion) {
      expandHeight.value = expanded ? 2000 : 0;
      expandOpacity.value = expanded ? 1 : 0;
      return;
    }
    expandHeight.value = withTiming(expanded ? 2000 : 0, {
      duration: duration.normal,
      easing: easing.standard,
    });
    expandOpacity.value = withTiming(expanded ? 1 : 0, {
      duration: duration.normal,
      easing: easing.standard,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, reducedMotion]);

  const loadWeek = useCallback(
    async (offset: number): Promise<WeeklySummaryData | null> => {
      const monday = currentMonday + offset * ONE_WEEK_MS;
      try {
        return await getWeeklySummary(monday);
      } catch {
        return null;
      }
    },
    [currentMonday]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const cached = cacheRef.current[weekOffset];
      const [summary, bodySettings] = await Promise.all([
        cached ? Promise.resolve(cached) : loadWeek(weekOffset),
        getBodySettings(),
      ]);
      if (summary) {
        setData(summary);
        cacheRef.current[weekOffset] = summary;
      } else {
        setError(true);
      }
      setSettings(bodySettings);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [weekOffset, loadWeek]);

  // Preload adjacent weeks after initial render
  useEffect(() => {
    let cancelled = false;
    const preload = async () => {
      await new Promise((r) => setTimeout(r, 100));
      if (cancelled) return;
      const offsets = [weekOffset - 1, weekOffset + 1].filter(
        (o) => o <= 0 && o >= -MAX_WEEKS_BACK && !cacheRef.current[o]
      );
      for (const o of offsets) {
        if (cancelled) return;
        const result = await loadWeek(o);
        if (result && !cancelled) {
          cacheRef.current[o] = result;
        }
      }
    };
    preload();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const unit = settings?.weight_unit ?? "kg";
  const canGoBack = weekOffset > -MAX_WEEKS_BACK;
  const canGoForward = weekOffset < 0;

  const navigateWeek = (dir: -1 | 1) => {
    const next = weekOffset + dir;
    if (next < -MAX_WEEKS_BACK || next > 0) return;
    setWeekOffset(next);
  };

  // ─── Share ─────────────────────────────────────────────────────

  const buildShareText = (): string => {
    if (!data) return "";
    const { workouts, prs, nutrition, body, streak } = data;
    const range = formatWeekRange(weekStartMs);
    const lines: string[] = [
      `📊 CableSnap Weekly Summary`,
      `Week of ${range}`,
      "",
    ];

    if (workouts.sessionCount > 0) {
      lines.push(
        `💪 Workouts: ${workouts.sessionCount} completed (${formatDuration(workouts.totalDurationSeconds)} total)`
      );
      const volChange = volumeChangePercent(workouts.totalVolume, workouts.previousWeekVolume);
      const volStr = `${formatNumber(Math.round(toDisplay(workouts.totalVolume, unit)))} ${unit}`;
      lines.push(
        `📈 Volume: ${volStr}${volChange ? ` (${volChange} vs last week)` : ""}`
      );
    }

    if (prs.length > 0) {
      const prParts = prs.map((pr) => {
        const w = toDisplay(pr.newMax, unit);
        const delta =
          pr.previousMax !== null
            ? ` (+${toDisplay(pr.newMax - pr.previousMax, unit)})`
            : "";
        return `${pr.exerciseName} ${w}${unit}${delta}`;
      });
      lines.push(`🏆 PRs: ${prParts.join(", ")}`);
    }

    if (nutrition) {
      lines.push(
        `🥗 Nutrition: ${nutrition.daysOnTarget}/${nutrition.daysTracked} days on target (avg ${formatNumber(nutrition.avgCalories)} cal)`
      );
    }

    if (body && body.startWeight !== null && body.endWeight !== null) {
      const start = toDisplay(body.startWeight, unit);
      const end = toDisplay(body.endWeight, unit);
      const delta = Math.round((end - start) * 10) / 10;
      const sign = delta >= 0 ? "+" : "";
      lines.push(`⚖️ Weight: ${start} → ${end} ${unit} (${sign}${delta})`);
    }

    if (streak > 0) {
      lines.push(`🔥 Streak: ${streak} weeks`);
    }

    lines.push("", "Tracked with CableSnap");
    return lines.join("\n");
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: buildShareText() });
    } catch {
      // Share cancelled or failed — ignore
    }
  };

  const volChange = data
    ? volumeChangePercent(data.workouts.totalVolume, data.workouts.previousWeekVolume)
    : null;

  return {
    data,
    loading,
    error,
    expanded,
    setExpanded,
    weekOffset,
    weekStartMs,
    unit,
    canGoBack,
    canGoForward,
    navigateWeek,
    handleShare,
    expandAnimStyle,
    volChange,
  };
}
