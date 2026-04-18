import React, { memo, useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, TextInput } from "react-native-paper";
import * as Haptics from "expo-haptics";
import { useThemeColors } from "@/hooks/useThemeColors";

type Props = {
  value: number | null;
  step: number;
  unit?: "kg" | "lb" | string;
  onValueChange: (val: number) => void;
  accessibilityLabel?: string;
  min?: number;
  max?: number;
};

function WeightPicker({ value, step, unit, onValueChange, accessibilityLabel, min = 0, max = 500 }: Props) {
  const colors = useThemeColors();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const increment = useCallback(() => {
    const next = Math.min(max, Math.round(((value ?? 0) + step) * 10) / 10);
    onValueChange(next);
    Haptics.selectionAsync();
  }, [value, step, max, onValueChange]);

  const decrement = useCallback(() => {
    const next = Math.max(min, Math.round(((value ?? 0) - step) * 10) / 10);
    onValueChange(next);
    Haptics.selectionAsync();
  }, [value, step, min, onValueChange]);

  const startRepeat = useCallback((fn: () => void) => {
    if (repeatRef.current) clearInterval(repeatRef.current);
    repeatRef.current = setInterval(fn, 120);
  }, []);

  const stopRepeat = useCallback(() => {
    if (repeatRef.current) {
      clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
  }, []);

  const startEdit = useCallback(() => {
    setDraft(value != null ? String(value) : "");
    setEditing(true);
  }, [value]);

  const endEdit = useCallback(() => {
    setEditing(false);
    const num = parseFloat(draft);
    if (!isNaN(num) && num >= min && num <= max) {
      onValueChange(num);
    }
  }, [draft, min, max, onValueChange]);

  const display = value != null ? String(value) : "—";

  return (
    <View style={styles.container}>
      <Pressable
        onPress={decrement}
        onLongPress={() => startRepeat(decrement)}
        onPressOut={stopRepeat}
        style={[styles.stepBtn, { backgroundColor: colors.surfaceVariant }]}
        accessibilityLabel={`Decrease weight by ${step}`}
        accessibilityRole="button"
      >
        <Text style={[styles.stepText, { color: colors.onSurfaceVariant }]}>−</Text>
      </Pressable>

      {editing ? (
        <TextInput
          mode="flat"
          dense
          value={draft}
          onChangeText={setDraft}
          onBlur={endEdit}
          onSubmitEditing={endEdit}
          keyboardType="numeric"
          autoFocus
          style={[styles.input, { backgroundColor: colors.surface }]}
          accessibilityLabel={accessibilityLabel}
        />
      ) : (
        <Pressable onPress={startEdit} style={styles.valueTap} accessibilityLabel={accessibilityLabel} accessibilityRole="button">
          <Text style={[styles.valueText, { color: colors.onSurface }]}>
            {display}
          </Text>
          {unit ? (
            <Text style={[styles.unitText, { color: colors.onSurfaceVariant }]}>
              {unit}
            </Text>
          ) : null}
        </Pressable>
      )}

      <Pressable
        onPress={increment}
        onLongPress={() => startRepeat(increment)}
        onPressOut={stopRepeat}
        style={[styles.stepBtn, { backgroundColor: colors.primaryContainer }]}
        accessibilityLabel={`Increase weight by ${step}`}
        accessibilityRole="button"
      >
        <Text style={[styles.stepText, { color: colors.onPrimaryContainer }]}>+</Text>
      </Pressable>
    </View>
  );
}

export default memo(WeightPicker);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 20,
  },
  valueTap: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  valueText: {
    fontSize: 16,
    fontWeight: "700",
  },
  unitText: {
    fontSize: 12,
  },
  input: {
    width: 56,
    height: 32,
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 2,
  },
});
