import React from "react";
import { Alert, StyleSheet, TouchableOpacity, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { toDisplay } from "@/lib/units";
import { radii, fontSizes, spacing } from "@/constants/design-tokens";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { StrengthGoalRow } from "@/lib/db";

type Props = {
  colors: ThemeColors;
  goal: StrengthGoalRow;
  currentBest: number | null;
  progressPct: number;
  isBodyweight: boolean;
  unit: "kg" | "lb";
  onEdit: () => void;
  onDelete: () => void;
  style?: object;
};

function AchievedCard({ colors, goal, targetDisplay, unitLabel, style }: {
  colors: ThemeColors; goal: StrengthGoalRow; targetDisplay: number; unitLabel: string; style?: object;
}) {
  const achievedDate = goal.achieved_at
    ? new Date(goal.achieved_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "";
  return (
    <Card style={[styles.card, style, { backgroundColor: colors.surface }]}>
      <CardContent style={styles.cardContent}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={{ color: colors.onSurface, fontSize: fontSizes.base, fontWeight: "600" }}>
              ✅ Achieved on {achievedDate}
            </Text>
          </View>
        </View>
        <Text style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.sm, marginTop: spacing.xs }}>
          Target: {targetDisplay} {unitLabel}
        </Text>
      </CardContent>
    </Card>
  );
}

export default function GoalProgressCard({
  colors, goal, currentBest, progressPct, isBodyweight, unit,
  onEdit, onDelete, style,
}: Props) {
  const target = isBodyweight ? goal.target_reps : goal.target_weight;
  const bestDisplay = isBodyweight
    ? (currentBest ?? 0)
    : toDisplay(currentBest ?? 0, unit);
  const targetDisplay = isBodyweight
    ? (target ?? 0)
    : toDisplay(target ?? 0, unit);
  const unitLabel = isBodyweight ? "reps" : unit;
  const clampedPct = Math.min(progressPct, 100);
  const isOverachieved = progressPct > 100;

  if (goal.achieved_at != null) {
    return <AchievedCard colors={colors} goal={goal} targetDisplay={targetDisplay} unitLabel={unitLabel} style={style} />;
  }

  const deadlinePassed = goal.deadline
    ? new Date(goal.deadline) < new Date()
    : false;

  const progressLabel = `Goal progress: ${bestDisplay} of ${targetDisplay} ${unitLabel}, ${progressPct} percent`;

  const confirmDelete = () => {
    Alert.alert(
      "Delete Goal",
      "Are you sure you want to delete this goal?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: onDelete },
      ],
    );
  };

  return (
    <Card
      style={[styles.card, style, { backgroundColor: colors.surface }]}
      accessibilityLabel={progressLabel}
    >
      <CardContent style={styles.cardContent}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <MaterialCommunityIcons
              name="bullseye-arrow"
              size={20}
              color={colors.primary}
            />
            <Text style={{ color: colors.onSurface, fontSize: fontSizes.base, fontWeight: "600", marginLeft: spacing.sm }}>
              Goal
            </Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onEdit}
              accessibilityLabel="Edit goal"
              accessibilityRole="button"
              hitSlop={8}
              style={styles.iconButton}
            >
              <MaterialCommunityIcons name="pencil" size={18} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmDelete}
              accessibilityLabel="Delete goal"
              accessibilityRole="button"
              hitSlop={8}
              style={styles.iconButton}
            >
              <MaterialCommunityIcons name="close" size={18} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Progress bar */}
        <View
          style={[styles.progressTrack, { backgroundColor: colors.outlineVariant }]}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: clampedPct }}
          accessibilityLabel={progressLabel}
        >
          <View
            style={[
              styles.progressFill,
              {
                width: `${clampedPct}%`,
                backgroundColor: isOverachieved ? colors.tertiary : colors.primary,
              },
            ]}
          />
        </View>

        {/* Stats line */}
        <View style={styles.statsRow}>
          <Text style={{ color: colors.onSurface, fontSize: fontSizes.sm }}>
            {bestDisplay} / {targetDisplay} {unitLabel} ({progressPct}%)
          </Text>
          {goal.deadline && (
            <Text style={{ color: deadlinePassed ? colors.error : colors.onSurfaceVariant, fontSize: fontSizes.xs }}>
              by {new Date(goal.deadline).toLocaleDateString(undefined, { year: "numeric", month: "short" })}
            </Text>
          )}
        </View>

        {isOverachieved && (
          <Text style={{ color: colors.tertiary, fontSize: fontSizes.xs, marginTop: spacing.xxs }}>
            You&apos;ve exceeded this goal! Consider setting a higher target.
          </Text>
        )}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    marginBottom: 8,
  },
  cardContent: {
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 4,
  },
  iconButton: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  progressTrack: {
    height: 10,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radii.pill,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
});
