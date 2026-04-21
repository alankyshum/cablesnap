import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { spacing, fontSizes } from "@/constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useColorScheme } from "@/hooks/useColorScheme";

export type MonthlyShareCardProps = {
  monthLabel: string;
  sessionCount: number;
  volume: string;
  unit: string;
  prCount: number;
  longestStreak: number;
};

const CARD_WIDTH = 1080;

function StatBlock({ label, value }: { label: string; value: string }) {
  const colors = useThemeColors();
  return (
    <View
      style={shareStyles.statBlock}
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={[shareStyles.statBlockValue, { color: colors.onSurface }]}>
        {value}
      </Text>
      <Text style={[shareStyles.statBlockLabel, { color: colors.onSurfaceVariant }]}>
        {label}
      </Text>
    </View>
  );
}

export default function MonthlyShareCard({
  monthLabel,
  sessionCount,
  volume,
  unit,
  prCount,
  longestStreak,
}: MonthlyShareCardProps) {
  const colors = useThemeColors();
  const isDark = useColorScheme() === "dark";

  return (
    <View
      style={[
        shareStyles.card,
        {
          width: CARD_WIDTH,
          backgroundColor: colors.surface,
          borderColor: isDark ? colors.outline : "transparent",
          borderWidth: isDark ? 1 : 0,
        },
      ]}
    >
      {/* Header */}
      <View style={shareStyles.header}>
        <MaterialCommunityIcons
          name="dumbbell"
          size={32}
          color={colors.primary}
        />
        <Text style={[shareStyles.brandText, { color: colors.primary }]}>
          CableSnap
        </Text>
      </View>

      {/* Month title */}
      <Text
        style={[shareStyles.monthTitle, { color: colors.onSurface }]}
        accessibilityLabel={`Monthly report for ${monthLabel}`}
      >
        {monthLabel}
      </Text>
      <Text style={[shareStyles.subtitle, { color: colors.onSurfaceVariant }]}>
        Monthly Training Report
      </Text>

      {/* Stats grid */}
      <View style={shareStyles.statsGrid}>
        <StatBlock label="Workouts" value={String(sessionCount)} />
        <StatBlock label={`Volume (${unit})`} value={volume} />
        <StatBlock label="PRs" value={String(prCount)} />
        <StatBlock label="Best Streak" value={`${longestStreak}d`} />
      </View>

      {/* Footer */}
      <View
        style={[shareStyles.footer, { borderTopColor: colors.outlineVariant }]}
      >
        <Text
          style={[shareStyles.footerText, { color: colors.onSurfaceVariant }]}
        >
          cablesnap.app
        </Text>
      </View>
    </View>
  );
}

const shareStyles = StyleSheet.create({
  card: {
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xxl,
    borderRadius: 24,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  brandText: {
    fontSize: fontSizes.xxl,
    fontWeight: "700",
  },
  monthTitle: {
    fontSize: fontSizes.stat,
    fontWeight: "800",
    lineHeight: 44,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSizes.lg,
    marginBottom: spacing.xl,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  statBlock: {
    alignItems: "center",
    minWidth: 200,
    gap: spacing.xxs,
  },
  statBlockValue: {
    fontSize: fontSizes.stat,
    fontWeight: "800",
  },
  statBlockLabel: {
    fontSize: fontSizes.lg,
    fontWeight: "500",
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: spacing.lg,
    alignItems: "center",
  },
  footerText: {
    fontSize: fontSizes.sm,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
});
