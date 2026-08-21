import { initializeI18n } from "@/lib/i18n";
initializeI18n();
import { t } from "@lingui/core/macro";
import React, { memo, useEffect, useMemo, useState, useRef, useCallback } from "react";
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

  const handlePress = useCallback(() => {
    sheetRef.current?.present();
  }, []);

  const handleBarChanged = useCallback((newBar: number) => {
    setStoredBarWeights((prev) => ({ ...prev, [unit]: newBar }));
  }, [unit]);

  if (!hint) return null;

  return (
    <>
      <Pressable
        style={styles.pressable}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={hint.accessibilityLabel}
        accessibilityHint={t({ id: "session.platehint.str1", message: "Opens the plate calculator" })}
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
        initialWeight={weight != null ? String(weight) : ""}
        unit={unit}
        onBarChanged={handleBarChanged}
      />
    </>
  );
});

const styles = StyleSheet.create({
  pressable: {
    paddingVertical: 2,
    alignSelf: "center",
  },
  hint: {
    fontSize: fontSizes.xs,
    textAlign: "center",
    paddingHorizontal: 4,
  },
});
