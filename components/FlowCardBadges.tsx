import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  useDifficultyBadgeColors,
  useReadinessBadgeColors,
} from "./ui/flow-card-colors";
import type { ReadinessBadge } from "../lib/recovery-readiness";
import type { MetaBadge } from "./FlowCard";
import type { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

export function BadgeRow({ badges, readiness, isDark, colors }: {
  badges?: { label: string; type: "active" | "starter" | "recommended" }[];
  readiness?: ReadinessBadge | null;
  isDark: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const readinessColors = useReadinessBadgeColors();
  void isDark;
  return (
    <>
      {badges?.map((b) => {
        const bg = b.type === "active" || b.type === "recommended" ? colors.primaryContainer : colors.surfaceVariant;
        const fg = b.type === "active" || b.type === "recommended" ? colors.onPrimaryContainer : colors.onSurfaceVariant;
        return (
          <View key={b.label} style={[styles.badge, { backgroundColor: bg }]} accessibilityLabel={b.label}>
            <Text variant="caption" style={[styles.badgeText, { color: fg }]}>{b.label}</Text>
          </View>
        );
      })}
      {readiness && readiness !== "NO_DATA" && (() => {
        const rc = readinessColors[readiness];
        return (
          <View style={[styles.badge, { backgroundColor: rc.bg }]} accessibilityLabel={`Recovery status: ${readiness.toLowerCase()}`}>
            <Text variant="caption" style={[styles.badgeText, { color: rc.fg }]}>{readiness}</Text>
          </View>
        );
      })()}
    </>
  );
}

export function MetaRow({ meta, colors }: { meta: MetaBadge[]; colors: ReturnType<typeof useThemeColors> }) {
  const difficultyColors = useDifficultyBadgeColors();
  return (
    <>
      {meta.map((m, i) => {
        const dc = m.difficulty ? difficultyColors[m.difficulty] : null;
        return (
          <View key={i} style={[styles.metaBadge, { backgroundColor: dc?.bg ?? colors.surfaceVariant }]}>
            <MaterialCommunityIcons name={m.icon} size={14} color={dc?.fg ?? colors.onSurfaceVariant} />
            <Text variant="caption" style={[styles.badgeText, { color: dc?.fg ?? colors.onSurfaceVariant }]}>{m.label}</Text>
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  badge: { height: 24, paddingHorizontal: 10, borderRadius: 8, justifyContent: "center" },
  badgeText: { fontSize: fontSizes.xs, lineHeight: 16 },
  metaBadge: { flexDirection: "row", alignItems: "center", gap: 4, height: 24, paddingHorizontal: 8, borderRadius: 8 },
});
