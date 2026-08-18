import {
  FadeInDown,
  FadeInUp,
  FadeOutDown,
  FadeOutUp,
  FadeIn,
  FadeOut,
  Layout,
  SlideInRight,
  SlideOutLeft,
} from "react-native-reanimated";
import { interiorDuration, interiorEase, interiorLeave } from "../../constants/design-tokens";

// Entrance animations — use as `entering` prop on Animated.View

export const enteringFadeUp = FadeInUp
  .duration(interiorDuration.enter)
  .easing(interiorEase);

export const enteringFadeDown = FadeInDown
  .duration(interiorDuration.enter)
  .easing(interiorEase);

export const enteringFade = FadeIn
  .duration(interiorDuration.enter)
  .easing(interiorEase);

export const enteringSlideRight = SlideInRight
  .duration(interiorDuration.pageEnter)
  .easing(interiorEase);

// Exit animations — use as `exiting` prop on Animated.View

export const exitingFadeDown = FadeOutDown
  .duration(interiorDuration.exit)
  .easing(interiorLeave);

export const exitingFadeUp = FadeOutUp
  .duration(interiorDuration.exit)
  .easing(interiorLeave);

export const exitingFade = FadeOut
  .duration(interiorDuration.exit)
  .easing(interiorLeave);

export const exitingSlideLeft = SlideOutLeft
  .duration(interiorDuration.exit)
  .easing(interiorLeave);

// Layout animation — use as `layout` prop on Animated.View for reflows

export const layoutSpring = Layout.springify().damping(15).stiffness(150);

export const layoutTiming = Layout.duration(interiorDuration.enter).easing(interiorEase);
