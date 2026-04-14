import React, { useEffect } from "react";
import { ViewStyle, StyleProp } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useReducedMotion,
} from "react-native-reanimated";
import { useTheme } from "react-native-paper";
import { duration, radii } from "../../constants/design-tokens";

interface SkeletonLoaderProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonLoader({
  width,
  height,
  borderRadius = radii.md,
  style,
}: SkeletonLoaderProps) {
  const theme = useTheme();
  const opacity = useSharedValue(0.3);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 0.5;
      return;
    }
    opacity.value = withRepeat(
      withTiming(0.7, { duration: duration.emphasis * 2 }),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs
  }, [reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor: theme.colors.surfaceVariant,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}
