import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import { MOUNT_POSITION_LABELS, type MountPosition } from "../../lib/types";

export type MountPositionChipProps = {
  mount: MountPosition | null | undefined;
};

/**
 * BLD-596: text-only mount-position chip for Voltra exercises.
 *
 * Self-suppresses when `mount` is null/undefined (chip not rendered at all).
 * Uses `!mount` truthiness gate so DB-loaded `null` is treated identically to
 * `undefined`.
 *
 * Visual: rounded pill, surfaceVariant background, fontSizes.xs (12pt)
 * onSurfaceVariant text, 4dp/8dp padding. Target height ≤20dp at 360dp+.
 *
 * Wrapper carries `flexShrink: 0` and a small marginLeft so the title column
 * compresses before the chip; parent `headerRow1` uses `flexWrap: "wrap"` so
 * the chip drops to a sub-row on widths <360dp instead of clipping.
 */
function MountPositionChipInner({ mount }: MountPositionChipProps) {
  const colors = useThemeColors();
  if (!mount) return null;
  const label = MOUNT_POSITION_LABELS[mount];
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: colors.surfaceVariant },
      ]}
      accessible
      accessibilityLabel={`Mount: ${label}`}
    >
      <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexShrink: 0,
    marginLeft: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignSelf: "center",
  },
  label: {
    fontSize: fontSizes.xs,
    lineHeight: 16,
    fontWeight: "600",
  },
});

export const MountPositionChip = React.memo(MountPositionChipInner);
