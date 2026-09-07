/* eslint-disable */
import { Text } from "@/components/ui/text";
import { useColor } from "@/hooks/useColor";
import { CORNERS, FONT_SIZE, HEIGHT } from "@/theme/globals";
import React, { useEffect } from "react";
import { LayoutChangeEvent, Pressable, TextStyle, View, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { interiorSpring, radii, spacing } from "@/constants/design-tokens";

export const SEGMENT_MIN_TOUCH_TARGET = 44;

export interface SegmentedControlButton {
  value: string;
  label: string;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

interface SegmentedControlProps {
  value: string;
  onValueChange: (value: string) => void;
  buttons: readonly SegmentedControlButton[] | SegmentedControlButton[];
  style?: ViewStyle;
}

export function SegmentedControl({
  value,
  onValueChange,
  buttons,
  style,
}: SegmentedControlProps) {
  const bgColor = useColor("muted");
  const activeBg = useColor("background");
  const activeText = useColor("primary");
  const inactiveText = useColor("mutedForeground");
  // Older Reanimated Jest mocks do not expose useReducedMotion. Keep the hook
  // call unconditional in production while retaining a safe test fallback.
  const reducedMotionHook = useReducedMotion ?? (() => false);
  const reducedMotion = reducedMotionHook();
  const activeIndex = Math.max(0, buttons.findIndex((button) => button.value === value));
  const indicatorPosition = useSharedValue(activeIndex);
  const containerWidth = useSharedValue(0);
  useEffect(() => {
    indicatorPosition.value = reducedMotion ? activeIndex : withSpring(activeIndex, interiorSpring.tabIndicator);
  }, [activeIndex, indicatorPosition, reducedMotion]);
  const indicatorStyle = useAnimatedStyle(() => ({
    left: (indicatorPosition.value * containerWidth.value) / buttons.length,
    width: containerWidth.value / buttons.length,
  }));
  const handleLayout = (event: LayoutChangeEvent) => {
    containerWidth.value = event.nativeEvent.layout.width;
  };

  return (
    <View
      style={[
        {
          flexDirection: "row",
          backgroundColor: bgColor,
          borderRadius: CORNERS,
          padding: spacing.xs,
          minHeight: HEIGHT,
        },
        style,
      ]}
      onLayout={handleLayout}
    >
      <Animated.View pointerEvents="none" style={[{ position: "absolute", top: spacing.xs, bottom: spacing.xs, backgroundColor: activeBg, borderRadius: radii.pill }, indicatorStyle]} />
      {(buttons as SegmentedControlButton[]).map((btn) => {
        const isActive = btn.value === value;
        return (
          <Pressable
            key={btn.value}
            onPress={() => onValueChange(btn.value)}
            accessibilityLabel={btn.accessibilityLabel ?? btn.label}
            accessibilityRole="radio"
            accessibilityState={{ selected: isActive }}
            style={[
              {
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: CORNERS,
                paddingHorizontal: 8,
                paddingVertical: 6,
                minHeight: SEGMENT_MIN_TOUCH_TARGET,
                 backgroundColor: "transparent",
              },
              btn.style,
            ]}
          >
            <Text
              style={{
                fontSize: FONT_SIZE - 2,
                fontWeight: isActive ? "600" : "400",
                color: isActive ? activeText : inactiveText,
                textAlign: "center",
              }}
            >
              {btn.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
