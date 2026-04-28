import React, { memo, useCallback, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii } from "@/constants/design-tokens";

type Props = {
  value: number | null;
  step: number;
  unit?: "kg" | "lb" | string;
  onValueChange: (val: number) => void;
  accessibilityLabel?: string;
  min?: number;
  max?: number;
};

function WeightPicker({ value, unit, onValueChange, accessibilityLabel, min = 0, max = 500 }: Props) {
  const colors = useThemeColors();
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "0");
  const displayValue = focused ? draft : (value != null ? String(value) : "0");

  const startEdit = useCallback(() => {
    setDraft(value != null ? String(value) : "");
    setFocused(true);
  }, [value]);

  const endEdit = useCallback(() => {
    const num = parseFloat(draft);
    if (!isNaN(num) && num >= min && num <= max) {
      const next = String(num);
      setDraft(next);
      onValueChange(num);
    } else {
      setDraft(value != null ? String(value) : "0");
    }
    setFocused(false);
  }, [draft, min, max, onValueChange, value]);

  return (
    <View style={[styles.container, { borderColor: focused ? colors.primary : colors.outlineVariant, backgroundColor: colors.surface }]}>
      <TextInput
        value={displayValue}
        onChangeText={setDraft}
        onFocus={startEdit}
        onBlur={endEdit}
        onSubmitEditing={endEdit}
        keyboardType="numeric"
        selectTextOnFocus
        style={[styles.input, { color: colors.onSurface }]}
        accessibilityLabel={accessibilityLabel}
      />
      {unit ? (
        <Text style={[styles.unitText, { color: colors.onSurfaceVariant }]}>
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

export default memo(WeightPicker);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 36,
  },
  input: {
    flex: 1,
    fontSize: fontSizes.base,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 2,
    paddingHorizontal: 0,
    minWidth: 32,
  },
  unitText: {
    fontSize: fontSizes.xs,
    marginLeft: 2,
  },
});
