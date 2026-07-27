/**
 * BandResistanceChip — BLD-4293.
 *
 * Displayed in SetRow weight column when equipment === "band".
 * Replaces the numeric weight picker for band exercises.
 * A11y: 44dp min height, label text carries meaning (never color-only).
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import { resolveNumericLoad } from "@/lib/bands";
import type { BandSnapshot } from "@/lib/bands";

const KG_TO_LB = 2.20462;

export type BandResistanceChipProps = {
  snapshot: BandSnapshot[] | null;
  unit: "kg" | "lb";
  setNumber: number;
};

function BandResistanceChipInner({ snapshot, unit, setNumber }: BandResistanceChipProps) {
  const colors = useThemeColors();

  if (!snapshot || snapshot.length === 0) {
    return (
      <View
        style={[styles.chip, styles.chipEmpty, { borderColor: colors.outlineVariant }]}
        accessible
        accessibilityLabel={`Set ${setNumber} band resistance: not set. Double-tap to choose.`}
        accessibilityRole="button"
      >
        <Text style={[styles.label, styles.labelEmpty, { color: colors.outlineVariant }]}>
          + band
        </Text>
      </View>
    );
  }

  const numericLoad = resolveNumericLoad(snapshot);
  let displayLabel: string;
  let a11yLabel: string;

  if (numericLoad !== null) {
    const displayValue = unit === "lb"
      ? `${(numericLoad * KG_TO_LB).toFixed(1)} lb`
      : `${numericLoad} kg`;
    displayLabel = displayValue;
    a11yLabel = `Set ${setNumber} band resistance: ${displayValue}. Double-tap to change.`;
  } else {
    const labelStr = snapshot.map((b) => b.label).join(" + ");
    displayLabel = labelStr;
    a11yLabel = `Set ${setNumber} band resistance: ${labelStr}. Double-tap to change.`;
  }

  return (
    <View
      style={[styles.chip, { backgroundColor: colors.secondaryContainer }]}
      accessible
      accessibilityLabel={a11yLabel}
      accessibilityRole="button"
    >
      <Text style={[styles.label, { color: colors.onSecondaryContainer }]} numberOfLines={1}>
        {displayLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignSelf: "stretch",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 44,
  },
  chipEmpty: {
    borderWidth: 1,
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
    textAlign: "center",
  },
  labelEmpty: {
    fontWeight: "400",
  },
});

export const BandResistanceChip = React.memo(BandResistanceChipInner);
