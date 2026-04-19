import React from "react";
import { StyleSheet, View } from "react-native";
import { radii } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { color } from "../../lib/plates";

const HEIGHT: Record<number, number> = {
  25: 80, 55: 80,
  20: 72, 45: 72,
  15: 64, 35: 64,
  10: 56,
  5: 48,
  2.5: 40,
  1.25: 34,
  0.5: 28, 1: 28,
};

function plateHeight(w: number): number {
  return HEIGHT[w] ?? 40;
}

function PlateView({ weight, unit }: { weight: number; unit: "kg" | "lb" }) {
  const colors = useThemeColors();
  const c = color(weight, unit);
  return (
    <View
      style={[
        plateStyles.plate,
        {
          height: plateHeight(weight),
          backgroundColor: c.bg,
          borderColor: c.border ? colors[c.border] : "transparent",
          borderWidth: c.border ? 1 : 0,
        },
      ]}
    />
  );
}

export function Barbell({ plates, unit, barbell: label }: { plates: number[]; unit: "kg" | "lb"; barbell: string }) {
  const colors = useThemeColors();
  return (
    <View
      style={plateStyles.barbell}
      accessibilityLabel={label}
      accessibilityRole="image"
    >
      <View style={plateStyles.side}>
        {[...plates].reverse().map((p, i) => (
          <PlateView key={"l" + i} weight={p} unit={unit} />
        ))}
      </View>
      <View style={[plateStyles.bar, { backgroundColor: colors.outlineVariant }]} />
      <View style={plateStyles.side}>
        {plates.map((p, i) => (
          <PlateView key={"r" + i} weight={p} unit={unit} />
        ))}
      </View>
    </View>
  );
}

const plateStyles = StyleSheet.create({
  barbell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    marginBottom: 8,
    minHeight: 80,
  },
  side: {
    flexDirection: "row",
    alignItems: "center",
  },
  plate: {
    width: 22,
    borderRadius: radii.sm,
    marginHorizontal: 1,
  },
  bar: {
    width: 60,
    height: 8,
    borderRadius: radii.sm,
  },
});
