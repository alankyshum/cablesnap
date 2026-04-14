import React, { useEffect, useCallback } from "react";
import { Pressable, ViewStyle, StyleProp } from "react-native";
import { Text, useTheme } from "react-native-paper";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  useReducedMotion,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  spacing,
  radii,
  elevation as elevationTokens,
  duration,
  easing,
  springConfig,
} from "../../constants/design-tokens";

interface ToastProps {
  message: string;
  visible: boolean;
  onDismiss: () => void;
  action?: { label: string; onPress: () => void };
  durationMs?: number;
  style?: StyleProp<ViewStyle>;
}

export function Toast({
  message,
  visible,
  onDismiss,
  action,
  durationMs = 3000,
  style,
}: ToastProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  const dismiss = useCallback(() => {
    const config = { duration: duration.fast, easing: easing.accelerate };
    translateY.value = withTiming(-100, config);
    opacity.value = withTiming(0, config, () => {
      runOnJS(onDismiss)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs
  }, [onDismiss]);

  useEffect(() => {
    if (visible) {
      if (reducedMotion) {
        translateY.value = 0;
        opacity.value = 1;
      } else {
        translateY.value = withSpring(0, springConfig.snappy);
        opacity.value = withTiming(1, {
          duration: duration.fast,
          easing: easing.decelerate,
        });
      }
      const timer = setTimeout(dismiss, durationMs);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs
  }, [visible, durationMs, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: insets.top + spacing.sm,
          left: spacing.base,
          right: spacing.base,
          zIndex: 1000,
        },
        animatedStyle,
      ]}
    >
      <Pressable onPress={dismiss}>
        <Animated.View
          style={[
            {
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: theme.colors.inverseSurface,
              paddingHorizontal: spacing.base,
              paddingVertical: spacing.md,
              borderRadius: radii.lg,
              ...elevationTokens.high,
            },
            style,
          ]}
        >
          <Text
            variant="bodyMedium"
            style={{
              color: theme.colors.inverseOnSurface,
              flex: 1,
            }}
          >
            {message}
          </Text>
          {action && (
            <Pressable onPress={action.onPress} hitSlop={spacing.sm}>
              <Text
                variant="labelLarge"
                style={{
                  color: theme.colors.inversePrimary,
                  marginLeft: spacing.md,
                }}
              >
                {action.label}
              </Text>
            </Pressable>
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}
