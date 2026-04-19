import { useCallback } from "react";
import { Stack, useRouter } from "expo-router";
import { useToast } from "@/components/ui/bna-toast";
import { View } from "react-native";
import ExerciseForm from "../../components/ExerciseForm";
import { createCustomExercise } from "../../lib/db";
import { bumpQueryVersion } from "../../lib/query";
import type { Exercise } from "../../lib/types";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function CreateExercise() {
  const colors = useThemeColors();
  const router = useRouter();
  const { success } = useToast();

  const save = useCallback(
    async (data: Omit<Exercise, "id" | "is_custom">) => {
      await createCustomExercise(data);
      bumpQueryVersion("exercises");
      bumpQueryVersion("session");
      success("Exercise created");
      setTimeout(() => router.back(), 400);
    },
    [router, success]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "New Exercise" }} />
      <ExerciseForm title="exercise" onSave={save} />
    </View>
  );
}
