/**
 * BLD-1028: Inline editor for the pinned per-exercise note.
 *
 * Save semantics:
 *   - 600ms debounce on keystroke (handled by the parent via onDraftChange).
 *   - Immediate flush on onBlur (calls onSave).
 *   - AppState background/inactive flush is handled by useSessionActions.
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

const MAX_LENGTH = 500;

type Props = {
  exerciseId: string;
  exerciseName: string;
  value: string;
  onDraftChange: (exerciseId: string, text: string) => void;
  onSave: (exerciseId: string, text: string) => void;
};

export function PinnedExerciseNoteEditor({
  exerciseId,
  exerciseName,
  value,
  onDraftChange,
  onSave,
}: Props) {
  const colors = useThemeColors();
  return (
    <View style={styles.container}>
      <Input
        type="textarea"
        variant="outline"
        rows={4}
        placeholder="Add a pinned note…"
        placeholderTextColor={colors.onSurfaceVariant}
        value={value}
        onChangeText={(v) => onDraftChange(exerciseId, v)}
        onBlur={() => onSave(exerciseId, value)}
        maxLength={MAX_LENGTH}
        textAlignVertical="top"
        inputStyle={{ ...styles.input, color: colors.onSurface }}
        accessibilityLabel={`Edit pinned note for ${exerciseName}`}
      />
      <Text
        variant="caption"
        style={{ color: colors.onSurfaceVariant, textAlign: "right", fontSize: fontSizes.xs }}
      >
        {value.length}/{MAX_LENGTH}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 8, paddingBottom: 8, paddingTop: 4 },
  input: { fontSize: fontSizes.base, lineHeight: 22, minHeight: 100 },
});
