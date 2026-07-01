/**
 * BLD-2561: Fast-path swap chip rendered in GroupCardHeader Row 3a.
 *
 * Follows the BodyweightModifierChip visual pattern (outlined rounded-rect,
 * minHeight 44, borderRadius radii.md, borderWidth 1). Only renders when
 * a resolved preferredSubstituteName is provided — the parent is responsible
 * for the null-guard so this component stays pure.
 *
 * Two states:
 *   idle: "Swap to {preferredName}" — tap applies the swap immediately (no confirm).
 *   swapped: "Swapped to {name} · Undo" — tap undoes the swap.
 *
 * A11y:
 *   - accessibilityRole="button"
 *   - minHeight 44 + hitSlop 8 → effective ~60dp target (matches BLD-2449 pattern)
 *   - Non-color affordance: swap-horizontal icon prefix in swapped state
 *   - Pre-swap label: "Swap {group} to {preferred}"
 *   - Post-swap hint: "Swapped to {name}. Tap to undo."
 *   - Default flex direction (RTL-safe — no hard-coded flexDirection: "row")
 */
import React, { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { radii, fontSizes } from "@/constants/design-tokens";

type Props = {
  /** Resolved preferred substitute name. Component must NOT render when null. */
  preferredName: string;
  /** Name of the exercise being swapped (source group name). */
  exerciseName: string;
  /** Whether this exercise has already been swapped to the preferred in this session. */
  isSwapped?: boolean;
  /** Name of the exercise the swap was applied to (for post-swap label). */
  swappedToName?: string | null;
  onPress: () => void;
};

export const PreferredSwapChip = memo(function PreferredSwapChip({
  preferredName,
  exerciseName,
  isSwapped = false,
  swappedToName,
  onPress,
}: Props) {
  const colors = useThemeColors();

  const chipLabel = isSwapped
    ? `Swapped to ${swappedToName ?? preferredName} · Undo`
    : `Swap to ${preferredName}`;

  const a11yLabel = isSwapped
    ? `${swappedToName ?? preferredName} swapped to. Tap to undo.`
    : `Swap ${exerciseName} to ${preferredName}`;

  const a11yHint = isSwapped
    ? undefined
    : "Applies your saved preferred substitute immediately. Undo available after swap.";

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={a11yHint}
      style={[
        styles.chip,
        {
          borderColor: isSwapped ? colors.primary : colors.outline,
          backgroundColor: "transparent",
        },
      ]}
    >
      <View style={styles.chipInner}>
        {isSwapped && (
          <MaterialCommunityIcons
            name="swap-horizontal"
            size={16}
            color={colors.primary}
            style={styles.icon}
          />
        )}
        <Text
          style={[
            styles.label,
            { color: isSwapped ? colors.primary : colors.onSurface },
          ]}
          numberOfLines={1}
        >
          {chipLabel}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 4,
    justifyContent: "center",
  },
  chipInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    marginEnd: 4,
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: "500",
  },
});
