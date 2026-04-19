import { useCallback, useMemo, useRef, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { getDailyLogs, getDailySummary, getMacroTargets, deleteDailyLog, addDailyLog } from "../lib/db";
import type { DailyLog, MacroTargets, Meal } from "../lib/types";
import { MEALS, MEAL_LABELS } from "../lib/types";
import { formatDateKey } from "../lib/format";
import { useToast } from "../components/ui/bna-toast";

const DAY_MS = 86_400_000;

export function useNutritionData() {
  const [date, setDate] = useState(new Date());
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [summary, setSummary] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [targets, setTargets] = useState<MacroTargets | null>(null);
  const { info } = useToast();
  const deleted = useRef<{ log: DailyLog; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [templateSheet, setTemplateSheet] = useState<{ visible: boolean; meal: Meal; items: DailyLog[] }>({
    visible: false, meal: "breakfast", items: [],
  });
  const { add } = useLocalSearchParams<{ add?: string }>();

  const load = useCallback(async () => {
    const ds = formatDateKey(date.getTime());
    const [l, s, t] = await Promise.all([getDailyLogs(ds), getDailySummary(ds), getMacroTargets()]);
    setLogs(l); setSummary(s); setTargets(t);
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
  };
}
