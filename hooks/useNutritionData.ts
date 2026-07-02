import { useCallback, useMemo, useRef, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  getDailyLogs, getDailySummary, getMacroTargets, deleteDailyLog, addDailyLog,
  getDailyTotalMl, getWaterLogsForDate,
  addWaterLog, deleteWaterLog, updateWaterLog,
  getAppSetting, getLatestBodyWeight,
} from "../lib/db";
import type { DailyLog, MacroTargets, Meal, WaterLog } from "../lib/types";
import { MEALS, MEAL_LABELS } from "../lib/types";
import { formatDateKey } from "../lib/format";
import type { HydrationUnit } from "../lib/hydration-units";
import { useToast } from "../components/ui/bna-toast";
import {
  computeEffectiveTargets,
  type EffectiveTargets,
  type PureMacroTargets,
} from "../lib/training-day-macros";
import {
  getAllSettings as getTrainingDaySettings,
} from "../lib/db/training-day-settings";
import { wasWorkoutDay } from "../lib/db/training-day-workout";
import { migrateProfile, convertToMetric } from "../lib/nutrition-calc";
import { safeParse } from "../lib/safe-parse";
import type { NutritionProfile } from "../lib/nutrition-calc";

const DAY_MS = 86_400_000;

const DEFAULT_GOAL_ML = 2000;
const DEFAULT_PRESETS_ML: [number, number, number] = [250, 500, 750];
const DEFAULT_WEIGHT_KG = 75;

function parseGoal(raw: string | null): number {
  if (!raw) return DEFAULT_GOAL_ML;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GOAL_ML;
}

function parsePreset(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseUnit(raw: string | null): HydrationUnit {
  return raw === "fl_oz" ? "fl_oz" : "ml";
}

/** Fetch the user's body weight in kg for macro computation. */
async function fetchWeightKg(): Promise<number> {
  // Prefer latest body_weight log
  try {
    const bw = await getLatestBodyWeight();
    if (bw && bw.weight > 0) return bw.weight;
  } catch {
    // fall through to profile
  }
  // Fallback: nutrition_profile.weight (converted to kg)
  try {
    const saved = await getAppSetting("nutrition_profile");
    if (saved) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = safeParse<Record<string, unknown> | null>(saved, null, "useNutritionData.weightKg") as any;
      if (raw) {
        const profile = migrateProfile(raw) as NutritionProfile;
        const { weight_kg } = convertToMetric(
          profile.weight, profile.weightUnit, profile.height, profile.heightUnit
        );
        if (weight_kg > 0) return weight_kg;
      }
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_WEIGHT_KG;
}

/**
 * Training-Day Macro Adjustment state shape.
 * Passed directly to NutritionListHeader.trainingDayAdjustment.
 */
export type TrainingDayAdjustmentState = {
  dayType: EffectiveTargets["dayType"];
  baseCals: number;
  adjusted: boolean;
  cappedByFloor: boolean;
} | null;

export function useNutritionData() {
  const [date, setDate] = useState(new Date());
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [summary, setSummary] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [targets, setTargets] = useState<MacroTargets | null>(null);
  const [waterTotalMl, setWaterTotalMl] = useState(0);
  const [waterEntries, setWaterEntries] = useState<WaterLog[]>([]);
  const [waterGoalMl, setWaterGoalMl] = useState(DEFAULT_GOAL_ML);
  const [waterUnit, setWaterUnit] = useState<HydrationUnit>("ml");
  const [waterPresetsMl, setWaterPresetsMl] = useState<[number, number, number]>(DEFAULT_PRESETS_ML);
  /**
   * Training-Day Macro Adjustment (AC8, AC9, AC12a, AC12b, AC18):
   * Non-null when the feature is enabled and the displayed date has been classified.
   * Set to null when feature is disabled → NutritionListHeader shows no badge.
   */
  const [trainingDayAdjustment, setTrainingDayAdjustment] = useState<TrainingDayAdjustmentState>(null);
  const { info, error } = useToast();
  const deleted = useRef<{ log: DailyLog; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [templateSheet, setTemplateSheet] = useState<{ visible: boolean; meal: Meal; items: DailyLog[] }>({
    visible: false, meal: "breakfast", items: [],
  });
  const { add } = useLocalSearchParams<{ add?: string }>();

  const load = useCallback(async () => {
    const ds = formatDateKey(date.getTime());
    const [l, s, t, wTot, wEntries, wGoal, wUnit, p1, p2, p3] = await Promise.all([
      getDailyLogs(ds),
      getDailySummary(ds),
      getMacroTargets(),
      getDailyTotalMl(ds),
      getWaterLogsForDate(ds),
      getAppSetting("hydration.daily_goal_ml"),
      getAppSetting("hydration.unit"),
      getAppSetting("hydration.preset_1_ml"),
      getAppSetting("hydration.preset_2_ml"),
      getAppSetting("hydration.preset_3_ml"),
    ]);
    setLogs(l); setSummary(s);
    setWaterTotalMl(wTot);
    setWaterEntries(wEntries);
    setWaterGoalMl(parseGoal(wGoal));
    setWaterUnit(parseUnit(wUnit));
    setWaterPresetsMl([
      parsePreset(p1, DEFAULT_PRESETS_ML[0]),
      parsePreset(p2, DEFAULT_PRESETS_ML[1]),
      parsePreset(p3, DEFAULT_PRESETS_ML[2]),
    ]);

    // ── Training-Day Macro Adjustment ──────────────────────────────────
    // AC12a: NEVER writes to macro_targets — compute-on-read only.
    // AC7:   macro_targets base is stored unchanged; we derive per-day effective here.
    // AC8:   per-day navigation — computed from `date` (the currently displayed day).
    // AC9:   post-workout refresh — useFocusEffect triggers load() on screen re-focus,
    //        so if a workout is logged and user returns to nutrition, this re-classifies.
    // AC18:  today before workout → wasWorkoutDay() returns false → base/neutral target.
    if (t !== null) {
      try {
        const tdSettings = await getTrainingDaySettings();
        if (tdSettings.enabled) {
          const [isWorkoutDay, weightKg] = await Promise.all([
            wasWorkoutDay(ds),
            fetchWeightKg(),
          ]);
          const base: PureMacroTargets = {
            calories: t.calories,
            protein: t.protein,
            carbs: t.carbs,
            fat: t.fat,
          };
          const effective = computeEffectiveTargets(base, isWorkoutDay, {
            splitPercent: tdSettings.splitPercent,
            trainingDaysPerWeek: tdSettings.trainingDaysPerWeek,
          }, weightKg);

          // Set the effective targets as the displayed targets
          // (the DB macro_targets row remains unchanged — AC12a, AC7)
          setTargets({
            ...t,
            calories: effective.calories,
            protein: effective.protein,
            carbs: effective.carbs,
            fat: effective.fat,
          });
          setTrainingDayAdjustment({
            dayType: effective.dayType,
            baseCals: t.calories,
            adjusted: effective.adjusted,
            cappedByFloor: effective.cappedByFloor,
          });
        } else {
          // Feature disabled — show raw base targets, clear any previous badge state
          setTargets(t);
          setTrainingDayAdjustment(null);
        }
      } catch {
        // On any error in the adjustment path, fall back to showing base targets
        // without crashing the nutrition screen (AC5 / defensive programming).
        setTargets(t);
        setTrainingDayAdjustment(null);
      }
    } else {
      setTargets(t);
      setTrainingDayAdjustment(null);
    }
  }, [date]);

  useFocusEffect(
    useCallback(() => {
      load();
      if (add === "true") { setAddSheetVisible(true); router.setParams({ add: undefined }); }
    }, [load, add])
  );

  const prev = () => setDate((d) => new Date(d.getTime() - DAY_MS));
  const next = () => setDate((d) => new Date(d.getTime() + DAY_MS));

  const undo = useCallback(async () => {
    if (!deleted.current) return;
    clearTimeout(deleted.current.timer);
    const dl = deleted.current.log;
    await addDailyLog(dl.food_entry_id, dl.date, dl.meal, dl.servings);
    deleted.current = null;
    load();
  }, [load]);

  const remove = useCallback(async (log: DailyLog) => {
    if (deleted.current) clearTimeout(deleted.current.timer);
    await deleteDailyLog(log.id);
    deleted.current = { log, timer: setTimeout(() => { deleted.current = null; }, 4000) };
    info(`${log.food?.name ?? "Food"} removed`, { action: { label: "Undo", onPress: undo } });
    load();
  }, [info, undo, load]);

  // ── Hydration mutations ──────────────────────────────────────────────────
  const addWater = useCallback(async (amountMl: number) => {
    try {
      const ds = formatDateKey(date.getTime());
      await addWaterLog(ds, amountMl);
      await load();
    } catch {
      error("Couldn't save water log. Try again.");
    }
  }, [date, load, error]);

  const deleteWater = useCallback(async (id: string) => {
    try {
      await deleteWaterLog(id);
      await load();
    } catch {
      error("Couldn't remove water log. Try again.");
    }
  }, [load, error]);

  const updateWater = useCallback(async (id: string, amountMl: number) => {
    try {
      await updateWaterLog(id, amountMl);
      await load();
    } catch {
      error("Couldn't update water log. Try again.");
    }
  }, [load, error]);

  const sections = useMemo(() =>
    MEALS.map((m) => ({ title: MEAL_LABELS[m], meal: m, data: logs.filter((l) => l.meal === m) })).filter((s) => s.data.length > 0),
    [logs],
  );

  const handleSnack = useCallback((message: string, undoFn?: () => Promise<void>) => {
    info(message, { action: { label: "Undo", onPress: async () => { if (undoFn) await undoFn(); else await undo(); } } });
  }, [info, undo]);

  return {
    date, dateKey: formatDateKey(date.getTime()), logs, summary, targets,
    addSheetVisible, setAddSheetVisible,
    templateSheet, setTemplateSheet,
    sections, prev, next, remove, load, handleSnack,
    // hydration
    waterTotalMl, waterEntries, waterGoalMl, waterUnit, waterPresetsMl,
    addWater, deleteWater, updateWater,
    // Training-Day Macro Adjustment (AC8, AC9, AC12b)
    trainingDayAdjustment,
  };
}
