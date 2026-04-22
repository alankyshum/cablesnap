import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Card } from "@/components/ui/card";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { PRStats } from "@/lib/db/pr-dashboard";

type Props = {
  stats: PRStats;
};

export default function PRStatsRow({ stats }: Props) {
  const colors = useThemeColors();

  return (
    <View style={styles.row} accessibilityRole="summary" accessibilityLabel={`${stats.totalPRs} total personal records, ${stats.prsThisMonth} this month`}>
      <Card style={[styles.statCard, { backgroundColor: colors.surface }]}>
        <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
          Total PRs
        </Text>
        <Text style={[styles.statValue, { color: colors.onSurface }]}>
          {stats.totalPRs}
        </Text>
      </Card>
      <Card style={[styles.statCard, { backgroundColor: colors.surface }]}>
        <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
          PRs This Month
        </Text>
        <Text style={[styles.statValue, { color: colors.onSurface }]}>
          {stats.prsThisMonth}
        </Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "700",
    marginTop: 4,
  },
});
