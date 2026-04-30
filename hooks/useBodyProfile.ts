import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { getAppSetting, setAppSetting, updateMacroTargets } from "../lib/db";
import { getBodySettings, getLatestBodyWeight, updateBodySex } from "../lib/db/body";
import { safeParse } from "../lib/safe-parse";
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
import { convertWeight, convertHeight } from "../lib/units";

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

export function useBodyProfile(
  externalWeightUnit?: "kg" | "lb",
  externalHeightUnit?: "cm" | "in",
) {
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
  // Refs hold the latest external unit overrides so loadProfile can read them
  // at call-time without becoming unit-dependent. Keeping loadProfile's
  // useCallback deps stable prevents useFocusEffect from re-firing on every
  // unit toggle and clobbering the user's in-progress edits with the
  // persisted profile values (regression caught in BLD-515 review).
  const externalWeightUnitRef = useRef(externalWeightUnit);
  const externalHeightUnitRef = useRef(externalHeightUnit);
  useEffect(() => {
    externalWeightUnitRef.current = externalWeightUnit;
    externalHeightUnitRef.current = externalHeightUnit;
  });

  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // React to external unit changes (e.g. user toggles unit in settings UnitsCard
  // on the same screen) — convert the currently-displayed value to the new unit
  // so the label and numeric value stay in sync. Uses the "adjusting state during
  // render" pattern (https://react.dev/reference/react/useState#storing-information-from-previous-renders)
  // to avoid effect-triggered cascading renders.
  const [prevExternalWeightUnit, setPrevExternalWeightUnit] = useState(externalWeightUnit);
  if (externalWeightUnit && externalWeightUnit !== prevExternalWeightUnit) {
    setPrevExternalWeightUnit(externalWeightUnit);
    if (externalWeightUnit !== weightUnit) {
      const n = parseFloat(weight);
      if (weight && !isNaN(n) && n > 0) {
        setWeight(String(convertWeight(n, weightUnit, externalWeightUnit)));
      }
      setWeightUnit(externalWeightUnit);
    }
  }

  const [prevExternalHeightUnit, setPrevExternalHeightUnit] = useState(externalHeightUnit);
  if (externalHeightUnit && externalHeightUnit !== prevExternalHeightUnit) {
    setPrevExternalHeightUnit(externalHeightUnit);
    if (externalHeightUnit !== heightUnit) {
      const n = parseFloat(height);
      if (height && !isNaN(n) && n > 0) {
        setHeight(String(convertHeight(n, heightUnit, externalHeightUnit)));
      }
      setHeightUnit(externalHeightUnit);
    }
  }

  const loadProfile = useCallback(async () => {
    setCardState("loading");
    try {
      const [saved, bodySettings, latestWeight] = await Promise.all([
        getAppSetting("nutrition_profile"),
        getBodySettings(),
        getLatestBodyWeight(),
      ]);

      const activeWeightUnit = externalWeightUnitRef.current ?? bodySettings.weight_unit;
      const activeHeightUnit = externalHeightUnitRef.current ?? bodySettings.measurement_unit;
      setWeightUnit(activeWeightUnit);
      setHeightUnit(activeHeightUnit);
      setSex(bodySettings.sex);

      if (saved) {
        const parsed = safeParse<Record<string, unknown> | null>(saved, null, "useBodyProfile.nutrition_profile");
        if (!parsed) { setCardState("ready"); return; }
        const profile: NutritionProfile = migrateProfile(parsed);
        setBirthYear(String(profile.birthYear));
        const displayWeight = convertWeight(
          profile.weight,
          profile.weightUnit,
          activeWeightUnit,
        );
        const displayHeight = convertHeight(
          profile.height,
          profile.heightUnit,
          activeHeightUnit,
        );
        setWeight(String(displayWeight));
        setHeight(String(displayHeight));
        setActivityLevel(profile.activityLevel);
        setGoal(profile.goal);
        if (profile.rmr_override != null && profile.rmr_override > 0) {
          setRmrOverride(String(profile.rmr_override));
        }
        initialSnapshot.current = JSON.stringify({
          ...profile,
          weight: displayWeight,
          height: displayHeight,
          weightUnit: activeWeightUnit,
          heightUnit: activeHeightUnit,
        });
      } else if (latestWeight) {
        const display = convertWeight(latestWeight.weight, "kg", activeWeightUnit);
        setWeight(String(display));
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
