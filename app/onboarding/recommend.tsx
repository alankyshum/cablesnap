import { useLocalSearchParams } from "expo-router";
import { useOnboardingFinish } from "./_use-onboarding-finish";
import { AdvancedRecommend } from "./_recommend-advanced";
import { BeginnerRecommend } from "./_recommend-beginner";
import { ErrorBanner } from "./_recommend-error-banner";

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
