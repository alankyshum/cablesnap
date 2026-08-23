import React, { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Wrench } from "lucide-react-native";
import { fontSizes, radii, spacing } from "@/constants/design-tokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useThemeColors";

export type CoachToolBadgeProps = {
  label: string;
  isStreaming?: boolean;
  testID?: string;
};

export function CoachToolBadge({
  label,
  isStreaming = false,
  testID = "coach-tool-badge",
}: CoachToolBadgeProps) {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const rotation = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion || !isStreaming) {
      rotation.value = 0;
      opacity.value = 1;
      return;
    }

    const duration = 1200;
    const ease = Easing.inOut(Easing.ease);

    rotation.value = withRepeat(
      withSequence(
        withTiming(15, { duration: duration / 4, easing: ease }),
        withTiming(-15, { duration: duration / 2, easing: ease }),
        withTiming(0, { duration: duration / 4, easing: ease }),
      ),
      -1,
      false,
    );

    opacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: duration / 2, easing: ease }),
        withTiming(1, { duration: duration / 2, easing: ease }),
      ),
      -1,
      true,
    );
  }, [isStreaming, reduceMotion, rotation, opacity]);

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const animatedContainerStyle = useAnimatedStyle(() => ({
    opacity: isStreaming && !reduceMotion ? opacity.value : 1,
  }));

  return (
    <Animated.View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.badge,
        { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
        animatedContainerStyle,
      ]}
    >
      <Animated.View style={animatedIconStyle}>
        <Wrench size={12} color={colors.onSurface} />
      </Animated.View>
      <Text style={[styles.badgeText, { color: colors.onSurface }]}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    gap: spacing.xs,
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: fontSizes.xs,
    fontWeight: "500",
  },
});
