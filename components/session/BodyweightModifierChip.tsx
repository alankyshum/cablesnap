import React, { memo } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { radii, fontSizes } from "@/constants/design-tokens";
import {
  accessibilityLabelForModifier,
  formatBodyweightLoad,
} from "@/lib/bodyweight";

type Props = {
  modifierKg: number | null;
  unit: "kg" | "lb";
  onPress: () => void;
  onLongPress?: () => void;
  setNumber?: number;
};

/**
 * Outlined rounded-rect chip rendered in SetRow's pickerCol slot when the
 * exercise equipment is 'bodyweight'. Swaps with (does not supplement) the
 * WeightPicker. Row geometry is unchanged; chip visual height is 36dp, hitSlop
 * brings effective target to 44dp (UX REV-2/3/4 + BLD-541 AC-20).
 *
 * Visual copy uses U+2212; accessibility label uses the mode word ("plus" /
 * "minus" via the mode) so screen readers never say "hyphen".
 */
export const BodyweightModifierChip = memo(function BodyweightModifierChip({
  modifierKg,
  unit,
  onPress,
  onLongPress,
  setNumber,
}: Props) {
  const colors = useThemeColors();
  const label = formatBodyweightLoad(modifierKg ?? null, unit);
  const a11y = accessibilityLabelForModifier(modifierKg ?? null, unit);
  const setPrefix = setNumber != null ? `Set ${setNumber} load, ` : "";

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={8}
      style={[
        styles.chip,
        { borderColor: colors.outline, backgroundColor: "transparent" },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${setPrefix}${a11y}`}
      accessibilityHint="Double tap to change the load modifier. Long press to reset to bodyweight only."
    >
      <Text
        style={[
          styles.label,
          { color: colors.onSurface },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  chip: {
    minWidth: 84,
    minHeight: 36,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  label: {
    fontSize: fontSizes.base,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
});
