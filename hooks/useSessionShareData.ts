import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Share } from "react-native";
import BottomSheet from "@gorhom/bottom-sheet";
import type { ShareCardExercise, ShareCardPR } from "@/components/ShareCard";
import { toDisplay } from "@/lib/units";
import { formatTime } from "@/lib/format";
import { getBodySettings } from "@/lib/db";
import type { ExerciseGroup } from "@/hooks/useSessionDetail";

type SessionLike = {
  name?: string | null;
  started_at?: number | null;
  duration_seconds?: number | null;
};

type PR = { name: string; weight: number };

export function useSessionShareData(
  session: SessionLike | null,
  groups: ExerciseGroup[],
  prs: PR[],
  completedSetCount: number,
) {
  const shareSheetRef = useRef<BottomSheet>(null);
  const [unit, setUnit] = useState<"kg" | "lb">("kg");

  useEffect(() => {
    getBodySettings()
      .then((s) => setUnit(s.weight_unit as "kg" | "lb"))
      .catch(() => {});
  }, []);

  const duration = session?.duration_seconds ? formatTime(session.duration_seconds) : "0:00";
  const volumeRaw = groups.reduce((sum, g) => {
    for (const s of g.sets) {
      if (s.completed) sum += (s.weight ?? 0) * (s.reps ?? 0);
    }
    return sum;
  }, 0);
  const volumeDisplay = toDisplay(volumeRaw, unit);

  const sessionStartedAt = session?.started_at;
  const shareCardDate = useMemo(() => {
    if (!sessionStartedAt) return "";
    return new Date(sessionStartedAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, [sessionStartedAt]);

  const shareCardPrs = useMemo(
    (): ShareCardPR[] =>
      prs.map((pr) => ({ name: pr.name, value: `${toDisplay(pr.weight, unit)} ${unit}` })),
    [prs, unit],
  );

  const shareCardExercises = useMemo((): ShareCardExercise[] => {
    return groups.map((g) => {
      const done = g.sets.filter((s) => s.completed);
      const maxW = Math.max(0, ...done.map((s) => s.weight ?? 0));
      const reps = done.length > 0 ? (done[0].reps ?? 0) : 0;
      return {
        name: g.name,
        sets: done.length,
        reps: String(reps),
        weight: maxW > 0 ? `${toDisplay(maxW, unit)} ${unit}` : undefined,
      };
    });
  }, [groups, unit]);

  const handleShareButtonPress = useCallback(() => {
    shareSheetRef.current?.snapToIndex(0);
  }, []);

  const handleShareText = useCallback(async () => {
    if (!session) return;
    const lines = [
      `\u{1F3CB}\u{FE0F} ${session.name ?? "Workout"} Complete!`,
      `Duration: ${duration}`,
      `Sets: ${completedSetCount}`,
      `Volume: ${volumeDisplay.toLocaleString()} ${unit}`,
    ];
    if (prs.length > 0) {
      lines.push("", "\u{1F3C6} New PRs:");
      for (const pr of prs) lines.push(`  ${pr.name}: ${toDisplay(pr.weight, unit)} ${unit}`);
    }
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {
      /* cancelled */
    }
  }, [session, duration, completedSetCount, volumeDisplay, unit, prs]);

  return {
    shareSheetRef,
    unit,
    duration,
    volumeDisplay,
    shareCardDate,
    shareCardPrs,
    shareCardExercises,
    handleShareButtonPress,
    handleShareText,
  };
}
