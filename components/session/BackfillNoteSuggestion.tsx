/**
 * BLD-1028: Backfill suggestion chip.
 *
 * Shown when exercises.notes is NULL AND notes_backfill_dismissed_at is NULL
 * AND a recent workout_sets.notes entry exists for this exercise.
 *
 * "Copy" — copies candidate text to the pinned note field and dismisses.
 * "Dismiss" — dismisses without copying.
 * Either action sets notes_backfill_dismissed_at so the prompt never re-shows.
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  exerciseId: string;
  exerciseName: string;
  candidateText: string;
  candidateDate: number;
  onCopy: (exerciseId: string, text: string) => void;
  onDismiss: (exerciseId: string) => void;
};

export function BackfillNoteSuggestion({
  exerciseId,
  exerciseName,
  candidateText,
  candidateDate,
  onCopy,
  onDismiss,
}: Props) {
  const colors = useThemeColors();
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(candidateDate));

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceVariant, borderColor: colors.outlineVariant }]}>
      <View style={styles.headerRow}>
        <MaterialCommunityIcons name="lightbulb-on-outline" size={16} color={colors.primary} />
        <Text style={[styles.headerText, { color: colors.primary }]}>
          Session note from {dateLabel}
        </Text>
      </View>
      <Text
        style={[styles.candidateText, { color: colors.onSurfaceVariant }]}
        numberOfLines={2}
        accessibilityLabel={`Previous session note for ${exerciseName}: ${candidateText}`}
      >
        {candidateText}
      </Text>
      <View style={styles.actions}>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => onCopy(exerciseId, candidateText)}
          accessibilityLabel={`Pin this note for ${exerciseName}`}
        >
          <Text style={{ color: colors.primary, fontSize: fontSizes.sm, fontWeight: "600" }}>
            📌 Pin note
          </Text>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => onDismiss(exerciseId)}
          accessibilityLabel={`Dismiss note suggestion for ${exerciseName}`}
        >
          <Text style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.sm }}>
            Dismiss
          </Text>
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginHorizontal: 8,
    marginBottom: 8,
    gap: 6,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerText: { fontSize: fontSizes.sm, fontWeight: "600" },
  candidateText: { fontSize: fontSizes.sm, lineHeight: 18 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 4, marginTop: 2 },
});
