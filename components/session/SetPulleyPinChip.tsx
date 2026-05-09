import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

export type SetPulleyPinChipProps = {
  pin: number | null | undefined;
};

function SetPulleyPinChipInner({ pin }: SetPulleyPinChipProps) {
  const colors = useThemeColors();
  const label = pin != null ? `Pin ${pin}` : "Pin —";
  return (
    <View
      style={[styles.chip, { backgroundColor: colors.surfaceVariant }]}
      accessible
      accessibilityValue={{ text: pin != null ? `Pin ${pin}` : "Pulley pin not set" }}
      accessibilityLabel={pin != null ? `Pulley pin ${pin}` : "Pulley pin not set"}
    >
      <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>
        {label}
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

export const SetPulleyPinChip = React.memo(SetPulleyPinChipInner);
