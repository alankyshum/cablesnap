import { useCallback, useMemo, useRef, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  getDailyLogs, getDailySummary, getMacroTargets, deleteDailyLog, addDailyLog,
  getDailyTotalMl, getWaterLogsForDate,
  addWaterLog, deleteWaterLog, updateWaterLog,
  getAppSetting,
} from "../lib/db";
import type { DailyLog, MacroTargets, Meal, WaterLog } from "../lib/types";
import { MEALS, MEAL_LABELS } from "../lib/types";
import { formatDateKey } from "../lib/format";
import type { HydrationUnit } from "../lib/hydration-units";
import { useToast } from "../components/ui/bna-toast";

const DAY_MS = 86_400_000;

const DEFAULT_GOAL_ML = 2000;
const DEFAULT_PRESETS_ML: [number, number, number] = [250, 500, 750];

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
    setLogs(l); setSummary(s); setTargets(t);
    setWaterTotalMl(wTot);
    setWaterEntries(wEntries);
    setWaterGoalMl(parseGoal(wGoal));
    setWaterUnit(parseUnit(wUnit));
    setWaterPresetsMl([
      parsePreset(p1, DEFAULT_PRESETS_ML[0]),
      parsePreset(p2, DEFAULT_PRESETS_ML[1]),
      parsePreset(p3, DEFAULT_PRESETS_ML[2]),
    ]);
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
  };
}
