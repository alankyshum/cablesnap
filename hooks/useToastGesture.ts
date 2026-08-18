import { useCallback, useEffect } from "react";
import { Dimensions } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { interiorDuration, interiorLeave, interiorSpring } from "../constants/design-tokens";

const screenWidth = Dimensions.get("window").width;

export function useToastGesture(id: string, onDismiss: (id: string) => void) {
  // BLD-569: toast is now bottom-anchored, so slide UP from below into place.
  const translateY = useSharedValue(20);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.85);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      translateY.value = 0;
      opacity.value = 1;
      scale.value = 1;
      return;
    }
    translateY.value = withSpring(0, interiorSpring.toastSurface);
    opacity.value = withTiming(1, { duration: interiorDuration.toastOpacity });
    scale.value = withSpring(1, interiorSpring.toastSurface);
  }, [translateY, opacity, scale, reducedMotion]);

  const dismiss = useCallback(() => {
    const cb = () => { 'worklet'; runOnJS(onDismiss)(id); };
    // eslint-disable-next-line react-hooks/immutability -- reanimated shared values are mutated via `.value` by design
    opacity.value = withTiming(0, { duration: interiorDuration.toastOpacity }, (fin) => { if (fin) cb(); });
    // eslint-disable-next-line react-hooks/immutability -- reanimated shared values are mutated via `.value` by design
    translateY.value = withTiming(6, { duration: interiorDuration.exit, easing: interiorLeave });
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared values are mutable animation targets.
    scale.value = withTiming(0.98, { duration: interiorDuration.exit, easing: interiorLeave });
  }, [id, onDismiss, opacity, scale, translateY]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => { translateX.value = e.translationX; })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > screenWidth * 0.25 || Math.abs(e.velocityX) > 800) {
        const cb = () => { 'worklet'; runOnJS(onDismiss)(id); };
        translateX.value = withTiming(e.translationX > 0 ? screenWidth : -screenWidth, { duration: interiorDuration.exit, easing: interiorLeave });
        // eslint-disable-next-line react-hooks/immutability -- reanimated shared values are mutated via `.value` by design
        opacity.value = withTiming(0, { duration: interiorDuration.toastOpacity }, (fin) => { if (fin) cb(); });
      } else {
        translateX.value = withSpring(0, interiorSpring.cell);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { translateX: translateX.value }, { scale: scale.value }],
  }));

  return { dismiss, panGesture, animatedStyle };
}
