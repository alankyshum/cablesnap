import React from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { t } from "@lingui/core/macro";

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
    // BLD-2688: guard on the raw (pre-clamp) next value, matching original behavior
    // (pre-BLD-2674). stepWeight clamps -1.5 to 0 for value=1 step=2.5 min=0, but
    // the original code used if (next >= min) where next was the RAW computed value.
    // Off-grid near-bound inputs (raw < min) must NOT fire onValueChange.
    const rawNext = Math.round((value - step) * 100) / 100;
    if (rawNext >= min) onValueChange(rawNext);
  };

  const increment = () => {
    // Same pattern: guard on raw next, not clamped next.
    const rawNext = Math.round((value + step) * 100) / 100;
    if (rawNext <= max) onValueChange(rawNext);
  };

  return (
    <View style={styles.container}>
      <Button
        variant="secondary"
        onPress={decrement}
        disabled={value <= min}
        accessibilityLabel={t({ id: "components.exercise.numeric-stepper.decrease", message: `Decrease by ${step}` })}
        style={styles.btn}
      >
        <Text>−</Text>
      </Button>
      <Text
        variant="title"
        style={{ color: colors.onSurface, minWidth: 80, textAlign: "center", fontWeight: "700" }}
        accessibilityLabel={t({ id: "components.exercise.numeric-stepper.value", message: `${value} ${unit}` })}
      >
        {value} {unit}
      </Text>
      <Button
        variant="secondary"
        onPress={increment}
        disabled={value >= max}
        accessibilityLabel={t({ id: "components.exercise.numeric-stepper.increase", message: `Increase by ${step}` })}
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
