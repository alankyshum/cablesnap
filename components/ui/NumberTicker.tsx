import React, { useEffect } from "react";
import { TextStyle, StyleProp } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
  useAnimatedReaction,
  runOnJS,
} from "react-native-reanimated";
import { springConfig, typography } from "../../constants/design-tokens";

interface NumberTickerProps {
  value: number;
  format?: (n: number) => string;
  style?: StyleProp<TextStyle>;
  variant?: "hero" | "stat" | "default";
}

export function NumberTicker({
  value,
  format = (n) => Math.round(n).toString(),
  style,
  variant = "default",
}: NumberTickerProps) {
  const [displayText, setDisplayText] = React.useState(format(value));
  const animatedValue = useSharedValue(value);
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      animatedValue.value = value;
      setDisplayText(format(value));
      return;
    }
    animatedValue.value = withSpring(value, springConfig.snappy);
    scale.value = withSpring(1.1, springConfig.bouncy, () => {
      scale.value = withSpring(1, springConfig.snappy);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs
  }, [value, reducedMotion]);

  useAnimatedReaction(
    () => animatedValue.value,
    (current) => {
      runOnJS(setDisplayText)(format(current));
    }
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const variantStyle =
    variant === "hero"
      ? typography.heroNumber
      : variant === "stat"
        ? typography.statValue
        : {};

  return (
    <Animated.Text style={[variantStyle, style, animatedStyle]}>
      {displayText}
    </Animated.Text>
  );
}
