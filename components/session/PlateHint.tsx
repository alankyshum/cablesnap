import React, { memo, useMemo } from "react";
import { StyleSheet } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { solve, perSide, KG_PLATES, LB_PLATES } from "../../lib/plates";
import type { Equipment } from "../../lib/types";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  weight: number | null;
  unit: "kg" | "lb";
  equipment: Equipment;
};

export const PlateHint = memo(function PlateHint({ weight, unit, equipment }: Props) {
  const colors = useThemeColors();

  const hint = useMemo(() => {
    if (equipment !== "barbell" || weight == null || weight <= 0) return null;
    const barWeight = unit === "lb" ? 45 : 20;
    if (weight <= barWeight) return null;
    const side = perSide(weight, barWeight);
    const result = solve(side, unit === "kg" ? KG_PLATES : LB_PLATES);
    const plateText = result.plates.join(" + ");
    const approx = result.remainder > 0;
    const label = `Per side: ${plateText}`;
    const spokenPlates = result.plates
      .map((p) => `${p} ${unit === "kg" ? "kilograms" : "pounds"}`)
      .join(", ");
    const accessibilityLabel = approx
      ? `Approximately. Plates per side: ${spokenPlates}`
      : `Plates per side: ${spokenPlates}`;
    return { label, approx, accessibilityLabel };
  }, [weight, unit, equipment]);

  if (!hint) return null;

  return (
    <Text
      style={[styles.hint, { color: colors.onSurfaceVariant }]}
      accessibilityLabel={hint.accessibilityLabel}
    >
      {hint.approx ? "≈ " : ""}Per side: {hint.label.replace("Per side: ", "")}
    </Text>
  );
});

const styles = StyleSheet.create({
  hint: {
    fontSize: fontSizes.xs,
    textAlign: "center",
    paddingHorizontal: 4,
  },
});
