import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import { parseTempo, tempoAccessibilityLabel } from "../../lib/workout/tempo-coach";

export type SetTempoChipProps = {
  tempo: string | null | undefined;
};

/**
 * BLD-1158: per-set tempo chip — display-only.
 *
 * Mirrors SetGripTypeChip / SetMountPositionChip pattern (BLD-771/822).
 * Self-suppresses when tempo is null/undefined or not parseable.
 * Tap-target is the parent SetRow (chip itself is not interactive).
 *
 * A11y label: "Tempo: 3 seconds eccentric, 1 second pause, 2 seconds concentric,
 * 0 second pause. Double tap to edit."
 */
function SetTempoChipInner({ tempo }: SetTempoChipProps) {
  const colors = useThemeColors();
  if (!tempo) return null;
  const parsed = parseTempo(tempo);
  if (!parsed) return null;

  const a11yDetail = tempoAccessibilityLabel(parsed);
  return (
    <View
      style={[styles.chip, { backgroundColor: colors.surfaceVariant }]}
      accessible
      accessibilityLabel={`Tempo: ${a11yDetail}. Double tap to edit.`}
    >
      <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>
        {`♩ ${tempo}`}
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

export const SetTempoChip = React.memo(SetTempoChipInner);
