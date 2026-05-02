import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useToast } from "@/components/ui/bna-toast";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  addExerciseToTemplate,
  createExerciseLink,
  duplicateTemplate,
  getTemplateById,
  getTemplateExerciseCount,
  removeExerciseFromTemplate,
  reorderTemplateExercises,
  unlinkExerciseGroup,
  unlinkSingleExercise,
  updateTemplateExercise,
  updateTemplateName,
} from "@/lib/db";
import type { Exercise, SetType, TemplateExercise, WorkoutTemplate } from "@/lib/types";

export function linkLabel(exercises: TemplateExercise[], linkId: string, idx: number): string {
  const count = exercises.filter((e) => e.link_id === linkId).length;
  const custom = exercises.find((e) => e.link_id === linkId && e.link_label)?.link_label;
  if (custom) return custom;
  const letter = String.fromCharCode(65 + idx);
  return count >= 3 ? `Circuit ${letter}` : `Superset ${letter}`;
}

type Router = { back(): void; replace(href: string): void; push(href: string): void };

export function useTemplateEditor({ id, router }: { id: string | undefined; router: Router }) {
  const colors = useThemeColors();
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [exercises, setExercises] = useState<TemplateExercise[]>([]);
  const [name, setName] = useState<string>("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [, setUndo] = useState<(() => Promise<void>) | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateExercise | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { success, error: showError } = useToast();

  const linkIds = useMemo(() => {
    const ids: string[] = [];
    for (const e of exercises) {
      if (e.link_id && !ids.includes(e.link_id)) ids.push(e.link_id);
    }
    return ids;
  }, [exercises]);

  const palette = useMemo(
    () => [colors.tertiary, colors.secondary, colors.primary, colors.error, colors.inversePrimary],
    [colors],
  );

  const load = useCallback(async () => {
    if (!id) return;
    const tpl = await getTemplateById(id);
    if (tpl) {
      setTemplate(tpl);
      setExercises(tpl.exercises ?? []);
      setName((current) => (current === "" ? tpl.name : current));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (id) load();
    }, [id, load])
  );

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  const remove = useCallback(async (teId: string) => {
    await removeExerciseFromTemplate(teId);
    await load();
  }, [load]);

  const move = useCallback(async (index: number, dir: -1 | 1) => {
    if (!id) return;
    const target = index + dir;
    if (target < 0 || target >= exercises.length) return;
    const ids = exercises.map((e) => e.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await reorderTemplateExercises(id, ids);
    await load();
  }, [id, exercises, load]);

  const toggleSelect = (teId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(teId)) next.delete(teId);
      else next.add(teId);
      return next;
    });
  };

  const startSelection = (preselect?: string) => {
    setSelecting(true);
    setSelected(preselect ? new Set([preselect]) : new Set());
  };

  const cancelSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const confirmLink = async () => {
    if (!id || selected.size < 2) return;
    const linkId = await createExerciseLink(id, [...selected]);
    setSelecting(false);
    setSelected(new Set());
    await load();
    const undoFn = async () => {
      await unlinkExerciseGroup(linkId);
      await load();
    };
    setUndo(() => undoFn);
    success("Exercises linked as superset", {
      action: {
        label: "Undo",
        onPress: async () => {
          await undoFn();
          setUndo(null);
        },
      },
    });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      setUndo(null);
    }, 5000);
  };

  const handleUnlink = useCallback(async (linkId: string) => {
    await unlinkExerciseGroup(linkId);
    await load();
    const prev = exercises.filter((e) => e.link_id === linkId).map((e) => e.id);
    const undoFn = async () => {
      if (id) {
        await createExerciseLink(id, prev);
        await load();
      }
    };
    setUndo(() => undoFn);
    success("Exercises unlinked", {
      action: {
        label: "Undo",
        onPress: async () => {
          await undoFn();
          setUndo(null);
        },
      },
    });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      setUndo(null);
    }, 5000);
  }, [exercises, id, load, success]);

  const handleUnlinkSingle = useCallback(async (teId: string, linkIdVal: string) => {
    await unlinkSingleExercise(teId, linkIdVal);
    await load();
  }, [load]);

  const handlePickExercise = useCallback(async (exercise: Exercise) => {
    if (!id) return;
    setPickerOpen(false);
    const count = await getTemplateExerciseCount(id);
    await addExerciseToTemplate(id, exercise.id, count);
    await load();
  }, [id, load]);

  const handleEditSave = useCallback(async (sets: number, reps: string, rest: number, setTypes: SetType[]) => {
    if (!editing || !id) return;
    try {
      await updateTemplateExercise(editing.id, id, sets, reps, rest, setTypes);
      setEditing(null);
      await load();
    } catch {
      showError("Failed to update exercise settings");
    }
  }, [editing, id, load, showError]);

  const handleDuplicate = async () => {
    if (!template) return;
    const newId = await duplicateTemplate(template.id);
    router.replace(`/template/${newId}`);
  };

  const validateName = useCallback((value: string): string | null => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return "Template name is required.";
    if (trimmed.length > 100) return "Template name must be 100 characters or fewer.";
    return null;
  }, []);

  const handleNameChange = useCallback((value: string) => {
    setName(value);
    // Clear error eagerly when user starts typing again
    if (nameError) setNameError(null);
  }, [nameError]);

  const handleNameBlur = useCallback(async () => {
    if (!template) return;
    const trimmed = name.trim();
    const err = validateName(name);
    if (err) {
      setNameError(err);
      return;
    }
    setNameError(null);
    if (trimmed === template.name) return;
    try {
      await updateTemplateName(template.id, trimmed);
      // Reflect persisted value (including trim) locally so the header title updates.
      setTemplate({ ...template, name: trimmed, updated_at: Date.now() });
      setName(trimmed);
    } catch {
      setNameError("Failed to save name. Please try again.");
      showError("Failed to update template name");
    }
  }, [template, name, validateName, showError]);

  return {
    template,
    exercises,
    name,
    nameError,
    selecting,
    selected,
    pickerOpen,
    editing,
    linkIds,
    palette,
    colors,
    setPickerOpen,
    setEditing,
    load,
    remove,
    move,
    toggleSelect,
    startSelection,
    cancelSelection,
    confirmLink,
    handleUnlink,
    handleUnlinkSingle,
    handlePickExercise,
    handleEditSave,
    handleDuplicate,
    handleNameChange,
    handleNameBlur,
  };
}
