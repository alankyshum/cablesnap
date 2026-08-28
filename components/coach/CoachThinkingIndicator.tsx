import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { fontSizes, radii, spacing } from "@/constants/design-tokens";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useThemeColors";
import { t } from "@/lib/i18n";

export type CoachThinkingIndicatorProps = {
  label?: string | null;
  accessibilityLabel?: string;
  testID?: string;
};

function AnimatedDot({
  index,
  color,
  reduceMotion,
}: {
  index: number;
  color: string;
  reduceMotion: boolean;
}) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(reduceMotion ? 1 : 0.35);

  useEffect(() => {
    if (reduceMotion) {
      translateY.value = 0;
      opacity.value = 1;
      return;
    }

    const delay = index * 160;
    const stepDuration = 320;
    const ease = Easing.bezier(0.23, 1, 0.32, 1);

    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-4, { duration: stepDuration, easing: ease }),
          withTiming(0, { duration: stepDuration, easing: ease }),
        ),
        -1,
        false,
      ),
    );

    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: stepDuration, easing: ease }),
          withTiming(0.35, { duration: stepDuration, easing: ease }),
        ),
        -1,
        false,
      ),
    );
  }, [index, reduceMotion, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      testID={`coach-thinking-dot-${index}`}
      style={[
        styles.dot,
        { backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
}

export function CoachThinkingIndicator({
  label,
  accessibilityLabel,
  testID = "coach-thinking-indicator",
}: CoachThinkingIndicatorProps) {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();

  const defaultLabel = t({ id: "components.coach.thinking", message: "Thinking..." });
  const a11yFallback = t({ id: "components.coach.thinkingA11y", message: "AI Coach is thinking" });
  const displayLabel = label || defaultLabel;
  const a11yLabel = accessibilityLabel || label || a11yFallback;

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={a11yLabel}
      accessibilityLiveRegion="polite"
      style={styles.container}
    >
      <View style={styles.dotsRow}>
        <AnimatedDot index={0} color={colors.onSurface} reduceMotion={reduceMotion} />
        <AnimatedDot index={1} color={colors.onSurface} reduceMotion={reduceMotion} />
        <AnimatedDot index={2} color={colors.onSurface} reduceMotion={reduceMotion} />
      </View>
      <Text style={[styles.label, { color: colors.onSurface }]}>
        {displayLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 36,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    height: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: "500",
  },
});
