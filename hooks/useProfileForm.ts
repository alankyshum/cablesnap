import { useEffect, useRef, useState } from "react";
import { getAppSetting, setAppSetting, updateMacroTargets } from "../lib/db";
import { getBodySettings, getLatestBodyWeight } from "../lib/db/body";
import {
  calculateFromProfile,
  migrateProfile,
  type ActivityLevel,
  type Goal,
  type NutritionProfile,
  type Sex,
} from "../lib/nutrition-calc";

export type UseProfileFormOptions = {
  initialProfile?: NutritionProfile;
  onSave: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};

export function useProfileForm({ initialProfile, onSave, onDirtyChange }: UseProfileFormOptions) {
  const [birthYear, setBirthYear] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [sex, setSex] = useState<Sex>("male");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("moderately_active");
  const [goal, setGoal] = useState<Goal>("maintain");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [heightUnit, setHeightUnit] = useState<"cm" | "in">("cm");
  const [saving, setSaving] = useState(false);
  const [activityMenuVisible, setActivityMenuVisible] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const initialSnapshot = useRef<string>("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [saved, bodySettings, latestWeight] = await Promise.all([
          initialProfile
            ? Promise.resolve(JSON.stringify(initialProfile))
            : getAppSetting("nutrition_profile"),
          getBodySettings(),
          getLatestBodyWeight(),
        ]);

        if (!active) return;

        const wu = bodySettings.weight_unit;
        const hu = bodySettings.measurement_unit;
        setWeightUnit(wu);
        setHeightUnit(hu);

        if (saved) {
          const profile: NutritionProfile = migrateProfile(typeof saved === "string" ? JSON.parse(saved) : saved);
          setBirthYear(String(profile.birthYear));
          setWeight(String(profile.weight));
          setHeight(String(profile.height));
          setSex(profile.sex);
          setActivityLevel(profile.activityLevel);
          setGoal(profile.goal);
          initialSnapshot.current = JSON.stringify({
            birthYear: String(profile.birthYear),
            weight: String(profile.weight),
            height: String(profile.height),
            sex: profile.sex,
            activityLevel: profile.activityLevel,
            goal: profile.goal,
          });
        } else {
          if (latestWeight) {
            setWeight(String(latestWeight.weight));
          }
          initialSnapshot.current = JSON.stringify({
            birthYear: "",
            weight: latestWeight ? String(latestWeight.weight) : "",
            height: "",
            sex: "male",
            activityLevel: "moderately_active",
            goal: "maintain",
          });
        }
        setLoadError(null);
        setLoaded(true);
      } catch {
        if (!active) return;
        setLoadError("Could not load your profile. Please try again.");
      }
    }
    load();
    return () => { active = false; };
  }, [initialProfile]);

  // Track dirty state
  useEffect(() => {
    if (!loaded || !onDirtyChange) return;
    const current = JSON.stringify({ birthYear, weight, height, sex, activityLevel, goal });
    onDirtyChange(current !== initialSnapshot.current);
  }, [birthYear, weight, height, sex, activityLevel, goal, loaded, onDirtyChange]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    const birthYearNum = parseInt(birthYear, 10);
    const weightNum = parseFloat(weight);
    const heightNum = parseFloat(height);
    const currentYear = new Date().getFullYear();

    if (!birthYear || isNaN(birthYearNum) || birthYearNum < 1900 || birthYearNum >= currentYear) {
      e.birthYear = `Enter a valid birth year (1900–${currentYear - 1})`;
    }
    if (!weight || isNaN(weightNum) || weightNum <= 0) {
      e.weight = "Enter a valid weight";
    }
    if (!height || isNaN(heightNum) || heightNum <= 0) {
      e.height = "Enter a valid height";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const profile: NutritionProfile = {
        birthYear: parseInt(birthYear, 10),
        weight: parseFloat(weight),
        height: parseFloat(height),
        sex,
        activityLevel,
        goal,
        weightUnit,
        heightUnit,
      };

      await setAppSetting("nutrition_profile", JSON.stringify(profile));

      const result = calculateFromProfile(profile);
      await updateMacroTargets(result.calories, result.protein, result.carbs, result.fat);

      onSave();
    } catch {
      setSaveError("Could not save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return {
    birthYear, setBirthYear,
    weight, setWeight,
    height, setHeight,
    sex, setSex,
    activityLevel, setActivityLevel,
    goal, setGoal,
    weightUnit,
    heightUnit,
    saving,
    activityMenuVisible, setActivityMenuVisible,
    errors,
    loadError, setLoadError,
    saveError, setSaveError,
    handleSave,
  };
}
