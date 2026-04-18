import React from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
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
}

const THRESHOLD = -80;
const DISMISS_THRESHOLD = -160;

export default function SwipeToDelete({
  children,
  onDelete,
  enabled = true,
}: SwipeToDeleteProps) {
  const colors = useThemeColors();
  const translateX = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      translateX.value = Math.min(0, e.translationX);
    })
    .onEnd((e) => {
      if (e.translationX < DISMISS_THRESHOLD) {
        translateX.value = withTiming(-500, { duration: durationTokens.fast }, () => {
          runOnJS(onDelete)();
        });
      } else if (e.translationX < THRESHOLD) {
        translateX.value = withSpring(THRESHOLD, { damping: 20, stiffness: 200 });
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
