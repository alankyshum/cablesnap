import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { Exercise } from "../../lib/types";
import { EQUIPMENT_LABELS, DIFFICULTY_LABELS, MUSCLE_LABELS } from "../../lib/types";
import type { SubstitutionScore } from "../../lib/exercise-substitutions";
import { radii } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";

export function matchColor(score: number): string {
  if (score >= 80) return "#2e7d32";
  if (score >= 60) return "#f57f17";
  return "#c62828";
}

export function matchBgColor(score: number): string {
  if (score >= 80) return "#e8f5e9";
  if (score >= 60) return "#fff8e1";
  return "#ffebee";
}

export function SubstitutionItem({
  item,
  onPress,
}: {
  item: SubstitutionScore;
  onPress: (exercise: Exercise) => void;
}) {
  const colors = useThemeColors();
  const ex = item.exercise;

  return (
    <Pressable
      style={[styles.item, { backgroundColor: colors.surface }]}
      onPress={() => onPress(ex)}
      accessibilityRole="button"
      accessibilityLabel={`${ex.name}, ${item.score}% match, ${EQUIPMENT_LABELS[ex.equipment]}, ${DIFFICULTY_LABELS[ex.difficulty]}`}
    >
      <View style={styles.itemHeader}>
        <Text
          variant="body"
          numberOfLines={1}
          style={[styles.itemName, { color: colors.onSurface, fontWeight: "600" }]}
        >
          {ex.name}
        </Text>
        <View
          style={[
            styles.matchBadge,
            { backgroundColor: matchBgColor(item.score) },
          ]}
        >
          <Text variant="caption" style={[styles.matchText, { color: matchColor(item.score) }]}>
            {item.score}%
          </Text>
        </View>
      </View>
      <View style={styles.itemMeta}>
        <View
          style={[
            styles.equipBadge,
            { backgroundColor: colors.surfaceVariant },
          ]}
        >
          <Text variant="caption"
            style={[styles.equipText, { color: colors.onSurfaceVariant }]}
          >
            {EQUIPMENT_LABELS[ex.equipment]}
          </Text>
        </View>
        <View
          style={[
            styles.equipBadge,
            { backgroundColor: colors.surfaceVariant },
          ]}
        >
          <Text variant="caption"
            style={[styles.equipText, { color: colors.onSurfaceVariant }]}
          >
            {DIFFICULTY_LABELS[ex.difficulty]}
          </Text>
        </View>
      </View>
      {ex.primary_muscles.length > 0 && (
        <View style={styles.muscleRow}>
          {ex.primary_muscles.map((m) => (
            <View
              key={m}
              style={[
                styles.muscleChip,
                { backgroundColor: colors.secondaryContainer },
              ]}
            >
              <Text variant="caption"
                style={[
                  styles.muscleText,
                  { color: colors.onSecondaryContainer },
                ]}
              >
                {MUSCLE_LABELS[m]}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    padding: 12,
    borderRadius: radii.md,
    marginBottom: 8,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  itemName: {
    flex: 1,
    fontWeight: "600",
    marginRight: 8,
  },
  matchBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  matchText: {
    fontWeight: "700",
  },
  itemMeta: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 4,
  },
  equipBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  equipText: {
  },
  muscleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 8,
  },
  muscleChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  muscleText: {
    lineHeight: 16,
  },
});
