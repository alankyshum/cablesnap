import React from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";

type Props = {
  value: number;
  onValueChange: (v: number) => void;
  min: number;
  step: number;
  unit: string;
  max?: number;
};

export default function NumericStepper({ value, onValueChange, min, step, unit, max = 9999 }: Props) {
  const colors = useThemeColors();

  const decrement = () => {
    const next = Math.round((value - step) * 10) / 10;
    if (next >= min) onValueChange(next);
  };

  const increment = () => {
    const next = Math.round((value + step) * 10) / 10;
    if (next <= max) onValueChange(next);
  };

  return (
    <View style={styles.container}>
      <Button
        variant="secondary"
        onPress={decrement}
        disabled={value <= min}
        accessibilityLabel={`Decrease by ${step}`}
        style={styles.btn}
      >
        <Text>−</Text>
      </Button>
      <Text
        variant="title"
        style={{ color: colors.onSurface, minWidth: 80, textAlign: "center", fontWeight: "700" }}
        accessibilityLabel={`${value} ${unit}`}
      >
        {value} {unit}
      </Text>
      <Button
        variant="secondary"
        onPress={increment}
        disabled={value >= max}
        accessibilityLabel={`Increase by ${step}`}
        style={styles.btn}
      >
        <Text>+</Text>
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 8,
  },
  btn: {
    minWidth: 48,
    minHeight: 48,
  },
});
