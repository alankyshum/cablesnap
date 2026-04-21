import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Separator } from "@/components/ui/separator";
import { useThemeColors } from "@/hooks/useThemeColors";
import { formatDateShort } from "@/lib/format";
import { toDisplay } from "@/lib/units";
import type { RecentPR } from "@/lib/db/pr-dashboard";

type Props = {
  prs: RecentPR[];
  weightUnit: "kg" | "lb";
  onPressExercise: (exerciseId: string) => void;
};

function formatDelta(pr: RecentPR, unit: "kg" | "lb"): string {
  if (pr.is_weighted && pr.weight != null && pr.previous_best != null) {
    const delta = toDisplay(pr.weight - pr.previous_best, unit);
    return `+${delta} ${unit}`;
  }
  if (!pr.is_weighted && pr.reps != null && pr.previous_best != null) {
    const delta = pr.reps - pr.previous_best;
    return `+${delta} reps`;
  }
  return "";
}

function formatValue(pr: RecentPR, unit: "kg" | "lb"): string {
  if (pr.is_weighted && pr.weight != null) {
    return `${toDisplay(pr.weight, unit)} ${unit}`;
  }
  if (!pr.is_weighted && pr.reps != null) {
    return `${pr.reps} reps`;
  }
  return "-";
}

export default function RecentPRList({ prs, weightUnit, onPressExercise }: Props) {
  const colors = useThemeColors();

  if (prs.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text
        variant="subtitle"
        style={[styles.sectionTitle, { color: colors.onSurface }]}
        accessibilityRole="header"
      >
        Recent PRs
      </Text>
      {prs.map((pr, i) => (
        <React.Fragment key={`${pr.exercise_id}-${pr.date}`}>
          <Pressable
            style={styles.prRow}
            onPress={() => onPressExercise(pr.exercise_id)}
            accessibilityRole="button"
            accessibilityLabel={`${pr.name}: ${formatValue(pr, weightUnit)}, ${formatDelta(pr, weightUnit)}, ${formatDateShort(pr.date)}`}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.onSurface }}>{pr.name}</Text>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                {formatDateShort(pr.date)}
              </Text>
            </View>
            <View style={styles.valueCol}>
              <Text style={{ color: colors.onSurface, fontWeight: "600" }}>
                {formatValue(pr, weightUnit)}
              </Text>
              {formatDelta(pr, weightUnit) ? (
                <Text variant="caption" style={{ color: colors.primary, fontWeight: "600" }}>
                  {formatDelta(pr, weightUnit)}
                </Text>
              ) : null}
            </View>
          </Pressable>
          {i < prs.length - 1 && <Separator style={{ marginVertical: 2 }} />}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  prRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    minHeight: 48,
  },
  valueCol: {
    alignItems: "flex-end",
  },
});
