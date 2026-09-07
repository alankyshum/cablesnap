import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, spacing } from "@/constants/design-tokens";
import { t } from "@/lib/i18n";
import type { CoachWorkoutDraftReason } from "@/lib/types";

export function CoachWorkoutDraftReasons({ reasons }: { reasons: unknown[] }) {
  const colors = useThemeColors();
  const safe = reasons.filter((reason): reason is CoachWorkoutDraftReason => {
    if (!reason || typeof reason !== "object") return false;
    const value = reason as Record<string, unknown>;
    return ["input", "source", "rule", "bound", "fallback", "uncertainty", "override"].every((key) => value[key] == null || typeof value[key] === "string")
      && Boolean(value.input ?? value.source ?? value.rule);
  });
  if (!safe.length) return null;
  return (
    <View testID="coach-workout-draft-reasons" accessibilityRole="summary" style={[styles.container, { borderTopColor: colors.outlineVariant }]}>
      <Text style={[styles.heading, { color: colors.onSurface }]}>{t({ id: "components.coach.draftReasonsTitle", message: "Why this draft" })}</Text>
      {safe.map((reason, index) => {
        const detail = [reason.input ?? reason.source, reason.rule, reason.bound, reason.fallback, reason.uncertainty].filter(Boolean).join(" · ");
        return <Text key={`${index}-${detail}`} style={[styles.reason, { color: colors.onSurfaceVariant }]}>{`${index + 1}. ${detail || t({ id: "components.coach.draftReasonFallback", message: "Bounded local workout rules" })}`}</Text>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: 1, marginTop: spacing.sm, paddingTop: spacing.sm, gap: spacing.xs },
  heading: { fontSize: fontSizes.sm, fontWeight: "700" },
  reason: { fontSize: fontSizes.xs, lineHeight: 18 },
});
