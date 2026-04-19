import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { useToast } from "@/components/ui/bna-toast";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import ExerciseForm from "../../../components/ExerciseForm";
import { getExerciseById, updateCustomExercise } from "../../../lib/db";
import { bumpQueryVersion } from "../../../lib/query";
import type { Exercise } from "../../../lib/types";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function EditExercise() {
  const colors = useThemeColors();
  const router = useRouter();
  const { success } = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [exercise, setExercise] = useState<Exercise | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (id) getExerciseById(id).then((e) => { if (!cancelled) setExercise(e); });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const save = useCallback(
    async (data: Omit<Exercise, "id" | "is_custom">) => {
      if (!id) return;
      await updateCustomExercise(id, data);
      bumpQueryVersion("exercises");
      bumpQueryVersion("session");
      success("Exercise updated");
      timer.current = setTimeout(() => router.back(), 400);
    },
    [id, router, success]
  );

  if (!exercise) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: "Edit Exercise" }} />
        <Text style={{ color: colors.onSurfaceVariant }}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: `Edit ${exercise.name}` }} />
      <ExerciseForm title="exercise" initial={exercise} onSave={save} />
    </View>
  );
}
