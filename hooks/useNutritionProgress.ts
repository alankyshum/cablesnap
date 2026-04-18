import { useCallback, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";
import {
  getDailyNutritionTotals,
  getWeeklyNutritionAverages,
  getNutritionAdherence,
  getNutritionTargets,
} from "../lib/db";
import type {
  DailyNutritionTotal,
  WeeklyNutritionAverage,
  NutritionAdherence,
} from "../lib/db";
import type { MacroTargets } from "../lib/types";

export type NutritionPeriod = 4 | 8 | 12;

export type NutritionProgressData = {
  dailyTotals: DailyNutritionTotal[];
  weeklyAverages: WeeklyNutritionAverage[];
  adherence: NutritionAdherence | null;
  targets: MacroTargets | null;
  period: NutritionPeriod;
  setPeriod: (p: NutritionPeriod) => void;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  reducedMotion: boolean;
};

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function useNutritionProgress(): NutritionProgressData {
  const [period, setPeriod] = useState<NutritionPeriod>(4);
  const [dailyTotals, setDailyTotals] = useState<DailyNutritionTotal[]>([]);
  const [weeklyAverages, setWeeklyAverages] = useState<WeeklyNutritionAverage[]>([]);
  const [adherence, setAdherence] = useState<NutritionAdherence | null>(null);
  const [targets, setTargets] = useState<MacroTargets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const reducedMotion = useReducedMotion() ?? false;

  const fetchData = useCallback(async (weeks: NutritionPeriod) => {
    try {
      setLoading(true);
      setError(null);

      const today = new Date();
      const endDate = dateKey(today);
      const start = new Date(today);
      start.setDate(start.getDate() - weeks * 7);
      const startDate = dateKey(start);

      const t = await getNutritionTargets();
      setTargets(t);

      const [daily, weekly] = await Promise.all([
        getDailyNutritionTotals(startDate, endDate),
        getWeeklyNutritionAverages(weeks),
      ]);

      setDailyTotals(daily);
      setWeeklyAverages(weekly);

      if (t) {
        const adh = await getNutritionAdherence(weeks * 7, t.calories);
        setAdherence(adh);
      } else {
        setAdherence(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Failed to load nutrition data"));
    } finally {
      setLoading(false);
    }
  }, []);

  const load = useCallback(() => {
    fetchData(period);
  }, [fetchData, period]);

  const handleSetPeriod = useCallback((p: NutritionPeriod) => {
    setPeriod(p);
    fetchData(p);
  }, [fetchData]);

  return {
    dailyTotals,
    weeklyAverages,
    adherence,
    targets,
    period,
    setPeriod: handleSetPeriod,
    loading,
    error,
    refetch: load,
    reducedMotion,
  };
}
