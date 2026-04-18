import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";
import { useToast } from "@/components/ui/bna-toast";
import {
  getBodySettings,
  getLatestBodyWeight,
  getPreviousBodyWeight,
  getBodyWeightEntries,
  getBodyWeightCount,
  getBodyWeightChartData,
  getLatestMeasurements,
  upsertBodyWeight,
  deleteBodyWeight,
  updateBodySettings,
} from "../lib/db";
import type { BodyWeight, BodySettings, BodyMeasurements } from "../lib/types";
import { toKg } from "../lib/units";

const PAGE_SIZE = 20;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useBodyMetrics() {
  const { info: toastInfo } = useToast();

  const [settings, setSettings] = useState<BodySettings | null>(null);
  const [latest, setLatest] = useState<BodyWeight | null>(null);
  const [previous, setPrevious] = useState<BodyWeight | null>(null);
  const [entries, setEntries] = useState<BodyWeight[]>([]);
  const [total, setTotal] = useState(0);
  const [chart, setChart] = useState<{ date: string; weight: number }[]>([]);
  const [measurements, setMeasurements] = useState<BodyMeasurements | null>(null);
  const [modal, setModal] = useState(false);
  const undoRef = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  const [logWeight, setLogWeight] = useState("");
  const [logDate, setLogDate] = useState(today());
  const [logNotes, setLogNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const unit = settings?.weight_unit ?? "kg";

  const loadBody = useCallback(async () => {
    const [s, l, p, c, cnt, m] = await Promise.all([
      getBodySettings(),
      getLatestBodyWeight(),
      getPreviousBodyWeight(),
      getBodyWeightChartData(),
      getBodyWeightCount(),
      getLatestMeasurements(),
    ]);
    setSettings(s);
    setLatest(l);
    setPrevious(p);
    setChart(c);
    setTotal(cnt);
    setMeasurements(m);
    const e = await getBodyWeightEntries(PAGE_SIZE, 0);
    setEntries(e);
  }, []);

  const doSave = useCallback(
    async (kg: number) => {
      setSaving(true);
      try {
        await upsertBodyWeight(kg, logDate, logNotes);
        setModal(false);
        setLogWeight("");
        setLogDate(today());
        setLogNotes("");
        await loadBody();
      } finally {
        setSaving(false);
      }
    },
    [logDate, logNotes, loadBody],
  );

  const handleSave = useCallback(async () => {
    const val = parseFloat(logWeight);
    if (isNaN(val) || val <= 0) return;

    const kg = toKg(val, settings?.weight_unit ?? "kg");

    if (kg > 300) {
      Alert.alert(
        "Unusual Weight",
        `${val} ${settings?.weight_unit ?? "kg"} seems high. Save anyway?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Save", onPress: () => doSave(kg) },
        ],
      );
      return;
    }

    if (logDate > today()) {
      Alert.alert("Future Date", "This date is in the future. Save anyway?", [
        { text: "Cancel", style: "cancel" },
        { text: "Save", onPress: () => doSave(kg) },
      ]);
      return;
    }

    await doSave(kg);
  }, [logWeight, logDate, settings, doSave]);

  const handleUndo = useCallback(() => {
    if (!undoRef.current) return;
    clearTimeout(undoRef.current.timer);
    undoRef.current = null;
    loadBody();
  }, [loadBody]);

  const handleDelete = useCallback(
    async (item: BodyWeight) => {
      if (undoRef.current) {
        clearTimeout(undoRef.current.timer);
        await deleteBodyWeight(undoRef.current.id);
        undoRef.current = null;
      }
      const filtered = entries.filter((e) => e.id !== item.id);
      setEntries(filtered);
      const timer = setTimeout(async () => {
        await deleteBodyWeight(item.id);
        undoRef.current = null;
        await loadBody();
      }, 3000);

      undoRef.current = { id: item.id, timer };

      toastInfo("Entry deleted", {
        action: { label: "Undo", onPress: handleUndo },
      });
    },
    [entries, loadBody, handleUndo, toastInfo],
  );

  const loadMore = useCallback(async () => {
    if (entries.length >= total) return;
    const more = await getBodyWeightEntries(PAGE_SIZE, entries.length);
    setEntries([...entries, ...more]);
  }, [entries, total]);

  const toggleUnit = useCallback(async () => {
    if (!settings) return;
    const next = unit === "kg" ? "lb" : "kg";
    await updateBodySettings(
      next,
      settings.measurement_unit,
      settings.weight_goal,
      settings.body_fat_goal,
    );
    await loadBody();
  }, [unit, settings, loadBody]);

  return {
    settings,
    latest,
    previous,
    entries,
    total,
    chart,
    measurements,
    modal,
    setModal,
    logWeight,
    setLogWeight,
    logDate,
    setLogDate,
    logNotes,
    setLogNotes,
    saving,
    unit,
    loadBody,
    handleSave,
    handleDelete,
    loadMore,
    toggleUnit,
  };
}
