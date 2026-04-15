import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, TextInput, useTheme } from "react-native-paper";
import WheelPicker from "@quidone/react-native-wheel-picker";
import * as Haptics from "expo-haptics";

type Props = {
  value: number | null;
  step: number;
  unit: "kg" | "lb";
  onValueChange: (val: number) => void;
  accessibilityLabel?: string;
};

const MIN = 0;
const MAX = 500;

function WeightPicker({ value, step, unit, onValueChange, accessibilityLabel }: Props) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const lastVal = useRef<number>(value ?? 0);

  const data = useMemo(() => {
    const items: { value: number; label: string }[] = [];
    for (let v = MIN; v <= MAX; v += step) {
      const rounded = Math.round(v * 10) / 10;
      items.push({ value: rounded, label: String(rounded) });
    }
    return items;
  }, [step]);

  const handleChange = useCallback(({ item }: { item: { value: number } }) => {
    const num = item.value;
    if (num !== lastVal.current) {
      lastVal.current = num;
      onValueChange(num);
      Haptics.selectionAsync();
    }
  }, [onValueChange]);

  const startEdit = () => {
    setDraft(value != null ? String(value) : "");
    setEditing(true);
  };

  const endEdit = () => {
    setEditing(false);
    const num = parseFloat(draft);
    if (!isNaN(num) && num >= MIN && num <= MAX) {
      onValueChange(num);
    }
  };

  const display = value != null ? String(value) : "—";

  return (
    <View style={styles.container}>
      <View style={styles.wheelWrap}>
        <WheelPicker
          data={data}
          value={value ?? 0}
          onValueChanged={handleChange}
          itemHeight={32}
          width="100%"
          visibleItemCount={3}
          itemTextStyle={{
            fontSize: 14,
            color: theme.colors.onSurfaceVariant,
          }}
          overlayItemStyle={{
            backgroundColor: theme.colors.primaryContainer,
            borderRadius: 6,
          }}
        />
      </View>
      {editing ? (
        <TextInput
          mode="outlined"
          dense
          value={draft}
          onChangeText={setDraft}
          onBlur={endEdit}
          onSubmitEditing={endEdit}
          keyboardType="numeric"
          autoFocus
          style={styles.input}
          accessibilityLabel={accessibilityLabel}
        />
      ) : (
        <Pressable onPress={startEdit} style={styles.valueTap} accessibilityLabel={accessibilityLabel} accessibilityRole="button">
          <Text variant="titleSmall" style={{ color: theme.colors.onSurface, fontWeight: "700" }}>
            {display}
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}>
            {unit}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export default memo(WeightPicker);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  wheelWrap: {
    flex: 1,
    height: 96,
    overflow: "hidden",
  },
  valueTap: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 48,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  input: {
    width: 56,
    height: 32,
    fontSize: 13,
    textAlign: "center",
  },
});
