import React, { useEffect } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
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
}

const REVEAL_THRESHOLD = -80;

export default function SwipeToDelete({
  children,
  onDelete,
  enabled = true,
  showHint = false,
}: SwipeToDeleteProps) {
  const colors = useThemeColors();
  const { width: screenWidth } = useWindowDimensions();
  const translateX = useSharedValue(0);

  // Dismiss requires swiping past 40% of screen width
  const dismissThreshold = -(screenWidth * 0.4);

  useEffect(() => {
    if (showHint && enabled) {
      translateX.value = withDelay(
        600,
        withSequence(
          withTiming(-40, { duration: 300 }),
          withSpring(0, { damping: 15, stiffness: 200 }),
        ),
      );
    }
  }, [showHint, enabled, translateX]);

  const panGesture = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      translateX.value = Math.min(0, e.translationX);
    })
    .onEnd((e) => {
      if (e.translationX < dismissThreshold) {
        translateX.value = withTiming(-screenWidth, { duration: durationTokens.fast }, () => {
          runOnJS(onDelete)();
        });
      } else if (e.translationX < REVEAL_THRESHOLD) {
        translateX.value = withSpring(REVEAL_THRESHOLD, { damping: 20, stiffness: 200 });
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const bgStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < -10 ? 1 : 0,
  }));

  if (!enabled) return <>{children}</>;

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[
          styles.deleteBackground,
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
    alignItems: "flex-end",
    borderRadius: radii.md,
  },
  deleteContent: {
    width: 80,
    alignItems: "center",
    justifyContent: "center",
  },
});
