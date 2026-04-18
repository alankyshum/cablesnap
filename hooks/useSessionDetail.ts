import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useToast } from "@/components/ui/bna-toast";
import {
  createTemplateFromSession,
  getActiveSession,
  getSessionById,
  getSessionPRs,
  getSessionSetCount,
  getSessionSets,
  startSession,
  updateSession,
} from "@/lib/db";
import type { WorkoutSession, WorkoutSet } from "@/lib/types";
import { useThemeColors } from "@/hooks/useThemeColors";

export type SetWithName = WorkoutSet & {
  exercise_name?: string;
  exercise_deleted?: boolean;
  swapped_from_name?: string;
};

export type ExerciseGroup = {
  exercise_id: string;
  name: string;
  sets: SetWithName[];
  link_id: string | null;
  swapped_from_name: string | null;
};

export function useSessionDetail(id: string | undefined) {
  const colors = useThemeColors();
  const router = useRouter();
  const { toast } = useToast();

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [groups, setGroups] = useState<ExerciseGroup[]>([]);
  const [prs, setPrs] = useState<{ exercise_id: string; name: string; weight: number; previous_max: number }[]>([]);
  const [rating, setRating] = useState<number | null>(null);
  const [notesText, setNotesText] = useState("");
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [completedSetCount, setCompletedSetCount] = useState(0);
  const [saving, setSaving] = useState(false);

  const linkIds = useMemo(() => {
    const ids: string[] = [];
    for (const g of groups) {
      if (g.link_id && !ids.includes(g.link_id)) ids.push(g.link_id);
    }
    return ids;
  }, [groups]);

  const palette = useMemo(
    () => [colors.tertiary, colors.secondary, colors.primary, colors.error, colors.inversePrimary],
    [colors],
  );

  useEffect(() => {
    if (!id) return;
    (async () => {
      const sess = await getSessionById(id);
      if (!sess) return;
      setSession(sess);
      setRating(sess.rating ?? null);
      setNotesText(sess.notes ?? "");
      setNotesExpanded(!!(sess.notes && sess.notes.length > 0));

      const [sets, prData, setCount] = await Promise.all([
        getSessionSets(id),
        getSessionPRs(id),
        getSessionSetCount(id),
      ]);
      setPrs(prData);
      setCompletedSetCount(setCount);
      const map = new Map<string, ExerciseGroup>();
      for (const s of sets) {
        if (!map.has(s.exercise_id)) {
          map.set(s.exercise_id, {
            exercise_id: s.exercise_id,
            name: (s.exercise_name ?? "Unknown") + (s.exercise_deleted ? " (removed)" : ""),
            sets: [],
            link_id: s.link_id ?? null,
            swapped_from_name: (s as SetWithName).swapped_from_name ?? null,
          });
        }
        map.get(s.exercise_id)!.sets.push(s);
      }
      setGroups([...map.values()]);
    })();
  }, [id]);

  const volume = useCallback(() => {
    let total = 0;
    for (const g of groups) {
      for (const s of g.sets) {
        if (s.completed && s.weight && s.reps) {
          total += s.weight * s.reps;
        }
      }
    }
    return total;
  }, [groups]);

  const completedSets = useCallback(() => {
    let count = 0;
    for (const g of groups) {
      for (const s of g.sets) {
        if (s.completed) count++;
      }
    }
    return count;
  }, [groups]);

  const handleRatingChange = useCallback(async (newRating: number | null) => {
    if (!id) return;
    const previousRating = rating;
    setRating(newRating);
    try {
      await updateSession(id, { rating: newRating });
    } catch {
      setRating(previousRating);
      toast({ description: "Failed to save rating" });
    }
  }, [id, rating, toast]);

  const handleNotesSave = useCallback(async () => {
    if (!id) return;
    try {
      await updateSession(id, { notes: notesText });
    } catch {
      toast({ description: "Failed to save notes" });
    }
  }, [id, notesText, toast]);

  const handleSaveAsTemplate = useCallback(async () => {
    if (!id || saving) return;
    setSaving(true);
    try {
      const truncatedName = templateName.slice(0, 100).trim() || "Untitled Template";
      await createTemplateFromSession(id, truncatedName);
      setTemplateModalVisible(false);
      toast({ description: "Template saved!" });
    } catch {
      toast({ description: "Failed to save template" });
    } finally {
      setSaving(false);
    }
  }, [id, templateName, saving, toast]);

  const handleRepeatWorkout = useCallback(() => {
    if (!id || !session) return;
    const doRepeat = async () => {
      try {
        const active = await getActiveSession();
        if (active) {
          Alert.alert(
            "Active Workout",
            "You have an active workout. Finish or cancel it first."
          );
          return;
        }
        const newSession = await startSession(null, session.name);
        router.push(`/session/${newSession.id}?sourceSessionId=${id}`);
      } catch {
        toast({ description: "Failed to start repeated workout" });
      }
    };

    Alert.alert(
      "Repeat Workout?",
      `Start a new session with the same exercises and target weights from ${session.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Repeat", style: "default", onPress: doRepeat },
      ]
    );
  }, [id, session, router, toast]);

  const openTemplateModal = useCallback(() => {
    if (!session) return;
    setTemplateName((session.name ?? "").slice(0, 100));
    setTemplateModalVisible(true);
  }, [session]);

  const closeTemplateModal = useCallback(() => {
    setTemplateModalVisible(false);
  }, []);

  return {
    session,
    groups,
    prs,
    rating,
    notesText,
    setNotesText,
    notesExpanded,
    setNotesExpanded,
    templateModalVisible,
    templateName,
    setTemplateName,
    completedSetCount,
    saving,
    linkIds,
    palette,
    volume,
    completedSets,
    handleRatingChange,
    handleNotesSave,
    handleSaveAsTemplate,
    handleRepeatWorkout,
    openTemplateModal,
    closeTemplateModal,
    colors,
  };
}
