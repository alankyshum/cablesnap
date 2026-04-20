import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useActiveGoals } from "@/hooks/useStrengthGoals";
import { getCurrentBestWeight, getCurrentBestReps, type StrengthGoalRow } from "@/lib/db";
import { getExerciseById } from "@/lib/db";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { radii, fontSizes, spacing } from "@/constants/design-tokens";

type GoalSummary = {
  goal: StrengthGoalRow;
  exerciseName: string;
  progressPct: number;
};

export default function ActiveGoalsCard() {
  const colors = useThemeColors();
  const router = useRouter();
  const { goals, isLoading } = useActiveGoals();
  const [summaries, setSummaries] = useState<GoalSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (goals.length === 0) {
        setSummaries([]);
        return;
      }
      (async () => {
        const results: GoalSummary[] = [];
        // Only show first 3
        for (const goal of goals.slice(0, 3)) {
          try {
            const exercise = await getExerciseById(goal.exercise_id);
            if (!exercise) continue;
            const isBodyweight = goal.target_reps != null && goal.target_weight == null;
            const best = isBodyweight
              ? await getCurrentBestReps(goal.exercise_id)
              : await getCurrentBestWeight(goal.exercise_id);
            const target = isBodyweight ? (goal.target_reps ?? 0) : (goal.target_weight ?? 0);
            const pct = target > 0 && best != null ? Math.round((best / target) * 100) : 0;
            results.push({
              goal,
              exerciseName: exercise.name,
              progressPct: pct,
            });
          } catch {
            // skip if exercise deleted
          }
        }
        setSummaries(results);
      })();
    }, [goals]),
  );

  if (isLoading || summaries.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="bullseye-arrow" size={18} color={colors.primary} />
        <Text variant="subtitle" style={{ color: colors.onSurface, marginLeft: spacing.sm }}>
          Active Goals
        </Text>
      </View>
      {summaries.map((s) => (
        <Pressable
          key={s.goal.id}
          onPress={() => router.push(`/exercise/${s.goal.exercise_id}`)}
          accessibilityLabel={`${s.exerciseName} goal: ${s.progressPct} percent complete`}
          accessibilityRole="button"
          style={styles.goalRow}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.onSurface, fontSize: fontSizes.sm }} numberOfLines={1}>
              {s.exerciseName}
            </Text>
            <View style={[styles.miniTrack, { backgroundColor: colors.outlineVariant }]}>
              <View
                style={[
                  styles.miniFill,
                  {
                    width: `${Math.min(s.progressPct, 100)}%`,
                    backgroundColor: s.progressPct > 100 ? colors.tertiary : colors.primary,
                  },
                ]}
              />
            </View>
          </View>
          <Text style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.xs, marginLeft: spacing.sm }}>
            {s.progressPct}%
          </Text>
        </Pressable>
      ))}
      {goals.length > 3 && (
        <Text style={{ color: colors.primary, fontSize: fontSizes.xs, marginTop: spacing.xs, textAlign: "center" }}>
          +{goals.length - 3} more
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  miniTrack: {
    height: 6,
    borderRadius: radii.pill,
    overflow: "hidden",
    marginTop: 4,
  },
  miniFill: {
    height: "100%",
    borderRadius: radii.pill,
  },
});
