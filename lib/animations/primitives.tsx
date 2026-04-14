import React, { useEffect } from "react";
import { ViewStyle, StyleProp } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withDelay,
  withSpring,
  useReducedMotion,
  FadeIn,
} from "react-native-reanimated";
import { Circle, Svg } from "react-native-svg";
import {
  duration,
  easing,
  springConfig,
  spacing,
} from "../../constants/design-tokens";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── AnimatedCard ──────────────────────────────────────────────────
// Fade + slide-up on mount.

interface AnimatedCardProps {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedCard({ children, delay = 0, style }: AnimatedCardProps) {
  const translateY = useSharedValue(spacing.base as number);
  const opacity = useSharedValue(0 as number);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      translateY.value = 0;
      opacity.value = 1;
      return;
    }
    const config = { duration: duration.normal, easing: easing.decelerate };
    translateY.value = withDelay(delay, withTiming(0, config));
    opacity.value = withDelay(delay, withTiming(1, config));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs
  }, [delay, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
  );
}

// ─── AnimatedListItem ──────────────────────────────────────────────
// Staggered fade-in for list items.

interface AnimatedListItemProps {
  children: React.ReactNode;
  index: number;
  staggerMs?: number;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedListItem({
  children,
  index,
  staggerMs = 50,
  style,
}: AnimatedListItemProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <Animated.View style={style}>{children}</Animated.View>;
  }

  return (
    <Animated.View
      entering={FadeIn.delay(index * staggerMs)
        .duration(duration.normal)
        .easing(easing.decelerate)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

// ─── AnimatedNumber ────────────────────────────────────────────────
// Spring-based number display that animates between values.

interface AnimatedNumberProps {
  value: number;
  style?: StyleProp<ViewStyle>;
  formatFn?: (n: number) => string;
}

export function AnimatedNumber({
  value,
  style,
  formatFn = (n) => Math.round(n).toString(),
}: AnimatedNumberProps) {
  const animatedValue = useSharedValue(value);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      animatedValue.value = value;
      return;
    }
    animatedValue.value = withSpring(value, springConfig.snappy);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs
  }, [value, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1,
  }));

  return (
    <Animated.Text style={[style, animatedStyle]}>
      {formatFn(value)}
    </Animated.Text>
  );
}

// ─── AnimatedProgressRing ──────────────────────────────────────────
// Circular progress indicator with animated stroke.

interface AnimatedProgressRingProps {
  progress: number; // 0..1
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
}

export function AnimatedProgressRing({
  progress,
  size = 120,
  strokeWidth = 8,
  color = "#FF6038",
  trackColor = "#E5E7EB",
}: AnimatedProgressRingProps) {
  const animatedProgress = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  useEffect(() => {
    const clamped = Math.min(1, Math.max(0, progress));
    if (reducedMotion) {
      animatedProgress.value = clamped;
      return;
    }
    animatedProgress.value = withTiming(clamped, {
      duration: duration.emphasis,
      easing: easing.decelerate,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs
  }, [progress, reducedMotion]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedProgress.value),
  }));

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={trackColor}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        animatedProps={animatedProps}
        strokeLinecap="round"
        rotation={-90}
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

// ─── AnimatedProgressBar ───────────────────────────────────────────
// Horizontal progress bar with animated width.

interface AnimatedProgressBarProps {
  progress: number; // 0..1
  height?: number;
  color?: string;
  trackColor?: string;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedProgressBar({
  progress,
  height = 6,
  color = "#FF6038",
  trackColor = "#E5E7EB",
  style,
}: AnimatedProgressBarProps) {
  const animatedWidth = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const clamped = Math.min(1, Math.max(0, progress));
    if (reducedMotion) {
      animatedWidth.value = clamped;
      return;
    }
    animatedWidth.value = withTiming(clamped, {
      duration: duration.slow,
      easing: easing.decelerate,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs
  }, [progress, reducedMotion]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${animatedWidth.value * 100}%` as unknown as number,
  }));

  return (
    <Animated.View
      style={[
        {
          height,
          backgroundColor: trackColor,
          borderRadius: height / 2,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          {
            height,
            backgroundColor: color,
            borderRadius: height / 2,
          },
          barStyle,
        ]}
      />
    </Animated.View>
  );
}
