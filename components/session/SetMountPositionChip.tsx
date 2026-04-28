import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import { MOUNT_POSITION_LABELS, type MountPosition } from "../../lib/types";

export type SetMountPositionChipProps = {
  mount: MountPosition | null | undefined;
};

/**
 * BLD-771: per-set mount-position chip — display-only.
 *
 * Sibling of `SetAttachmentChip`. Reads `set.mount_position` (per-set), not
 * `exercise.mount_position` (the exercise-definition Voltra default rendered
 * by `MountPositionChip`). Both can render simultaneously: the exercise-header
 * chip shows the configured Voltra mount; the per-set chip shows what the
 * user actually used on that set.
 *
 * Self-suppresses when `mount` is null/undefined; tap-target is parent SetRow.
 *
 * Visual mirrors `MountPositionChip` exactly (surfaceVariant pill, fontSizes.xs,
 * 4dp/8dp padding, ≤20dp height) for consistency in the session UI.
 *
 * Label includes the "Mount: " prefix to disambiguate from the attachment chip
 * for screen-reader users (AC line 232).
 */
function SetMountPositionChipInner({ mount }: SetMountPositionChipProps) {
  const colors = useThemeColors();
  if (!mount) return null;
  const label = MOUNT_POSITION_LABELS[mount];
  return (
    <View
      style={[styles.chip, { backgroundColor: colors.surfaceVariant }]}
      accessible
      accessibilityLabel={`Mount: ${label}`}
    >
      <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>
        {`Mount: ${label}`}
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

export const SetMountPositionChip = React.memo(SetMountPositionChipInner);
