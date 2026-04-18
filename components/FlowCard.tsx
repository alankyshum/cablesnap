import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Card, Text, useTheme } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { flowCardStyle } from "./ui/FlowContainer";
import type { Difficulty } from "../lib/types";
import { DIFFICULTY_LABELS } from "../lib/types";

const DIFFICULTY_COLORS: Record<Difficulty, { bg: string; fg: string }> = {
  beginner: { bg: "#D1FAE5", fg: "#065F46" },
  intermediate: { bg: "#FEF3C7", fg: "#92400E" },
  advanced: { bg: "#FEE2E2", fg: "#991B1B" },
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
  meta,
  action,
  accessibilityHint,
}: Props) {
  const theme = useTheme();

  const body = (
    <>
      <View style={styles.chipRow}>
        <Text
          variant="titleSmall"
          style={{ color: theme.colors.onSurface, flexShrink: 1 }}
          numberOfLines={1}
        >
          {name}
        </Text>
        {badges?.map((b) => {
          const bg =
            b.type === "active"
              ? theme.colors.primaryContainer
              : b.type === "recommended"
                ? theme.colors.primaryContainer
                : theme.colors.surfaceVariant;
          const fg =
            b.type === "active"
              ? theme.colors.onPrimaryContainer
              : b.type === "recommended"
                ? theme.colors.onPrimaryContainer
                : theme.colors.onSurfaceVariant;
          return (
            <View
              key={b.label}
              style={[styles.badge, { backgroundColor: bg }]}
              accessibilityLabel={b.label}
            >
              <Text style={[styles.badgeText, { color: fg }]}>{b.label}</Text>
            </View>
          );
        })}
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
                    dc?.bg ?? theme.colors.surfaceVariant,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={m.icon}
                size={14}
                color={dc?.fg ?? theme.colors.onSurfaceVariant}
              />
              <Text
                style={[
                  styles.badgeText,
                  { color: dc?.fg ?? theme.colors.onSurfaceVariant },
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

  const hasInteractiveAction = !!action && action !== null;

  return (
    <Card
      style={[styles.card, { backgroundColor: theme.colors.surface }]}
      onPress={hasInteractiveAction ? undefined : onPress}
      onLongPress={hasInteractiveAction ? undefined : onLongPress}
      accessibilityLabel={hasInteractiveAction ? undefined : accessibilityLabel}
      accessibilityRole={hasInteractiveAction ? undefined : "button"}
    >
      <Card.Content style={styles.content}>
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
      </Card.Content>
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
