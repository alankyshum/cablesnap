import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/bna-toast";
import { flowCardStyle } from "./ui/FlowContainer";
import { useFocusEffect } from "@react-navigation/native";
import { getAppSetting, setAppSetting, updateMacroTargets } from "../lib/db";
import { getBodySettings, getLatestBodyWeight } from "../lib/db/body";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  ACTIVITY_LABELS,
  GOAL_LABELS,
  calculateFromProfile,
  migrateProfile,
  type ActivityLevel,
  type Goal,
  type NutritionProfile,
  type Sex,
} from "../lib/nutrition-calc";

const SEX_BUTTONS = [
  { value: "male", label: "Male", accessibilityLabel: "Male" },
  { value: "female", label: "Female", accessibilityLabel: "Female" },
] as const;

const ACTIVITY_BUTTONS = [
  { value: "sedentary", label: ACTIVITY_LABELS.sedentary.split(" ")[0], accessibilityLabel: ACTIVITY_LABELS.sedentary },
  { value: "lightly_active", label: ACTIVITY_LABELS.lightly_active.split(" ")[0], accessibilityLabel: ACTIVITY_LABELS.lightly_active },
  { value: "moderately_active", label: ACTIVITY_LABELS.moderately_active.split(" ")[0], accessibilityLabel: ACTIVITY_LABELS.moderately_active },
  { value: "very_active", label: ACTIVITY_LABELS.very_active.split(" ")[0], accessibilityLabel: ACTIVITY_LABELS.very_active },
  { value: "extra_active", label: ACTIVITY_LABELS.extra_active.split(" ")[0], accessibilityLabel: ACTIVITY_LABELS.extra_active },
] as const;

const GOAL_BUTTONS = [
  { value: "cut", label: GOAL_LABELS.cut, accessibilityLabel: GOAL_LABELS.cut },
  { value: "maintain", label: GOAL_LABELS.maintain, accessibilityLabel: GOAL_LABELS.maintain },
  { value: "bulk", label: GOAL_LABELS.bulk, accessibilityLabel: GOAL_LABELS.bulk },
] as const;

type CardState = "loading" | "error" | "ready";

// eslint-disable-next-line max-lines-per-function
export default function BodyProfileCard() {
  const colors = useThemeColors();
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

      const wu = bodySettings.weight_unit;
      const hu = bodySettings.measurement_unit;
      setWeightUnit(wu);
      setHeightUnit(hu);

      if (saved) {
        const profile: NutritionProfile = migrateProfile(JSON.parse(saved));
        setBirthYear(String(profile.birthYear));
        setWeight(String(profile.weight));
        setHeight(String(profile.height));
        setSex(profile.sex);
        setActivityLevel(profile.activityLevel);
        setGoal(profile.goal);
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

  async function saveProfile(
    birthYearVal: string, weightVal: string, heightVal: string,
    sexVal: Sex, actVal: ActivityLevel, goalVal: Goal,
  ) {
    const birthYearErr = validateField("birthYear", birthYearVal);
    const weightErr = validateField("weight", weightVal);
    const heightErr = validateField("height", heightVal);

    if (birthYearErr || weightErr || heightErr) {
      return;
    }

    try {
      const profile: NutritionProfile = {
        birthYear: parseInt(birthYearVal, 10),
        weight: parseFloat(weightVal),
        height: parseFloat(heightVal),
        sex: sexVal,
        activityLevel: actVal,
        goal: goalVal,
        weightUnit,
        heightUnit,
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
  ) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveProfile(birthYearVal, weightVal, heightVal, sexVal, actVal, goalVal);
    }, 300);
  }

  function handleFieldBlur(field: string, value: string) {
    const err = validateField(field, value);
    setErrors((prev) => {
      const next = { ...prev };
      if (err) {
        next[field] = err;
      } else {
        delete next[field];
      }
      return next;
    });
    if (!err) {
      saveProfile(birthYear, weight, height, sex, activityLevel, goal);
    }
  }

  function handleSegmentChange(
    field: "sex" | "activityLevel" | "goal",
    value: string,
  ) {
    let newSex = sex;
    let newAct = activityLevel;
    let newGoal = goal;

    if (field === "sex") { newSex = value as Sex; setSex(newSex); }
    else if (field === "activityLevel") { newAct = value as ActivityLevel; setActivityLevel(newAct); }
    else if (field === "goal") { newGoal = value as Goal; setGoal(newGoal); }

    debouncedSave(birthYear, weight, height, newSex, newAct, newGoal);
  }

  if (cardState === "loading") {
    return (
      <Card style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface }])}>
        <CardContent>
          <View style={styles.loadingContainer}>
            <Spinner size="sm" />
            <Text variant="body" style={{ color: colors.onSurfaceVariant, marginLeft: 8 }}>
              Loading profile…
            </Text>
          </View>
        </CardContent>
      </Card>
    );
  }

  if (cardState === "error") {
    return (
      <Card style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface }])}>
        <CardContent>
          <Text variant="body" style={{ color: colors.error, marginBottom: 8 }}>
            Could not load profile
          </Text>
          <Button variant="outline" onPress={loadProfile} accessibilityLabel="Retry loading profile">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface }])}>
      <CardContent>
        <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 16 }}>
          Body Profile
        </Text>

        <Input
          label="Birth Year"
          value={birthYear}
          onChangeText={setBirthYear}
          onBlur={() => handleFieldBlur("birthYear", birthYear)}
          keyboardType="numeric"
          variant="outline"
          containerStyle={styles.input}
          placeholder="1990"
          accessibilityLabel="Birth year"
          accessibilityHint="Enter your birth year for calorie calculation"
          error={errors.birthYear}
        />

        <Input
          label={`Weight (${weightUnit})`}
          value={weight}
          onChangeText={setWeight}
          onBlur={() => handleFieldBlur("weight", weight)}
          keyboardType="numeric"
          variant="outline"
          containerStyle={styles.input}
          accessibilityLabel={`Weight in ${weightUnit}`}
          accessibilityHint="Enter your current body weight"
          error={errors.weight}
        />

        <Input
          label={`Height (${heightUnit})`}
          value={height}
          onChangeText={setHeight}
          onBlur={() => handleFieldBlur("height", height)}
          keyboardType="numeric"
          variant="outline"
          containerStyle={styles.input}
          accessibilityLabel={`Height in ${heightUnit}`}
          accessibilityHint="Enter your height"
          error={errors.height}
        />

        <Text variant="caption" style={[styles.fieldLabel, { color: colors.onSurface, fontWeight: "600" }]}>
          Sex
        </Text>
        <SegmentedControl
          value={sex}
          onValueChange={(v) => handleSegmentChange("sex", v)}
          buttons={SEX_BUTTONS as unknown as Array<{ value: string; label: string; accessibilityLabel: string }>}
          style={styles.segmented}
        />

        <Text variant="caption" style={[styles.fieldLabel, { color: colors.onSurface, fontWeight: "600" }]}>
          Activity Level
        </Text>
        <SegmentedControl
          value={activityLevel}
          onValueChange={(v) => handleSegmentChange("activityLevel", v)}
          buttons={ACTIVITY_BUTTONS as unknown as Array<{ value: string; label: string; accessibilityLabel: string }>}
          style={styles.segmented}
        />

        <Text variant="caption" style={[styles.fieldLabel, { color: colors.onSurface, fontWeight: "600" }]}>
          Goal
        </Text>
        <SegmentedControl
          value={goal}
          onValueChange={(v) => handleSegmentChange("goal", v)}
          buttons={GOAL_BUTTONS as unknown as Array<{ value: string; label: string; accessibilityLabel: string }>}
          style={styles.segmented}
        />
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    ...flowCardStyle,
    maxWidth: undefined,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  input: { marginBottom: 4 },
  fieldLabel: { marginTop: 16, marginBottom: 8, fontSize: 14 },
  segmented: { marginBottom: 8 },
});
