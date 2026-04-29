import React, { memo, useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getAppSetting } from "../../lib/db";
import { solve, perSide, KG_PLATES, LB_PLATES } from "../../lib/plates";
import type { Equipment } from "../../lib/types";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  weight: number | null;
  unit: "kg" | "lb";
  equipment: Equipment;
};

function getBarSettingKey(unit: "kg" | "lb") {
  return `plate_calculator_bar_${unit}`;
}

export const PlateHint = memo(function PlateHint({ weight, unit, equipment }: Props) {
  const colors = useThemeColors();
  const defaultBarWeight = unit === "lb" ? 45 : 20;
  const [storedBarWeights, setStoredBarWeights] = useState<Partial<Record<"kg" | "lb", number>>>({});
  const barWeight = storedBarWeights[unit] ?? defaultBarWeight;

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const storedBar = await getAppSetting(getBarSettingKey(unit));
        const parsedBar = storedBar == null ? Number.NaN : parseFloat(storedBar);
        if (!active || Number.isNaN(parsedBar) || parsedBar <= 0 || parsedBar === defaultBarWeight) return;
        setStoredBarWeights((prev) => ({ ...prev, [unit]: parsedBar }));
      } catch {
        // Fall back to default bar weight for the current unit.
      }
    })();
    return () => {
      active = false;
    };
  }, [defaultBarWeight, unit]);

  const hint = useMemo(() => {
    if (equipment !== "barbell" || weight == null || weight <= 0) return null;
    if (weight <= barWeight) return null;
    const side = perSide(weight, barWeight);
    const result = solve(side, unit === "kg" ? KG_PLATES : LB_PLATES);
    const plateText = result.plates.join(" + ");
    const approx = result.remainder > 0;
    const spokenPlates = result.plates
      .map((p) => `${p} ${unit === "kg" ? "kilograms" : "pounds"}`)
      .join(", ");
    const accessibilityLabel = approx
      ? `Approximately. Plates per side after subtracting ${barWeight} ${unit === "kg" ? "kilograms" : "pounds"} bar: ${spokenPlates}`
      : `Plates per side after subtracting ${barWeight} ${unit === "kg" ? "kilograms" : "pounds"} bar: ${spokenPlates}`;
    return { plateText, approx, accessibilityLabel };
  }, [barWeight, weight, unit, equipment]);

  if (!hint) return null;

  return (
    <Text
      style={[styles.hint, { color: colors.onSurfaceVariant }]}
      accessibilityLabel={hint.accessibilityLabel}
    >
      {hint.approx ? "≈ " : ""}Per side: {hint.plateText}
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
