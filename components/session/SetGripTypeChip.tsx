import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import { GRIP_TYPE_LABELS, type GripType } from "../../lib/types";

export type SetGripTypeChipProps = {
  gripType: GripType | null | undefined;
};

/**
 * BLD-822: per-set grip-type chip — display-only.
 *
 * Sibling of `SetAttachmentChip` (BLD-771). Reads `set.grip_type`. Tap-target
 * is the parent `SetRow`'s grip footer Pressable. Self-suppresses when null.
 *
 * A11y label format mirrors SetAttachmentChip / SetMountPositionChip (BLD-771).
 * Do not diverge without updating both.
 *
 * Visual: rounded pill, surfaceVariant background, fontSizes.xs (12pt),
 * onSurfaceVariant text, 4dp/8dp padding (matches `SetAttachmentChip`).
 */
function SetGripTypeChipInner({ gripType }: SetGripTypeChipProps) {
  const colors = useThemeColors();
  if (!gripType) return null;
  const label = GRIP_TYPE_LABELS[gripType];
  return (
    <View
      style={[styles.chip, { backgroundColor: colors.surfaceVariant }]}
      accessible
      accessibilityLabel={`Grip: ${label}`}
    >
      <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>
        {`Grip: ${label}`}
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

export const SetGripTypeChip = React.memo(SetGripTypeChipInner);
