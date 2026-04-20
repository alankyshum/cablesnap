import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { getAppSetting, setAppSetting, updateMacroTargets } from "../lib/db";
import { getBodySettings, getLatestBodyWeight, updateBodySex } from "../lib/db/body";
import { useToast } from "@/components/ui/bna-toast";
import {
  calculateFromProfile,
  calculateBMR,
  convertToMetric,
  calculateDeviationPercent,
  migrateProfile,
  type ActivityLevel,
  type Goal,
  type NutritionProfile,
  type Sex,
} from "../lib/nutrition-calc";

type CardState = "loading" | "error" | "ready";

function validateField(field: string, value: string): string | null {
  const num = parseFloat(value);
  if (field === "birthYear") {
    const currentYear = new Date().getFullYear();
    if (!value || isNaN(num) || !Number.isInteger(num) || num < 1900 || num >= currentYear) {
      return `Enter a valid birth year (1900–${currentYear - 1})`;
    }
  } else if (field === "weight") {
    if (!value || isNaN(num) || num <= 0) return "Enter a valid weight";
  } else if (field === "height") {
    if (!value || isNaN(num) || num <= 0) return "Enter a valid height";
  }
  return null;
}

export function useBodyProfile() {
  const [cardState, setCardState] = useState<CardState>("loading");
  const [birthYear, setBirthYear] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [sex, setSex] = useState<Sex>("male");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("moderately_active");
  const [goal, setGoal] = useState<Goal>("maintain");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [heightUnit, setHeightUnit] = useState<"cm" | "in">("cm");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activityMenuVisible, setActivityMenuVisible] = useState(false);
  const [rmrOverride, setRmrOverride] = useState("");
  const toast = useToast();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);
  const initialSnapshot = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const loadProfile = useCallback(async () => {
    setCardState("loading");
    try {
      const [saved, bodySettings, latestWeight] = await Promise.all([
        getAppSetting("nutrition_profile"),
        getBodySettings(),
        getLatestBodyWeight(),
      ]);

      setWeightUnit(bodySettings.weight_unit);
      setHeightUnit(bodySettings.measurement_unit);
      setSex(bodySettings.sex);

      if (saved) {
        const profile: NutritionProfile = migrateProfile(JSON.parse(saved));
        setBirthYear(String(profile.birthYear));
        setWeight(String(profile.weight));
        setHeight(String(profile.height));
        setActivityLevel(profile.activityLevel);
        setGoal(profile.goal);
        if (profile.rmr_override != null && profile.rmr_override > 0) {
          setRmrOverride(String(profile.rmr_override));
        }
        initialSnapshot.current = JSON.stringify(profile);
      } else if (latestWeight) {
        setWeight(String(latestWeight.weight));
      }
      setCardState("ready");
    } catch {
      setCardState("error");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  async function saveProfile(
    birthYearVal: string, weightVal: string, heightVal: string,
    sexVal: Sex, actVal: ActivityLevel, goalVal: Goal,
    rmrVal?: string,
  ) {
    if (validateField("birthYear", birthYearVal) || validateField("weight", weightVal) || validateField("height", heightVal)) {
      return;
    }

    try {
      const rmrNum = rmrVal ? parseFloat(rmrVal) : null;
      const profile: NutritionProfile = {
        birthYear: parseInt(birthYearVal, 10),
        weight: parseFloat(weightVal),
        height: parseFloat(heightVal),
        sex: sexVal,
        activityLevel: actVal,
        goal: goalVal,
        weightUnit,
        heightUnit,
        ...(rmrNum != null && rmrNum > 0 ? { rmr_override: rmrNum } : {}),
      };

      const profileJson = JSON.stringify(profile);
      if (profileJson === initialSnapshot.current) return;

      await setAppSetting("nutrition_profile", JSON.stringify(profile));
      const result = calculateFromProfile(profile);
      await updateMacroTargets(result.calories, result.protein, result.carbs, result.fat);
      initialSnapshot.current = profileJson;
      if (isMounted.current) toast.success("Profile saved");
    } catch {
      if (isMounted.current) toast.error("Could not save profile");
    }
  }

  function debouncedSave(
    birthYearVal: string, weightVal: string, heightVal: string,
    sexVal: Sex, actVal: ActivityLevel, goalVal: Goal,
    rmrVal?: string,
  ) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveProfile(birthYearVal, weightVal, heightVal, sexVal, actVal, goalVal, rmrVal);
    }, 300);
  }

  function handleFieldBlur(field: string, value: string) {
    const err = validateField(field, value);
    setErrors((prev) => {
      const next = { ...prev };
      if (err) next[field] = err; else delete next[field];
      return next;
    });
    if (!err) saveProfile(birthYear, weight, height, sex, activityLevel, goal, rmrOverride);
  }

  function handleSegmentChange(field: "sex" | "activityLevel" | "goal", value: string) {
    let newSex = sex;
    let newAct = activityLevel;
    let newGoal = goal;

    if (field === "sex") { newSex = value as Sex; setSex(newSex); updateBodySex(newSex); }
    else if (field === "activityLevel") { newAct = value as ActivityLevel; setActivityLevel(newAct); }
    else if (field === "goal") { newGoal = value as Goal; setGoal(newGoal); }

    debouncedSave(birthYear, weight, height, newSex, newAct, newGoal, rmrOverride);
  }

  function handleRmrChange(value: string) {
    setRmrOverride(value);
    debouncedSave(birthYear, weight, height, sex, activityLevel, goal, value);
  }

  function clearRmrOverride() {
    setRmrOverride("");
    debouncedSave(birthYear, weight, height, sex, activityLevel, goal, "");
  }

  // Compute deviation info for the UI
  const rmrDeviationInfo = (() => {
    const rmrNum = parseFloat(rmrOverride);
    if (!rmrOverride || isNaN(rmrNum) || rmrNum <= 0) return null;

    const weightNum = parseFloat(weight);
    const heightNum = parseFloat(height);
    const birthYearNum = parseInt(birthYear, 10);
    if (!weight || isNaN(weightNum) || !height || isNaN(heightNum) || !birthYear || isNaN(birthYearNum)) return null;

    const { weight_kg, height_cm } = convertToMetric(weightNum, weightUnit, heightNum, heightUnit);
    const age = new Date().getFullYear() - birthYearNum;
    const estimatedBMR = calculateBMR(weight_kg, height_cm, age, sex);
    const deviation = calculateDeviationPercent(rmrNum, estimatedBMR);
    return deviation > 20 ? { deviation: Math.round(deviation), estimated: Math.round(estimatedBMR) } : null;
  })();

  return {
    cardState, loadProfile,
    birthYear, setBirthYear, weight, setWeight, height, setHeight,
    sex, activityLevel, goal, weightUnit, heightUnit,
    errors, activityMenuVisible, setActivityMenuVisible,
    handleFieldBlur, handleSegmentChange,
    rmrOverride, handleRmrChange, clearRmrOverride, rmrDeviationInfo,
  };
}
