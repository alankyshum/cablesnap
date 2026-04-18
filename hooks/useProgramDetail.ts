import { useCallback, useState } from "react";
import { Alert } from "react-native";
import type { Router } from "expo-router";
import {
  getProgramById,
  getProgramDays,
  getProgramCycleCount,
  getProgramHistory,
  getProgramSchedule,
  setProgramScheduleDay,
  clearProgramSchedule,
  activateProgram,
  deactivateProgram,
  softDeleteProgram,
  removeProgramDay,
  reorderProgramDays,
} from "@/lib/programs";
import { duplicateProgram, getTemplates, getAppSetting } from "@/lib/db";
import { scheduleReminders } from "@/lib/notifications";
import type { Program, ProgramDay, WorkoutTemplate } from "@/lib/types";
import type { ScheduleEntry } from "@/lib/db/settings";

export type HistoryEntry = {
  session_id: string;
  day_label: string;
  template_name: string | null;
  completed_at: number;
};

export function dateStr(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function dayName(day: ProgramDay) {
  return day.label || day.template_name || "Deleted Template";
}

export function useProgramDetail({ id, router }: { id: string | undefined; router: Router }) {
  const [program, setProgram] = useState<Program | null>(null);
  const [days, setDays] = useState<ProgramDay[]>([]);
  const [cycle, setCycle] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [picker, setPicker] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [prog, d, c, h, sched, tpls] = await Promise.all([
        getProgramById(id),
        getProgramDays(id),
        getProgramCycleCount(id),
        getProgramHistory(id, 10),
        getProgramSchedule(id),
        getTemplates(),
      ]);
      setProgram(prog);
      setDays(d);
      setCycle(c);
      setHistory(h);
      setSchedule(sched);
      setTemplates(tpls);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const toggle = async () => {
    if (!program) return;
    try {
      setLoading(true);
      if (program.is_active) {
        await deactivateProgram(program.id);
      } else {
        if (days.length === 0) {
          Alert.alert("Cannot Activate", "Add at least one day to this program.");
          return;
        }
        await activateProgram(program.id);
      }
      await load();
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = () => {
    if (!program) return;
    Alert.alert(
      "Delete Program",
      `Delete "${program.name}"? Past workout data will be preserved.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await softDeleteProgram(program.id);
            router.back();
          },
        },
      ]
    );
  };

  const remove = async (dayId: string) => {
    await removeProgramDay(dayId);
    await load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    if (!program) return;
    const target = index + dir;
    if (target < 0 || target >= days.length) return;
    const ids = days.map((d) => d.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await reorderProgramDays(program.id, ids);
    await load();
  };

  const handleDuplicate = async () => {
    if (!program) return;
    const newId = await duplicateProgram(program.id);
    router.replace(`/program/${newId}`);
  };

  const rescheduleNotifications = async () => {
    try {
      const enabled = await getAppSetting("reminders_enabled");
      if (enabled !== "true") return;
      const raw = await getAppSetting("reminder_time");
      const [h, m] = (raw ?? "08:00").split(":").map(Number);
      await scheduleReminders({ hour: h, minute: m });
    } catch {
      // non-critical
    }
  };

  const assignDay = async (day: number, tpl: WorkoutTemplate | null) => {
    setPicker(null);
    if (!program) return;
    try {
      await setProgramScheduleDay(program.id, day, tpl?.id ?? null);
      const sched = await getProgramSchedule(program.id);
      setSchedule(sched);
      if (program.is_active) await rescheduleNotifications();
    } catch {
      Alert.alert("Error", "Couldn't update schedule.");
    }
  };

  const confirmClearSchedule = () => {
    if (!program) return;
    Alert.alert(
      "Clear Schedule",
      "Clear the weekly schedule for this program?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await clearProgramSchedule(program.id);
              setSchedule([]);
              if (program.is_active) await rescheduleNotifications();
            } catch {
              Alert.alert("Error", "Couldn't clear schedule.");
            }
          },
        },
      ]
    );
  };

  const schedEntry = (day: number) => schedule.find((s) => s.day_of_week === day);

  return {
    program,
    days,
    cycle,
    history,
    schedule,
    templates,
    picker,
    setPicker,
    loading,
    load,
    toggle,
    confirmDelete,
    remove,
    move,
    handleDuplicate,
    assignDay,
    confirmClearSchedule,
    schedEntry,
  };
}
