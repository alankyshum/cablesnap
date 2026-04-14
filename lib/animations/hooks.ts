import { useEffect } from "react";
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
  useReducedMotion,
  SharedValue,
  WithTimingConfig,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { duration, easing, springConfig } from "../../constants/design-tokens";

// ─── useAnimatedPress ──────────────────────────────────────────────
// Scale-down + opacity feedback on press. Pairs with Pressable.

export function useAnimatedPress(options?: { haptic?: boolean }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const onPressIn = () => {
    if (reducedMotion) return;
    scale.value = withTiming(0.96, {
      duration: duration.instant,
      easing: easing.standard,
    });
    opacity.value = withTiming(0.85, {
      duration: duration.instant,
      easing: easing.standard,
    });
    if (options?.haptic !== false) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const onPressOut = () => {
    if (reducedMotion) return;
    scale.value = withSpring(1, springConfig.snappy);
    opacity.value = withSpring(1, springConfig.snappy);
  };

  return { animatedStyle, onPressIn, onPressOut };
}

// ─── useEntrance ───────────────────────────────────────────────────
// Fade + slide-up entrance on mount, with optional stagger delay.

export function useEntrance(delayMs = 0) {
  const translateY = useSharedValue(16);
  const opacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      translateY.value = 0;
      opacity.value = 1;
      return;
    }
    const timingConfig: WithTimingConfig = {
      duration: duration.normal,
      easing: easing.decelerate,
    };
    translateY.value = withDelay(delayMs, withTiming(0, timingConfig));
    opacity.value = withDelay(delayMs, withTiming(1, timingConfig));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs
  }, [delayMs, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return animatedStyle;
}

// ─── useShakeError ─────────────────────────────────────────────────
// Horizontal shake for validation errors (3 oscillations).

export function useShakeError() {
  const translateX = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const trigger = () => {
    if (reducedMotion) return;
    const offset = 8;
    const t = duration.instant;
    translateX.value = withSequence(
      withTiming(offset, { duration: t }),
      withTiming(-offset, { duration: t }),
      withTiming(offset * 0.6, { duration: t }),
      withTiming(-offset * 0.6, { duration: t }),
      withTiming(0, { duration: t })
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  return { animatedStyle, trigger };
}

// ─── useCountUp ────────────────────────────────────────────────────
// Smooth count-up from 0 to target over given duration.

export function useCountUp(
  target: number,
  durationMs = duration.emphasis
): SharedValue<number> {
  const value = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      value.value = target;
      return;
    }
    value.value = withTiming(target, {
      duration: durationMs,
      easing: easing.decelerate,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs
  }, [target, durationMs, reducedMotion]);

  return value;
}

// ─── usePulse ──────────────────────────────────────────────────────
// Gentle scale pulse for attention-drawing elements.

export function usePulse() {
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();
  const isRunning = useSharedValue(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const start = () => {
    if (reducedMotion || isRunning.value) return;
    isRunning.value = true;
    const pulse = () => {
      scale.value = withSequence(
        withTiming(1.05, { duration: duration.slow, easing: easing.standard }),
        withTiming(1, { duration: duration.slow, easing: easing.standard })
      );
    };
    pulse();
  };

  const stop = () => {
    isRunning.value = false;
    scale.value = withSpring(1, springConfig.snappy);
  };

  return { animatedStyle, start, stop };
}
