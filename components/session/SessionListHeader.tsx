import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  nextHint: string | null;
  colors: ThemeColors;
};

export function SessionListHeader({ nextHint, colors }: Props) {
  return (
    <>
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
  nextBanner: {
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
});
