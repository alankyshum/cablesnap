import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Snackbar, Text, useTheme } from "react-native-paper";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import ExerciseForm from "../../../components/ExerciseForm";
import { getExerciseById, updateCustomExercise } from "../../../lib/db";
import type { Exercise } from "../../../lib/types";

export default function EditExercise() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (id) getExerciseById(id).then(setExercise);
  }, [id]);

  const save = useCallback(
    async (data: Omit<Exercise, "id" | "is_custom">) => {
      if (!id) return;
      await updateCustomExercise(id, data);
      setToast("Exercise updated");
      setTimeout(() => router.back(), 400);
    },
    [id, router]
  );

  if (!exercise) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background }}>
        <Stack.Screen options={{ title: "Edit Exercise" }} />
        <Text style={{ color: theme.colors.onSurfaceVariant }}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ title: `Edit ${exercise.name}` }} />
      <ExerciseForm title="exercise" initial={exercise} onSave={save} />
      <Snackbar visible={!!toast} onDismiss={() => setToast("")} duration={2000}>
        {toast}
      </Snackbar>
    </View>
  );
}
