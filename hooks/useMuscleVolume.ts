/* eslint-disable max-lines-per-function */
import { useCallback, useMemo, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useFocusEffect } from "expo-router";
import { getMuscleVolumeForWeek, getMuscleVolumeTrend } from "../lib/db";
import { getAppSetting, setAppSetting } from "../lib/db/settings";
import type { MuscleGroup } from "../lib/types";
import type { VolumeLandmarks } from "../lib/volume-landmarks";
import {
  DEFAULT_LANDMARKS,
  VOLUME_LANDMARKS_SETTING_KEY,
  mergeWithDefaults,
  parseCustomLandmarks,
} from "../lib/volume-landmarks";

export type VolumeRow = { muscle: MuscleGroup; sets: number; exercises: number };
export type TrendRow = { week: string; sets: number };

const TREND_WEEKS = 8;

function mondayOfWeek(offset: number): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - diff + offset * 7);
  return monday;
}

export function formatRange(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function useMuscleVolume() {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<VolumeRow[]>([]);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [selected, setSelected] = useState<MuscleGroup | null>(null);
  const selectedRef = useRef<MuscleGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);
  const [landmarks, setLandmarks] = useState<Record<MuscleGroup, VolumeLandmarks>>(
    { ...DEFAULT_LANDMARKS }
  );

  const monday = useMemo(() => mondayOfWeek(offset), [offset]);

  const loadLandmarks = useCallback(async () => {
    const raw = await getAppSetting(VOLUME_LANDMARKS_SETTING_KEY);
    const custom = parseCustomLandmarks(raw);
    const merged = mergeWithDefaults(custom);
    setLandmarks(merged);
    return merged;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadLandmarks();
      const rows = await getMuscleVolumeForWeek(monday.getTime());
      setData(rows);
      if (rows.length > 0) {
        const cur = selectedRef.current;
        const muscle = cur && rows.some((r) => r.muscle === cur)
          ? cur
          : rows[0].muscle;
        selectedRef.current = muscle;
        setSelected(muscle);
        const t = await getMuscleVolumeTrend(muscle, TREND_WEEKS);
        setTrend(t);
      } else {
        selectedRef.current = null;
        setSelected(null);
        setTrend([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [monday, loadLandmarks]);

  useFocusEffect(
    useCallback(() => {
      load();
      AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    }, [load])
  );

  const selectMuscle = useCallback(async (muscle: MuscleGroup) => {
    selectedRef.current = muscle;
    setSelected(muscle);
    try {
      const t = await getMuscleVolumeTrend(muscle, TREND_WEEKS);
      setTrend(t);
    } catch {
      // trend load failure is non-critical
    }
  }, []);

  const maxSets = useMemo(() => {
    const allMrvValues = Object.values(landmarks).map((l) => l.mrv);
    return Math.max(...data.map((d) => d.sets), ...allMrvValues);
  }, [data, landmarks]);

  const hasEnoughTrend = useMemo(
    () => trend.filter((t) => t.sets > 0).length >= 2,
    [trend]
  );

  const saveLandmark = useCallback(
    async (muscle: MuscleGroup, value: VolumeLandmarks) => {
      const raw = await getAppSetting(VOLUME_LANDMARKS_SETTING_KEY);
      const custom = parseCustomLandmarks(raw) ?? {};
      custom[muscle] = value;
      await setAppSetting(VOLUME_LANDMARKS_SETTING_KEY, JSON.stringify(custom));
      setLandmarks((prev) => ({ ...prev, [muscle]: value }));
    },
    []
  );

  const resetLandmark = useCallback(
    async (muscle: MuscleGroup) => {
      const raw = await getAppSetting(VOLUME_LANDMARKS_SETTING_KEY);
      const custom = parseCustomLandmarks(raw) ?? {};
      delete custom[muscle];
      if (Object.keys(custom).length === 0) {
        await setAppSetting(VOLUME_LANDMARKS_SETTING_KEY, "{}");
      } else {
        await setAppSetting(VOLUME_LANDMARKS_SETTING_KEY, JSON.stringify(custom));
      }
      setLandmarks((prev) => ({ ...prev, [muscle]: DEFAULT_LANDMARKS[muscle] }));
    },
    []
  );

  const resetAllLandmarks = useCallback(async () => {
    await setAppSetting(VOLUME_LANDMARKS_SETTING_KEY, "{}");
    setLandmarks({ ...DEFAULT_LANDMARKS });
  }, []);

  return {
    offset,
    setOffset,
    data,
    trend,
    selected,
    selectMuscle,
    loading,
    error,
    load,
    monday,
    maxSets,
    hasEnoughTrend,
    reduced,
    formatRange,
    landmarks,
    saveLandmark,
    resetLandmark,
    resetAllLandmarks,
  };
}
