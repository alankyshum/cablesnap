import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  nextHint: string | null;
  gymName?: string | null;
  colors: ThemeColors;
};

export function SessionListHeader({ nextHint, gymName, colors }: Props) {
  return (
    <>
      {gymName ? (
        <View style={[styles.gymChip, { backgroundColor: colors.secondaryContainer }]}>
          <Text variant="caption" style={{ color: colors.onSecondaryContainer, fontWeight: "700" }}>
            {gymName}
          </Text>
        </View>
      ) : null}
      {nextHint && (
        <View style={[styles.nextBanner, { backgroundColor: colors.secondaryContainer }]} accessibilityLiveRegion="polite">
          <Text variant="subtitle" style={{ color: colors.onSecondaryContainer, fontWeight: "700" }}>
            {nextHint}
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  gymChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
  },
  nextBanner: {
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
});
