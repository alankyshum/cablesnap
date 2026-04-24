import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  exerciseId: string;
  value: string;
  onDraftChange: (exerciseId: string, text: string) => void;
  onSave: (exerciseId: string, text: string) => void;
};

export function ExerciseNotesPanel({ exerciseId, value, onDraftChange, onSave }: Props) {
  const colors = useThemeColors();
  return (
    <View style={styles.container}>
      <Input
        type="textarea"
        rows={3}
        placeholder="Add exercise notes..."
        placeholderTextColor={colors.onSurfaceVariant}
        value={value}
        onChangeText={(v) => onDraftChange(exerciseId, v)}
        onBlur={() => onSave(exerciseId, value)}
        maxLength={200}
        textAlignVertical="top"
        inputStyle={{ ...styles.input, color: colors.onSurface }}
        accessibilityLabel="Exercise notes"
      />
      <Text variant="caption" style={{ color: colors.onSurfaceVariant, textAlign: "right", fontSize: fontSizes.xs }}>
        {value.length}/200
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 8, paddingBottom: 8, paddingTop: 4 },
  input: { fontSize: fontSizes.base, minHeight: 96 },
});
