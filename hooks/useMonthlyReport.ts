import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useFocusEffect } from "expo-router";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";

import { getMonthlyReport, getBodySettings } from "@/lib/db";
import type { MonthlyReportData } from "@/lib/db";
import type { BodySettings } from "@/lib/types";

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

  // ─── Share (image capture pipeline) ────────────────────────────

  const shareCardRef = useRef<View>(null);
  const [imageLoading, setImageLoading] = useState(false);

  const handleShare = useCallback(async () => {
    if (!shareCardRef.current) return;
    let uri: string | null = null;
    try {
      setImageLoading(true);
      uri = await captureRef(shareCardRef, { format: "png", quality: 1.0 });
      await Sharing.shareAsync(uri, { mimeType: "image/png" });
    } catch {
      // Share cancelled or failed — ignore
    } finally {
      setImageLoading(false);
      if (uri) {
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
    }
  }, []);

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
    shareCardRef,
    imageLoading,
    volChange,
    sessionDelta,
  };
}
