import { duration } from "../../constants/design-tokens";

// Screen transition configs for use with Expo Router's Stack.Screen options.
// Usage: <Stack.Screen options={{ ...modalTransition }} />

export const slideTransition = {
  animation: "slide_from_right" as const,
  animationDuration: duration.normal,
};

export const modalTransition = {
  animation: "slide_from_bottom" as const,
  animationDuration: duration.normal,
  presentation: "modal" as const,
};

export const fadeTransition = {
  animation: "fade" as const,
  animationDuration: duration.fast,
};

export const noneTransition = {
  animation: "none" as const,
};
