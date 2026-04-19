import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { DIFFICULTY_COLORS, READINESS_COLORS } from "./ui/flow-card-colors";
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
        const rc = READINESS_COLORS[readiness];
        const bg = isDark ? rc.darkBg : rc.lightBg;
        const fg = isDark ? rc.darkFg : rc.lightFg;
        return (
          <View style={[styles.badge, { backgroundColor: bg }]} accessibilityLabel={`Recovery status: ${readiness.toLowerCase()}`}>
            <Text variant="caption" style={[styles.badgeText, { color: fg }]}>{readiness}</Text>
          </View>
        );
      })()}
    </>
  );
}

export function MetaRow({ meta, colors }: { meta: MetaBadge[]; colors: ReturnType<typeof useThemeColors> }) {
  return (
    <>
      {meta.map((m, i) => {
        const dc = m.difficulty ? DIFFICULTY_COLORS[m.difficulty] : null;
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
