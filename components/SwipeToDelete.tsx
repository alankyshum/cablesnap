import React, { useEffect, useState, useCallback } from "react";
import { I18nManager, LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react-native";
import { radii, duration as durationTokens } from "../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";

interface SwipeToDeleteProps {
  children: React.ReactNode;
  onDelete: () => void;
  enabled?: boolean;
  /** Show a brief swipe-hint animation on mount */
  showHint?: boolean;
  /**
   * Fraction of the width basis the user must drag past before the row
   * dismisses on release. Default 0.4 (40% of screen width).
   */
  dismissThresholdFraction?: number;
  /**
   * Minimum absolute pixel distance required to dismiss. Applied in addition
   * to `dismissThresholdFraction` — effective threshold is whichever is
   * greater. Default 0 (no floor).
   */
  minDismissPx?: number;
  /**
   * What to measure the fractional threshold against.
   * - "screen" (default) — window width, preserves prior behavior for existing callers.
   * - "container" — the component's own measured width (preferred for row-scoped swipes).
   */
  widthBasis?: "screen" | "container";
  /**
   * Optional fling-velocity override. If the release velocity (in px/s) exceeds
   * this value AND the translation exceeds `velocityMinTranslatePx`, the row
   * dismisses even if the distance threshold wasn't reached. Undefined disables.
   */
  velocityDismissPxPerSec?: number;
  /** Minimum translation before the velocity override can fire. Default 80. */
  velocityMinTranslatePx?: number;
  /** Fire a medium impact haptic on commit. Default false. */
  haptic?: boolean;
}

const REVEAL_THRESHOLD = -80;

function triggerMediumHaptic() {
  // Best-effort; ignore errors on platforms without haptic support (web).
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export default function SwipeToDelete({
  children,
  onDelete,
  enabled = true,
  showHint = false,
  dismissThresholdFraction = 0.4,
  minDismissPx = 0,
  widthBasis = "screen",
  velocityDismissPxPerSec,
  velocityMinTranslatePx = 80,
  haptic = false,
}: SwipeToDeleteProps) {
  const colors = useThemeColors();
  const { width: screenWidth } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const [containerWidth, setContainerWidth] = useState<number>(screenWidth);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setContainerWidth(w);
  }, []);

  const basisWidth = widthBasis === "container" ? containerWidth : screenWidth;
  // Whichever is greater: fraction of basis, or minDismissPx floor.
  const fractionalThreshold = basisWidth * dismissThresholdFraction;
  const effectiveThreshold = Math.max(fractionalThreshold, minDismissPx);
  // RTL flip: swipe goes left-to-right on RTL locales.
  const sign = I18nManager.isRTL ? 1 : -1;
  const dismissThreshold = sign * effectiveThreshold;

  useEffect(() => {
    if (showHint && enabled) {
      translateX.value = withDelay(
        600,
        withSequence(
          withTiming(sign * 40, { duration: 300 }),
          withSpring(0, { damping: 15, stiffness: 200 }),
        ),
      );
    }
  }, [showHint, enabled, translateX, sign]);

  const panGesture = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      // Clamp to correct direction depending on locale.
      translateX.value = sign < 0
        ? Math.min(0, e.translationX)
        : Math.max(0, e.translationX);
    })
    .onEnd((e) => {
      const distanceMet = sign < 0
        ? e.translationX < dismissThreshold
        : e.translationX > dismissThreshold;
      const velocityOverride =
        velocityDismissPxPerSec !== undefined &&
        Math.abs(e.velocityX) > velocityDismissPxPerSec &&
        Math.abs(e.translationX) > velocityMinTranslatePx &&
        (sign < 0 ? e.velocityX < 0 : e.velocityX > 0);

      if (distanceMet || velocityOverride) {
        if (haptic) runOnJS(triggerMediumHaptic)();
        translateX.value = withTiming(
          sign * basisWidth,
          { duration: durationTokens.fast },
          () => {
            runOnJS(onDelete)();
          },
        );
      } else if ((sign < 0 ? e.translationX : -e.translationX) < REVEAL_THRESHOLD) {
        translateX.value = withSpring(sign * -REVEAL_THRESHOLD, { damping: 20, stiffness: 200 });
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const bgStyle = useAnimatedStyle(() => ({
    opacity: Math.abs(translateX.value) > 10 ? 1 : 0,
  }));

  if (!enabled) return <>{children}</>;

  return (
    <View style={styles.wrapper} onLayout={onLayout}>
      <Animated.View
        style={[
          styles.deleteBackground,
          sign < 0 ? styles.deleteBackgroundRight : styles.deleteBackgroundLeft,
          { backgroundColor: colors.error },
          bgStyle,
        ]}
      >
        <View style={styles.deleteContent}>
          <Button
            variant="ghost"
            size="icon"
            icon={Trash2}
            onPress={onDelete}
            accessibilityLabel="Delete"
            style={{ backgroundColor: "transparent" }}
          />
        </View>
      </Animated.View>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={contentStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: "hidden",
  },
  deleteBackground: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    borderRadius: radii.md,
  },
  deleteBackgroundRight: {
    alignItems: "flex-end",
  },
  deleteBackgroundLeft: {
    alignItems: "flex-start",
  },
  deleteContent: {
    width: 80,
    alignItems: "center",
    justifyContent: "center",
  },
});
