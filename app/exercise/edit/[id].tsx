import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Snackbar, Text } from "react-native-paper";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import ExerciseForm from "../../../components/ExerciseForm";
import { getExerciseById, updateCustomExercise } from "../../../lib/db";
import type { Exercise } from "../../../lib/types";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function EditExercise() {
  const colors = useThemeColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [toast, setToast] = useState("");

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
      setToast("Exercise updated");
      timer.current = setTimeout(() => router.back(), 400);
    },
    [id, router]
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
      <Snackbar visible={!!toast} onDismiss={() => setToast("")} duration={2000}>
        {toast}
      </Snackbar>
    </View>
  );
}
