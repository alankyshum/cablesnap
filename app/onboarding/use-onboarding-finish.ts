import { useState } from "react";
import { useRouter } from "expo-router";
import { setAppSetting, updateBodySettings, getBodySettings } from "../../lib/db";
import { activateProgram } from "../../lib/programs";
import { STARTER_PROGRAMS } from "../../lib/starter-templates";
import { useCompleteOnboarding } from "../../lib/onboarding-context";

type Action = "template" | "program" | "browse";
const PPL = STARTER_PROGRAMS.find((p) => p.id === "starter-prog-1")!;

export function useOnboardingFinish(
  weight: "kg" | "lb",
  measurement: "cm" | "in",
  level: string,
) {
  const router = useRouter();
  const completeOnboarding = useCompleteOnboarding();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<Action | undefined>();

  async function finish(action?: Action) {
    if (saving) return;
    setSaving(true);
    setError(null);
    if (action !== undefined) setLastAction(action);
    const effectiveAction = action ?? lastAction;
    try {
      const settings = await getBodySettings();
      await updateBodySettings(weight, measurement, settings.weight_goal, settings.body_fat_goal);
      await setAppSetting("experience_level", level);
      await setAppSetting("onboarding_complete", "1");
      completeOnboarding();

      if (effectiveAction === "program") {
        await activateProgram(PPL.id);
      }
      router.replace("/(tabs)");
    } catch {
      setSaving(false);
      setError("Something went wrong saving your preferences. Tap to retry or skip.");
    }
  }

  function skip() {
    if (saving) return;
    setSaving(true);
    setAppSetting("onboarding_complete", "1")
      .then(() => {
        completeOnboarding();
        router.replace("/(tabs)");
      })
      .catch(() => {
        setSaving(false);
        setError("Could not save preferences. Tap Skip to continue anyway.");
      });
  }

  return { saving, error, finish, skip };
}
