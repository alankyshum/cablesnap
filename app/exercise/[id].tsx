import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Chip, Text, useTheme } from "react-native-paper";
import { Stack, useLocalSearchParams } from "expo-router";
import { getExerciseById } from "../../lib/db";
import { CATEGORY_LABELS, type Exercise } from "../../lib/types";
import { semantic } from "../../constants/theme";

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: semantic.beginner,
  intermediate: semantic.intermediate,
  advanced: semantic.advanced,
};

export default function ExerciseDetail() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [exercise, setExercise] = useState<Exercise | null>(null);

  useEffect(() => {
    if (id) getExerciseById(id).then(setExercise);
  }, [id]);

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
      <Stack.Screen options={{ title: exercise.name }} />
      <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.content}>
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
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
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
