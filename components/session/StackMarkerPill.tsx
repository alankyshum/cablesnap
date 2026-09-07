import { initializeI18n } from "@/lib/i18n";
initializeI18n();
import { t } from "@lingui/core/macro";
/**
 * StackMarkerPill — displays the cable stack marker for a set.
 * BLD-1126: Stack Marker Quick-Pick.
 *
 * Three label states (AC1):
 *   - Pristine (weight IS NULL AND stack_marker IS NULL): "Pick marker"
 *   - Marker-logged (stack_marker IS NOT NULL): "<marker> · <weight> <unit>"
 *
 * Manual/legacy rows (weight IS NOT NULL, stack_marker IS NULL) are handled
 * by SetWeightCell which renders WeightPicker + "↕" affordance instead.
 *
 * ≤ 100 LOC. No new native deps.
 */
import React, { useCallback } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii } from "@/constants/design-tokens";

export type StackMarkerPillProps = {
  /** null = pristine (show placeholder). non-null = marker-logged. */
  marker: number | null;
  weight: number | null;
  unit: string;
  setNumber: number;
  onPress: () => void;
  onLongPress: () => void;
};

function StackMarkerPillInner({
  marker,
  weight,
  unit,
  setNumber,
  onPress,
  onLongPress,
}: StackMarkerPillProps) {
  const colors = useThemeColors();

  const isPristine = marker === null;
  const label = isPristine ? "Pick marker" : `${marker} · ${weight ?? ""} ${unit}`.trim();

  const a11yLabel = isPristine
    ? `Set ${setNumber} weight: tap to pick a stack marker`
    : `Set ${setNumber}, marker ${marker}, equals ${weight ?? 0} ${unit}. Double-tap to change. Long-press for numeric weight.`;

  const handleLongPress = useCallback(() => {
    onLongPress();
  }, [onLongPress]);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={handleLongPress}
      delayLongPress={400}
      style={[
        styles.pill,
        {
          backgroundColor: isPristine ? colors.surfaceVariant : colors.secondaryContainer,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={t({ id: "session.stackmarkerpill.str1", message: "Long-press for numeric weight entry" })}
      testID="stack-marker-pill"
    >
      <Text
        style={[
          styles.label,
          {
            color: isPristine ? colors.onSurfaceVariant : colors.onSecondaryContainer,
            fontStyle: isPristine ? "italic" : "normal",
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export const StackMarkerPill = React.memo(StackMarkerPillInner);

const styles = StyleSheet.create({
  pill: {
    minHeight: 44,
    minWidth: 70,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
    textAlign: "center",
  },
});
