import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { Chip, IconButton, Snackbar, Text, useTheme } from "react-native-paper";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  getExerciseById,
  softDeleteCustomExercise,
  getTemplatesUsingExercise,
} from "../../lib/db";
import { CATEGORY_LABELS, type Exercise } from "../../lib/types";
import { semantic } from "../../constants/theme";

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: semantic.beginner,
  intermediate: semantic.intermediate,
  advanced: semantic.advanced,
};

export default function ExerciseDetail() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (id) getExerciseById(id).then(setExercise);
  }, [id]);

  const edit = useCallback(() => {
    if (id) router.push(`/exercise/edit/${id}`);
  }, [id, router]);

  const remove = useCallback(async () => {
    if (!id || !exercise) return;
    const templates = await getTemplatesUsingExercise(id);
    const msg = templates.length > 0
      ? `Delete ${exercise.name}? This exercise is used in ${templates.length} template(s). It will be removed from those templates.`
      : `Delete ${exercise.name}? This exercise will be removed from the library.`;
    Alert.alert("Delete Exercise", msg, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await softDeleteCustomExercise(id);
            setToast("Exercise deleted");
            setTimeout(() => router.back(), 400);
          } catch {
            setToast("Failed to delete exercise");
          }
        },
      },
    ]);
  }, [id, exercise, router]);

  if (!exercise) {
    return (
      <>
        <Stack.Screen options={{ title: "Exercise" }} />
        <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>Loading...</Text>
        </View>
      </>
    );
  }

  const steps = exercise.instructions
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <>
      <Stack.Screen
        options={{
          title: exercise.name,
          headerRight: exercise.is_custom
            ? () => (
                <View style={styles.headerActions}>
                  <IconButton
                    icon="pencil"
                    size={22}
                    onPress={edit}
                    accessibilityLabel="Edit exercise"
                  />
                  <IconButton
                    icon="delete"
                    size={22}
                    onPress={remove}
                    accessibilityLabel="Delete exercise"
                  />
                </View>
              )
            : undefined,
        }}
      />
      <ScrollView style={[styles.scrollContainer, { backgroundColor: theme.colors.background }]}>
        <View style={styles.content}>
          {/* Custom badge */}
          {exercise.is_custom && (
            <Chip
              compact
              style={[styles.customBadge, { backgroundColor: theme.colors.tertiaryContainer }]}
              textStyle={{ fontSize: 12 }}
            >
              Custom
            </Chip>
          )}

          {/* Category & Difficulty */}
          <View style={styles.row}>
            <Chip
              compact
              style={{ backgroundColor: theme.colors.primaryContainer }}
              textStyle={{ color: theme.colors.onPrimaryContainer }}
            >
              {CATEGORY_LABELS[exercise.category]}
            </Chip>
            <Chip
              compact
              style={[styles.difficultyChip, { backgroundColor: DIFFICULTY_COLORS[exercise.difficulty] }]}
              textStyle={styles.difficultyText}
            >
              {exercise.difficulty}
            </Chip>
          </View>

          {/* Equipment */}
          <View style={styles.section}>
            <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
              Equipment
            </Text>
            <Text variant="bodyLarge" style={[styles.value, { color: theme.colors.onSurface }]}>
              {exercise.equipment}
            </Text>
          </View>

          {/* Primary Muscles */}
          <View style={styles.section}>
            <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
              Primary Muscles
            </Text>
            <View style={styles.chipRow}>
              {exercise.primary_muscles.map((m) => (
                <Chip
                  key={m}
                  compact
                  style={[styles.muscleChip, { backgroundColor: theme.colors.secondaryContainer }]}
                >
                  {m}
                </Chip>
              ))}
            </View>
          </View>

          {/* Secondary Muscles */}
          {exercise.secondary_muscles.length > 0 && (
            <View style={styles.section}>
              <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
                Secondary Muscles
              </Text>
              <View style={styles.chipRow}>
                {exercise.secondary_muscles.map((m) => (
                  <Chip
                    key={m}
                    compact
                    style={[styles.muscleChip, { backgroundColor: theme.colors.tertiaryContainer }]}
                  >
                    {m}
                  </Chip>
                ))}
              </View>
            </View>
          )}

          {/* Instructions */}
          {steps.length > 0 && (
            <View style={styles.section}>
              <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
                Instructions
              </Text>
              {steps.map((step, i) => (
                <Text
                  key={i}
                  variant="bodyMedium"
                  style={[styles.step, { color: theme.colors.onSurface }]}
                >
                  {step}
                </Text>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Snackbar visible={!!toast} onDismiss={() => setToast("")} duration={3000}>
        {toast}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  headerActions: {
    flexDirection: "row",
  },
  customBadge: {
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  section: {
    marginBottom: 20,
  },
  value: {
    marginTop: 4,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  muscleChip: {
    marginBottom: 2,
  },
  difficultyChip: {
    borderRadius: 16,
  },
  difficultyText: {
    color: semantic.onSemantic,
    fontWeight: "600",
  },
  step: {
    marginTop: 6,
    lineHeight: 22,
  },
});
