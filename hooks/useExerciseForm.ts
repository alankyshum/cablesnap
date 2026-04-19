/* eslint-disable max-lines-per-function, react-hooks/exhaustive-deps */
import { useCallback, useRef, useState } from "react";
import { Alert, Animated } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useToast } from "@/components/ui/bna-toast";
import {
  type Category,
  type Difficulty,
  type Equipment,
  type Exercise,
  type MuscleGroup,
} from "../lib/types";
import { parseExerciseDescription } from "../lib/exercise-nlp";
import { useThemeColors } from "@/hooks/useThemeColors";

const NL_EXAMPLES = [
  "incline dumbbell bench press",
  "barbell back squat",
  "cable lat pulldown",
  "bodyweight pull-ups",
  "kettlebell goblet squat",
  "seated dumbbell shoulder press",
];

type UseExerciseFormParams = {
  initial?: Exercise;
  onSave: (data: Omit<Exercise, "id" | "is_custom">) => Promise<void>;
  title: string;
};

export function useExerciseForm({ initial, onSave, title }: UseExerciseFormParams) {
  const colors = useThemeColors();
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<Category | null>(initial?.category ?? null);
  const [equipment, setEquipment] = useState<Equipment>(initial?.equipment ?? "bodyweight");
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? "beginner");
  const [primary, setPrimary] = useState<Set<MuscleGroup>>(
    new Set(initial?.primary_muscles ?? [])
  );
  const [secondary, setSecondary] = useState<Set<MuscleGroup>>(
    new Set(initial?.secondary_muscles ?? [])
  );
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; category?: string; muscles?: string }>({});

  const [nlInput, setNlInput] = useState("");
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());
  const [nlPlaceholderIdx] = useState(() => Math.floor(Math.random() * NL_EXAMPLES.length));
  const flashAnim = useRef(new Animated.Value(0)).current;

  const applyNlParse = useCallback(() => {
    const text = nlInput.trim();
    if (!text) return;

    const result = parseExerciseDescription(text);
    const filled = new Set<string>();

    if (result.name) {
      setName(result.name);
      filled.add("name");
    }
    if (result.category) {
      setCategory(result.category);
      filled.add("category");
    }
    if (result.equipment) {
      setEquipment(result.equipment);
      filled.add("equipment");
    }
    if (result.difficulty) {
      setDifficulty(result.difficulty);
      filled.add("difficulty");
    }
    if (result.primary_muscles.length > 0) {
      setPrimary(new Set(result.primary_muscles));
      filled.add("primary_muscles");
    }
    if (result.secondary_muscles.length > 0) {
      setSecondary(new Set(result.secondary_muscles));
      filled.add("secondary_muscles");
    }

    setAutoFilledFields(filled);
    setDirty(true);
    setErrors({});

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    flashAnim.setValue(1);
    Animated.timing(flashAnim, {
      toValue: 0,
      duration: 1200,
      useNativeDriver: false,
    }).start();

    const fieldCount = filled.size;
    toast.success(`Auto-filled ${fieldCount} field${fieldCount === 1 ? "" : "s"}`);
  }, [nlInput, flashAnim, toast]);

  const autoFillHighlight = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["transparent", colors.primaryContainer],
  });

  const toggleMuscle = useCallback(
    (set: Set<MuscleGroup>, setter: (s: Set<MuscleGroup>) => void, muscle: MuscleGroup) => {
      const next = new Set(set);
      if (next.has(muscle)) next.delete(muscle);
      else next.add(muscle);
      setter(next);
      setDirty(true);
    },
    []
  );

  const validate = useCallback(() => {
    const e: typeof errors = {};
    if (!name.trim()) e.name = "Name is required";
    if (!category) e.category = "Category is required";
    if (primary.size === 0) e.muscles = "Select at least one primary muscle";
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [name, category, primary]);

  const save = useCallback(async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        category: category!,
        equipment,
        difficulty,
        primary_muscles: Array.from(primary),
        secondary_muscles: Array.from(secondary),
        instructions: instructions.trim(),
      });
    } catch {
      toast.error("Failed to save exercise");
    } finally {
      setSaving(false);
    }
  }, [validate, onSave, name, category, equipment, difficulty, primary, secondary, instructions, toast]);

  const back = useCallback(() => {
    if (dirty) {
      Alert.alert("Discard changes?", "You have unsaved changes.", [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => router.back() },
      ]);
      return;
    }
    router.back();
  }, [dirty, router]);

  return {
    colors,
    name,
    setName,
    category,
    setCategory,
    equipment,
    setEquipment,
    difficulty,
    setDifficulty,
    primary,
    setPrimary,
    secondary,
    setSecondary,
    instructions,
    setInstructions,
    saving,
    dirty,
    setDirty,
    errors,
    setErrors,
    nlInput,
    setNlInput,
    autoFilledFields,
    nlPlaceholderIdx,
    nlExamples: NL_EXAMPLES,
    autoFillHighlight,
    applyNlParse,
    toggleMuscle,
    save,
    back,
    initial,
    title,
  };
}
