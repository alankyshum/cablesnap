/* eslint-disable react-hooks/immutability -- reanimated shared values must be mutated via `.value` */
import { useCallback, useEffect } from "react";
import { Dimensions } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

const screenWidth = Dimensions.get("window").width;

export function useToastGesture(id: string, onDismiss: (id: string) => void) {
  // BLD-569: toast is now bottom-anchored, so slide UP from below into place.
  const translateY = useSharedValue(20);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.85);

  useEffect(() => {
    translateY.value = withTiming(0, { duration: 200 });
    opacity.value = withTiming(1, { duration: 200 });
    scale.value = withTiming(1, { duration: 200 });
  }, [translateY, opacity, scale]);

  const dismiss = useCallback(() => {
    const cb = () => { 'worklet'; runOnJS(onDismiss)(id); };
    opacity.value = withTiming(0, { duration: 150 }, (fin) => { if (fin) cb(); });
    scale.value = withTiming(0.85, { duration: 150 });
  }, [id, onDismiss, opacity, scale]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => { translateX.value = e.translationX; })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > screenWidth * 0.25 || Math.abs(e.velocityX) > 800) {
        const cb = () => { 'worklet'; runOnJS(onDismiss)(id); };
        translateX.value = withTiming(e.translationX > 0 ? screenWidth : -screenWidth, { duration: 200 });
        opacity.value = withTiming(0, { duration: 150 }, (fin) => { if (fin) cb(); });
      } else {
        translateX.value = withTiming(0, { duration: 150 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { translateX: translateX.value }, { scale: scale.value }],
  }));

  return { dismiss, panGesture, animatedStyle };
}
