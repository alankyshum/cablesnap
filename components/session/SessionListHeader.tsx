import React from "react";
import { StyleSheet, View } from "react-native";
import Reanimated from "react-native-reanimated";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  rest: number;
  restFlashStyle: any;
  dismissRest: () => void;
  nextHint: string | null;
  colors: ThemeColors;
};

export function SessionListHeader({ rest, restFlashStyle, dismissRest, nextHint, colors }: Props) {
  return (
    <>
      {rest > 0 && (
        <Reanimated.View
          style={[styles.restBanner, restFlashStyle]}
          accessibilityLiveRegion="polite"
        >
          <Text variant="heading" style={{ color: colors.onPrimaryContainer, fontWeight: "700" }} accessibilityLabel={`Rest timer: ${Math.floor(rest / 60)} minutes ${rest % 60} seconds`}>
            {String(Math.floor(rest / 60)).padStart(2, "0")}:{String(rest % 60).padStart(2, "0")}
          </Text>
          <Text variant="caption" style={{ color: colors.onPrimaryContainer, marginTop: 4 }}>
            Rest Timer
          </Text>
          <Button
            variant="ghost"
            size="sm"
            onPress={dismissRest}
            textStyle={{ color: colors.onPrimaryContainer }}
            style={{ marginTop: 4 }}
            accessibilityLabel="Skip rest timer"
            label="Skip"
          />
        </Reanimated.View>
      )}
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
  restBanner: {
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  nextBanner: {
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
});
