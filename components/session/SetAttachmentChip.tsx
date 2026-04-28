import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import { ATTACHMENT_LABELS, type Attachment } from "../../lib/types";

export type SetAttachmentChipProps = {
  attachment: Attachment | null | undefined;
};

/**
 * BLD-771: per-set attachment chip — display-only.
 *
 * Tap-target is the parent `SetRow` (CEO ruling on QD-R4 — see plan §UX).
 * Self-suppresses when `attachment` is null/undefined; mirrors the
 * `MountPositionChip` pattern at `components/session/MountPositionChip.tsx`.
 *
 * Visual: rounded pill, surfaceVariant background, fontSizes.xs (12pt)
 * onSurfaceVariant text, 4dp/8dp padding. Text-only ("Att: Rope") — never
 * icon-only (a11y AC line 81).
 */
function SetAttachmentChipInner({ attachment }: SetAttachmentChipProps) {
  const colors = useThemeColors();
  if (!attachment) return null;
  const label = ATTACHMENT_LABELS[attachment];
  return (
    <View
      style={[styles.chip, { backgroundColor: colors.surfaceVariant }]}
      accessible
      accessibilityLabel={`Attachment: ${label}`}
    >
      <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>
        {`Att: ${label}`}
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

export const SetAttachmentChip = React.memo(SetAttachmentChipInner);
