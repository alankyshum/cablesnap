import { useCallback, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { Snackbar, useTheme } from "react-native-paper";
import { View } from "react-native";
import ExerciseForm from "../../components/ExerciseForm";
import { createCustomExercise } from "../../lib/db";
import type { Exercise } from "../../lib/types";

export default function CreateExercise() {
  const theme = useTheme();
  const router = useRouter();
  const [toast, setToast] = useState("");

  const save = useCallback(
    async (data: Omit<Exercise, "id" | "is_custom">) => {
      await createCustomExercise(data);
      setToast("Exercise created");
      setTimeout(() => router.back(), 400);
    },
    [router]
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ title: "New Exercise" }} />
      <ExerciseForm title="exercise" onSave={save} />
      <Snackbar visible={!!toast} onDismiss={() => setToast("")} duration={2000}>
        {toast}
      </Snackbar>
    </View>
  );
}
