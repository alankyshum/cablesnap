import React, { memo, useEffect, useMemo, useState, useRef } from "react";
import { StyleSheet, Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getAppSetting } from "../../lib/db";
import { solve, perSide, KG_PLATES, LB_PLATES } from "../../lib/plates";
import type { Equipment } from "../../lib/types";
import { fontSizes } from "@/constants/design-tokens";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { InlinePlateSheet } from "./InlinePlateSheet";

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
  const [isOpen, setIsOpen] = useState(false);
  const sheetRef = useRef<BottomSheetModal>(null);

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

  const handlePress = () => {
    setIsOpen(true);
    sheetRef.current?.present();
  };

  const handleDismiss = () => {
    setIsOpen(false);
  };

  if (!hint) return null;

  return (
    <>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={hint.accessibilityLabel}
        accessibilityHint="Opens the plate calculator"
        accessibilityState={{ expanded: isOpen }}
        hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
        style={styles.pressable}
      >
        <Text
          style={[styles.hint, { color: colors.onSurfaceVariant }]}
          accessible={false}
        >
          {hint.approx ? "≈ " : ""}Per side: {hint.plateText} ▸
        </Text>
      </Pressable>
      <InlinePlateSheet
        sheetRef={sheetRef}
        initialWeight={weight != null ? String(weight) : null}
        unit={unit}
        onBarChanged={(newBar) => {
          setStoredBarWeights((prev) => ({ ...prev, [unit]: newBar }));
        }}
        onDismiss={handleDismiss}
      />
    </>
  );
});

const styles = StyleSheet.create({
  pressable: {
    alignSelf: "center",
  },
  hint: {
    fontSize: fontSizes.xs,
    textAlign: "center",
    paddingHorizontal: 4,
  },
});
