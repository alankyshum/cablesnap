import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Share } from "react-native";
import { useFocusEffect } from "expo-router";

import { getMonthlyReport, getBodySettings } from "@/lib/db";
import type { MonthlyReportData } from "@/lib/db";
import type { BodySettings } from "@/lib/types";
import { formatDuration } from "@/lib/format";
import { toDisplay } from "@/lib/units";

// ─── Constants ─────────────────────────────────────────────────────

export const MAX_MONTHS_BACK = 12;

// ─── Helpers ───────────────────────────────────────────────────────

export function formatMonthLabel(year: number, monthIndex: number): string {
  const d = new Date(year, monthIndex, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function formatVolume(vol: number): string {
  if (vol >= 1_000_000) {
    return `${Math.round(vol / 1000).toLocaleString()}k`;
  }
  return Math.round(vol).toLocaleString();
}

export function volumeChangePercent(current: number, previous: number | null): string | null {
  if (previous === null || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return null;
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

export function sessionCountDelta(current: number, previous: number | null): string | null {
  if (previous === null) return null;
  const diff = current - previous;
  if (diff === 0) return null;
  return diff > 0 ? `+${diff}` : `${diff}`;
}

// ─── Hook ──────────────────────────────────────────────────────────

export function useMonthlyReport() {
  const [monthOffset, setMonthOffset] = useState(0);
  const [data, setData] = useState<MonthlyReportData | null>(null);
  const [settings, setSettings] = useState<BodySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const cacheRef = useRef<Record<number, MonthlyReportData>>({});

  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth();

  const targetDate = useMemo(() => {
    const d = new Date(currentYear, currentMonthIndex + monthOffset, 1);
    return { year: d.getFullYear(), monthIndex: d.getMonth() };
  }, [currentYear, currentMonthIndex, monthOffset]);

  const loadMonth = useCallback(
    async (offset: number): Promise<MonthlyReportData | null> => {
      const d = new Date(currentYear, currentMonthIndex + offset, 1);
      try {
        return await getMonthlyReport(d.getFullYear(), d.getMonth());
      } catch {
        return null;
      }
    },
    [currentYear, currentMonthIndex]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // Always refresh current view month (don't serve stale cache)
      const [summary, bodySettings] = await Promise.all([
        loadMonth(monthOffset),
        getBodySettings(),
      ]);
      if (summary) {
        setData(summary);
        cacheRef.current[monthOffset] = summary;
      } else {
        setError(true);
      }
      setSettings(bodySettings);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [monthOffset, loadMonth]);

  // Preload adjacent months
  useEffect(() => {
    let cancelled = false;
    const preload = async () => {
      await new Promise((r) => setTimeout(r, 150));
      if (cancelled) return;
      const offsets = [monthOffset - 1, monthOffset + 1].filter(
        (o) => o <= 0 && o >= -MAX_MONTHS_BACK && !cacheRef.current[o]
      );
      for (const o of offsets) {
        if (cancelled) return;
        const result = await loadMonth(o);
        if (result && !cancelled) {
          cacheRef.current[o] = result;
        }
      }
    };
    preload();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthOffset]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const unit = settings?.weight_unit ?? "kg";
  const canGoBack = monthOffset > -MAX_MONTHS_BACK;
  const canGoForward = monthOffset < 0;

  const navigateMonth = (dir: -1 | 1) => {
    const next = monthOffset + dir;
    if (next < -MAX_MONTHS_BACK || next > 0) return;
    setMonthOffset(next);
  };

  // ─── Share ─────────────────────────────────────────────────────

  const buildShareText = (): string => {
    if (!data) return "";
    const { workouts, prs, trainingDays, longestStreak, body, nutrition } = data;
    const label = formatMonthLabel(targetDate.year, targetDate.monthIndex);
    const lines: string[] = [
      `📊 CableSnap Monthly Report`,
      label,
      "",
    ];

    if (workouts.sessionCount > 0) {
      lines.push(
        `💪 Workouts: ${workouts.sessionCount} sessions (${formatDuration(workouts.totalDurationSeconds)} total)`
      );
      const volStr = `${formatVolume(toDisplay(workouts.totalVolume, unit))} ${unit}`;
      const volChange = volumeChangePercent(workouts.totalVolume, workouts.previousMonthVolume);
      lines.push(
        `📈 Volume: ${volStr}${volChange ? ` (${volChange} vs last month)` : ""}`
      );
    }

    if (trainingDays > 0) {
      lines.push(`📅 ${trainingDays} training days · ${longestStreak} day best streak`);
    }

    if (prs.length > 0) {
      const prParts = prs.slice(0, 3).map((pr) => {
        const w = toDisplay(pr.weight, unit);
        return `${pr.exerciseName} ${w}${unit}`;
      });
      lines.push(`🏆 PRs: ${prParts.join(", ")}`);
    }

    if (nutrition) {
      lines.push(`🥗 Nutrition: ${nutrition.daysOnTarget}/${nutrition.daysTracked} days on target`);
    }

    if (body && body.startWeight !== null && body.endWeight !== null) {
      const start = toDisplay(body.startWeight, unit);
      const end = toDisplay(body.endWeight, unit);
      const delta = Math.round((end - start) * 10) / 10;
      const sign = delta >= 0 ? "+" : "";
      lines.push(`⚖️ Weight: ${start} → ${end} ${unit} (${sign}${delta})`);
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
    ? volumeChangePercent(data.workouts.totalVolume, data.workouts.previousMonthVolume)
    : null;

  const sessionDelta = data
    ? sessionCountDelta(data.workouts.sessionCount, data.workouts.previousMonthSessionCount)
    : null;

  return {
    data,
    loading,
    error,
    monthOffset,
    year: targetDate.year,
    monthIndex: targetDate.monthIndex,
    unit,
    canGoBack,
    canGoForward,
    navigateMonth,
    handleShare,
    volChange,
    sessionDelta,
  };
}
