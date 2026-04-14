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
import { duration, easing } from "../../constants/design-tokens";

// Entrance animations — use as `entering` prop on Animated.View

export const enteringFadeUp = FadeInUp
  .duration(duration.normal)
  .easing(easing.decelerate);

export const enteringFadeDown = FadeInDown
  .duration(duration.normal)
  .easing(easing.decelerate);

export const enteringFade = FadeIn
  .duration(duration.fast)
  .easing(easing.decelerate);

export const enteringSlideRight = SlideInRight
  .duration(duration.normal)
  .easing(easing.decelerate);

// Exit animations — use as `exiting` prop on Animated.View

export const exitingFadeDown = FadeOutDown
  .duration(duration.fast)
  .easing(easing.accelerate);

export const exitingFadeUp = FadeOutUp
  .duration(duration.fast)
  .easing(easing.accelerate);

export const exitingFade = FadeOut
  .duration(duration.fast)
  .easing(easing.accelerate);

export const exitingSlideLeft = SlideOutLeft
  .duration(duration.fast)
  .easing(easing.accelerate);

// Layout animation — use as `layout` prop on Animated.View for reflows

export const layoutSpring = Layout.springify().damping(15).stiffness(150);

export const layoutTiming = Layout.duration(duration.normal).easing(easing.standard);
