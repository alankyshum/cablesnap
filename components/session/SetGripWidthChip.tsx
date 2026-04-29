import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import { GRIP_WIDTH_LABELS, type GripWidth } from "../../lib/types";

export type SetGripWidthChipProps = {
  gripWidth: GripWidth | null | undefined;
};

/**
 * BLD-822: per-set grip-width chip — display-only.
 *
 * Sibling of `SetMountPositionChip` (BLD-771). Reads `set.grip_width`.
 * Self-suppresses when null/undefined; tap-target is parent SetRow's grip
 * footer Pressable.
 *
 * A11y label format mirrors SetAttachmentChip / SetMountPositionChip (BLD-771).
 * Do not diverge without updating both.
 *
 * Visual mirrors `SetGripTypeChip` exactly for consistency in the grip footer.
 */
function SetGripWidthChipInner({ gripWidth }: SetGripWidthChipProps) {
  const colors = useThemeColors();
  if (!gripWidth) return null;
  const label = GRIP_WIDTH_LABELS[gripWidth];
  return (
    <View
      style={[styles.chip, { backgroundColor: colors.surfaceVariant }]}
      accessible
      accessibilityLabel={`Width: ${label}`}
    >
      <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>
        {`Width: ${label}`}
      </Text>
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

export const SetGripWidthChip = React.memo(SetGripWidthChipInner);
