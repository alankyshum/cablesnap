import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { spacing } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { ShareCardExercise, ShareCardPR } from "../ShareCard";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  exercises: ShareCardExercise[];
  prs: ShareCardPR[];
  maxExercises?: number;
};

export function ShareCardExercises({
  exercises,
  prs,
  maxExercises = 6,
}: Props) {
  const colors = useThemeColors();
  const displayExercises = exercises.slice(0, maxExercises);
  const remaining = exercises.length - maxExercises;

  return (
    <>
      {/* PRs */}
      {prs.length > 0 && (
        <View
          style={[
            styles.prSection,
            { backgroundColor: colors.primaryContainer },
          ]}
        >
          <View style={styles.prHeader}>
            <Text
              style={[styles.prTitle, { color: colors.onPrimaryContainer }]}
            >
              🏆 New PRs
            </Text>
          </View>
          {prs.map((pr, i) => (
            <View key={i} style={styles.prRow}>
              <Text
                style={[styles.prName, { color: colors.onPrimaryContainer }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {pr.name}
              </Text>
              <Text
                style={[styles.prValue, { color: colors.onPrimaryContainer }]}
              >
                {pr.value}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Exercises */}
      {displayExercises.length > 0 && (
        <View style={styles.exerciseSection}>
          <Text
            style={[
              styles.exerciseSectionTitle,
              { color: colors.onSurfaceVariant },
            ]}
          >
            Exercises
          </Text>
          {displayExercises.map((ex, i) => (
            <View key={i} style={styles.exerciseRow}>
              <Text
                style={[
                  styles.exerciseName,
                  { color: colors.onSurface },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {ex.name}
              </Text>
              <Text
                style={[
                  styles.exerciseDetail,
                  { color: colors.onSurfaceVariant },
                ]}
              >
                {ex.weight
                  ? `${ex.sets}×${ex.reps} @ ${ex.weight}`
                  : `${ex.sets}×${ex.reps}`}
              </Text>
            </View>
          ))}
          {remaining > 0 && (
            <Text
              style={[
                styles.moreText,
                { color: colors.onSurfaceVariant },
              ]}
            >
              and {remaining} more
            </Text>
          )}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  prSection: {
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  prHeader: {
    marginBottom: spacing.sm,
  },
  prTitle: {
    fontSize: fontSizes.lg,
    fontWeight: "700",
  },
  prRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  prName: {
    fontSize: fontSizes.base,
    fontWeight: "500",
    flex: 1,
    marginRight: spacing.sm,
  },
  prValue: {
    fontSize: fontSizes.base,
    fontWeight: "700",
  },
  exerciseSection: {
    marginBottom: spacing.lg,
  },
  exerciseSectionTitle: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  exerciseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs + 2,
  },
  exerciseName: {
    fontSize: fontSizes.base,
    fontWeight: "500",
    flex: 1,
    marginRight: spacing.sm,
  },
  exerciseDetail: {
    fontSize: fontSizes.sm,
    fontWeight: "500",
  },
  moreText: {
    fontSize: fontSizes.sm,
    fontStyle: "italic",
    marginTop: spacing.xs,
  },
});
