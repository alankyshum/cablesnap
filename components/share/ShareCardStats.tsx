import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { spacing } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  duration: string;
  sets: number;
  volume: string;
  unit: string;
};

export function ShareCardStats({ duration, sets, volume, unit }: Props) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.statsContainer,
        { backgroundColor: colors.surfaceVariant },
      ]}
    >
      <View style={styles.statItem}>
        <Text style={[styles.statValue, { color: colors.onSurface }]}>
          {duration}
        </Text>
        <Text
          style={[styles.statLabel, { color: colors.onSurfaceVariant }]}
        >
          Duration
        </Text>
      </View>
      <View style={[styles.statDivider, { backgroundColor: colors.outline }]} />
      <View style={styles.statItem}>
        <Text style={[styles.statValue, { color: colors.onSurface }]}>
          {sets}
        </Text>
        <Text
          style={[styles.statLabel, { color: colors.onSurfaceVariant }]}
        >
          Sets
        </Text>
      </View>
      <View style={[styles.statDivider, { backgroundColor: colors.outline }]} />
      <View style={styles.statItem}>
        <Text style={[styles.statValue, { color: colors.onSurface }]}>
          {volume}
        </Text>
        <Text
          style={[styles.statLabel, { color: colors.onSurfaceVariant }]}
        >
          Volume ({unit})
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statsContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: fontSizes.xxl,
    fontWeight: "700",
    ...Platform.select({
      ios: { fontVariant: ["tabular-nums"] },
      android: { fontVariant: ["tabular-nums"] },
      default: {},
    }),
  },
  statLabel: {
    fontSize: fontSizes.sm,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    marginHorizontal: spacing.sm,
  },
});
