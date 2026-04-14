import { createContext, useContext } from "react";

type OnboardingContextValue = {
  completeOnboarding: () => void;
};

export const OnboardingContext = createContext<OnboardingContextValue>({
  completeOnboarding: () => {},
});

export function useCompleteOnboarding() {
  return useContext(OnboardingContext).completeOnboarding;
}
