import { useLocalSearchParams } from "expo-router";
import { useOnboardingFinish } from "./use-onboarding-finish";
import { AdvancedRecommend } from "./recommend-advanced";
import { BeginnerRecommend } from "./recommend-beginner";
import { ErrorBanner } from "./recommend-error-banner";

type Level = "beginner" | "intermediate" | "advanced";

export default function Recommend() {
  const params = useLocalSearchParams<{ weight: string; measurement: string; level: string }>();
  const level = (params.level ?? "beginner") as Level;
  const weight = (params.weight ?? "kg") as "kg" | "lb";
  const measurement = (params.measurement ?? "cm") as "cm" | "in";
  const { saving, error, finish, skip } = useOnboardingFinish(weight, measurement, level);

  const errorBanner = <ErrorBanner error={error} onRetry={() => finish()} onSkip={skip} />;

  if (level !== "advanced") {
    return <BeginnerRecommend level={level} errorBanner={errorBanner} saving={saving} finish={finish} />;
  }

  return <AdvancedRecommend errorBanner={errorBanner} saving={saving} finish={finish} />;
}
