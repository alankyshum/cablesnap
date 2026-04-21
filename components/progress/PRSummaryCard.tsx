import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useThemeColors } from "@/hooks/useThemeColors";
import { formatDateShort } from "@/lib/format";
import { toDisplay } from "@/lib/units";
import type { RecentPR, PRStats } from "@/lib/db/pr-dashboard";

type Props = {
  recentPRs: RecentPR[];
  stats: PRStats;
  weightUnit: "kg" | "lb";
  onSeeAll: () => void;
  style?: object;
};

export function PRSummaryCard({ recentPRs, stats, weightUnit, onSeeAll, style }: Props) {
  const colors = useThemeColors();

  return (
    <Card style={[styles.card, style]}>
      <View style={styles.headerRow}>
        <Text variant="subtitle" style={{ color: colors.onSurface }}>
          Personal Records
        </Text>
        {stats.prsThisMonth > 0 && (
          <Text variant="caption" style={{ color: colors.primary, fontWeight: "600" }}>
            {stats.prsThisMonth} this month
          </Text>
        )}
      </View>

      {recentPRs.length === 0 ? (
        <Text style={{ color: colors.onSurfaceVariant, marginTop: 8 }}>
          No records yet — start lifting!
        </Text>
      ) : (
        <>
          {recentPRs.slice(0, 3).map((pr) => (
            <View
              key={`${pr.exercise_id}-${pr.date}`}
              style={[styles.prRow, { borderBottomColor: colors.outlineVariant }]}
              accessibilityLabel={
                pr.is_weighted
                  ? `${pr.name}: ${pr.weight != null ? toDisplay(pr.weight, weightUnit) : '-'} ${weightUnit}, ${formatDateShort(pr.date)}`
                  : `${pr.name}: ${pr.reps} reps, ${formatDateShort(pr.date)}`
              }
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.onSurface }}>{pr.name}</Text>
                <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                  {formatDateShort(pr.date)}
                </Text>
              </View>
              <View style={styles.valueCol}>
                <Text style={{ color: colors.primary, fontWeight: "600" }}>
                  {pr.is_weighted && pr.weight != null
                    ? `${toDisplay(pr.weight, weightUnit)} ${weightUnit}`
                    : `${pr.reps} reps`}
                </Text>
                {pr.is_weighted && pr.weight != null && pr.previous_best != null && pr.previous_best > 0 && (
                  <Text variant="caption" style={{ color: colors.primary }}>
                    +{toDisplay(pr.weight - pr.previous_best, weightUnit)} {weightUnit}
                  </Text>
                )}
                {!pr.is_weighted && pr.reps != null && pr.previous_best != null && pr.previous_best > 0 && (
                  <Text variant="caption" style={{ color: colors.primary }}>
                    +{pr.reps - pr.previous_best} reps
                  </Text>
                )}
              </View>
            </View>
          ))}

          <Separator style={{ marginTop: 4 }} />

          <Pressable
            style={styles.seeAllRow}
            onPress={onSeeAll}
            accessibilityRole="button"
            accessibilityLabel="See all personal records"
          >
            <Text style={{ color: colors.primary, fontWeight: "600" }}>
              See All →
            </Text>
          </Pressable>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  prRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  valueCol: {
    alignItems: "flex-end",
  },
  seeAllRow: {
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
});
