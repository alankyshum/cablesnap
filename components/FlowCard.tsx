import React from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { Text } from "@/components/ui/text";
import { Card } from "@/components/ui/card";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { flowCardStyle } from "./ui/FlowContainer";
import type { Difficulty } from "../lib/types";
import { DIFFICULTY_LABELS } from "../lib/types";
import type { ReadinessBadge } from "../lib/recovery-readiness";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useColorScheme } from "@/hooks/useColorScheme";

const DIFFICULTY_COLORS: Record<Difficulty, { bg: string; fg: string }> = {
  beginner: { bg: "#D1FAE5", fg: "#065F46" },
  intermediate: { bg: "#FEF3C7", fg: "#92400E" },
  advanced: { bg: "#FEE2E2", fg: "#991B1B" },
};

const READINESS_COLORS: Record<Exclude<ReadinessBadge, "NO_DATA">, { lightBg: string; lightFg: string; darkBg: string; darkFg: string }> = {
  READY: { lightBg: "#D1FAE5", lightFg: "#065F46", darkBg: "#064E3B", darkFg: "#A7F3D0" },
  PARTIAL: { lightBg: "#FEF3C7", lightFg: "#92400E", darkBg: "#5C3D00", darkFg: "#FDE68A" },
  REST: { lightBg: "#FEE2E2", lightFg: "#991B1B", darkBg: "#7F1D1D", darkFg: "#FECACA" },
};

export type MetaBadge = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  difficulty?: Difficulty;
};

type Props = {
  name: string;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
  badges?: { label: string; type: "active" | "starter" | "recommended" }[];
  readiness?: ReadinessBadge | null;
  meta: MetaBadge[];
  action: React.ReactNode;
  accessibilityHint?: string;
};

export function FlowCard({
  name,
  onPress,
  onLongPress,
  accessibilityLabel,
  badges,
  readiness,
  meta,
  action,
  accessibilityHint,
}: Props) {
  const colors = useThemeColors();
  const isDark = useColorScheme() === "dark";

  const body = (
    <>
      <View style={styles.chipRow}>
        <Text
          variant="body"
          style={{ color: colors.onSurface, flexShrink: 1, fontWeight: "600", fontSize: 14 }}
          numberOfLines={1}
        >
          {name}
        </Text>
        {badges?.map((b) => {
          const bg =
            b.type === "active"
              ? colors.primaryContainer
              : b.type === "recommended"
                ? colors.primaryContainer
                : colors.surfaceVariant;
          const fg =
            b.type === "active"
              ? colors.onPrimaryContainer
              : b.type === "recommended"
                ? colors.onPrimaryContainer
                : colors.onSurfaceVariant;
          return (
            <View
              key={b.label}
              style={[styles.badge, { backgroundColor: bg }]}
              accessibilityLabel={b.label}
            >
              <Text variant="caption" style={[styles.badgeText, { color: fg }]}>{b.label}</Text>
            </View>
          );
        })}
        {readiness && readiness !== "NO_DATA" && (() => {
          const rc = READINESS_COLORS[readiness];
          const bg = isDark ? rc.darkBg : rc.lightBg;
          const fg = isDark ? rc.darkFg : rc.lightFg;
          return (
            <View
              style={[styles.badge, { backgroundColor: bg }]}
              accessibilityLabel={`Recovery status: ${readiness.toLowerCase()}`}
            >
              <Text variant="caption" style={[styles.badgeText, { color: fg }]}>{readiness}</Text>
            </View>
          );
        })()}
      </View>
      <View style={styles.metaRow}>
        {meta.map((m, i) => {
          const dc = m.difficulty ? DIFFICULTY_COLORS[m.difficulty] : null;
          return (
            <View
              key={i}
              style={[
                styles.metaBadge,
                {
                  backgroundColor:
                    dc?.bg ?? colors.surfaceVariant,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={m.icon}
                size={14}
                color={dc?.fg ?? colors.onSurfaceVariant}
              />
              <Text
                variant="caption"
                style={[
                  styles.badgeText,
                  { color: dc?.fg ?? colors.onSurfaceVariant },
                ]}
              >
                {m.label}
              </Text>
            </View>
          );
        })}
      </View>
    </>
  );

  return (
    <Card
      style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface }]) as ViewStyle}
    >
      <View style={styles.content}>
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          style={styles.body}
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          accessibilityRole="button"
        >
          {body}
        </Pressable>
        {action}
      </View>
    </Card>
  );
}

export function difficultyBadge(difficulty: Difficulty): MetaBadge {
  return {
    icon: "signal-cellular-2",
    label: DIFFICULTY_LABELS[difficulty],
    difficulty,
  };
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 8,
    ...flowCardStyle,
    flexGrow: 0,
    padding: 12,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  body: {
    flex: 1,
    gap: 6,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  badge: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 8,
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
});
