import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  SegmentedButtons,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { useFocusEffect } from "@react-navigation/native";
import { getAppSetting, setAppSetting, updateMacroTargets } from "../lib/db";
import { getBodySettings, getLatestBodyWeight } from "../lib/db/body";
import {
  ACTIVITY_LABELS,
  GOAL_LABELS,
  calculateFromProfile,
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
  { value: "sedentary", label: ACTIVITY_LABELS.sedentary.split(" ")[0], accessibilityLabel: ACTIVITY_LABELS.sedentary, style: { minHeight: 48 } },
  { value: "lightly_active", label: ACTIVITY_LABELS.lightly_active.split(" ")[0], accessibilityLabel: ACTIVITY_LABELS.lightly_active, style: { minHeight: 48 } },
  { value: "moderately_active", label: ACTIVITY_LABELS.moderately_active.split(" ")[0], accessibilityLabel: ACTIVITY_LABELS.moderately_active, style: { minHeight: 48 } },
  { value: "very_active", label: ACTIVITY_LABELS.very_active.split(" ")[0], accessibilityLabel: ACTIVITY_LABELS.very_active, style: { minHeight: 48 } },
  { value: "extra_active", label: ACTIVITY_LABELS.extra_active.split(" ")[0], accessibilityLabel: ACTIVITY_LABELS.extra_active, style: { minHeight: 48 } },
] as const;

const GOAL_BUTTONS = [
  { value: "cut", label: GOAL_LABELS.cut, accessibilityLabel: GOAL_LABELS.cut },
  { value: "maintain", label: GOAL_LABELS.maintain, accessibilityLabel: GOAL_LABELS.maintain },
  { value: "bulk", label: GOAL_LABELS.bulk, accessibilityLabel: GOAL_LABELS.bulk },
] as const;

type CardState = "loading" | "error" | "ready";

export default function BodyProfileCard() {
  const theme = useTheme();
  const [cardState, setCardState] = useState<CardState>("loading");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [sex, setSex] = useState<Sex>("male");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("moderately_active");
  const [goal, setGoal] = useState<Goal>("maintain");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [heightUnit, setHeightUnit] = useState<"cm" | "in">("cm");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [snack, setSnack] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const profile: NutritionProfile = JSON.parse(saved);
        setAge(String(profile.age));
        setWeight(String(profile.weight));
        setHeight(String(profile.height));
        setSex(profile.sex);
        setActivityLevel(profile.activityLevel);
        setGoal(profile.goal);
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
    if (field === "age") {
      if (!value || isNaN(num) || num < 1 || num > 120) return "Enter a valid age (1–120)";
    } else if (field === "weight") {
      if (!value || isNaN(num) || num <= 0) return "Enter a valid weight";
    } else if (field === "height") {
      if (!value || isNaN(num) || num <= 0) return "Enter a valid height";
    }
    return null;
  }

  async function saveProfile(
    ageVal: string, weightVal: string, heightVal: string,
    sexVal: Sex, actVal: ActivityLevel, goalVal: Goal,
  ) {
    const ageErr = validateField("age", ageVal);
    const weightErr = validateField("weight", weightVal);
    const heightErr = validateField("height", heightVal);

    if (ageErr || weightErr || heightErr) {
      return;
    }

    try {
      const profile: NutritionProfile = {
        age: parseFloat(ageVal),
        weight: parseFloat(weightVal),
        height: parseFloat(heightVal),
        sex: sexVal,
        activityLevel: actVal,
        goal: goalVal,
        weightUnit,
        heightUnit,
      };
      await setAppSetting("nutrition_profile", JSON.stringify(profile));
      const result = calculateFromProfile(profile);
      await updateMacroTargets(result.calories, result.protein, result.carbs, result.fat);
      setSnack("Profile saved");
    } catch {
      setSnack("Could not save profile");
    }
  }

  function debouncedSave(
    ageVal: string, weightVal: string, heightVal: string,
    sexVal: Sex, actVal: ActivityLevel, goalVal: Goal,
  ) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveProfile(ageVal, weightVal, heightVal, sexVal, actVal, goalVal);
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
      saveProfile(age, weight, height, sex, activityLevel, goal);
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

    debouncedSave(age, weight, height, newSex, newAct, newGoal);
  }

  if (cardState === "loading") {
    return (
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" />
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}>
              Loading profile…
            </Text>
          </View>
        </Card.Content>
      </Card>
    );
  }

  if (cardState === "error") {
    return (
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="bodyMedium" style={{ color: theme.colors.error, marginBottom: 8 }}>
            Could not load profile
          </Text>
          <Button mode="outlined" onPress={loadProfile} compact accessibilityLabel="Retry loading profile">
            Retry
          </Button>
        </Card.Content>
      </Card>
    );
  }

  return (
    <>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 16 }}>
            Body Profile
          </Text>

          <TextInput
            label="Age"
            value={age}
            onChangeText={setAge}
            onBlur={() => handleFieldBlur("age", age)}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
            accessibilityLabel="Age in years"
            accessibilityHint="Enter your age for calorie calculation"
            error={!!errors.age}
          />
          {errors.age ? (
            <Text style={[styles.errorText, { color: theme.colors.error }]} accessibilityLiveRegion="polite">
              {errors.age}
            </Text>
          ) : null}

          <TextInput
            label={`Weight (${weightUnit})`}
            value={weight}
            onChangeText={setWeight}
            onBlur={() => handleFieldBlur("weight", weight)}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
            accessibilityLabel={`Weight in ${weightUnit}`}
            accessibilityHint="Enter your current body weight"
            error={!!errors.weight}
          />
          {errors.weight ? (
            <Text style={[styles.errorText, { color: theme.colors.error }]} accessibilityLiveRegion="polite">
              {errors.weight}
            </Text>
          ) : null}

          <TextInput
            label={`Height (${heightUnit})`}
            value={height}
            onChangeText={setHeight}
            onBlur={() => handleFieldBlur("height", height)}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
            accessibilityLabel={`Height in ${heightUnit}`}
            accessibilityHint="Enter your height"
            error={!!errors.height}
          />
          {errors.height ? (
            <Text style={[styles.errorText, { color: theme.colors.error }]} accessibilityLiveRegion="polite">
              {errors.height}
            </Text>
          ) : null}

          <Text variant="labelLarge" style={[styles.fieldLabel, { color: theme.colors.onSurface }]}>
            Sex
          </Text>
          <SegmentedButtons
            value={sex}
            onValueChange={(v) => handleSegmentChange("sex", v)}
            buttons={SEX_BUTTONS as unknown as Array<{ value: string; label: string; accessibilityLabel: string }>}
            style={styles.segmented}
          />

          <Text variant="labelLarge" style={[styles.fieldLabel, { color: theme.colors.onSurface }]}>
            Activity Level
          </Text>
          <SegmentedButtons
            value={activityLevel}
            onValueChange={(v) => handleSegmentChange("activityLevel", v)}
            buttons={ACTIVITY_BUTTONS as unknown as Array<{ value: string; label: string; accessibilityLabel: string; style: Record<string, number> }>}
            style={styles.segmented}
          />

          <Text variant="labelLarge" style={[styles.fieldLabel, { color: theme.colors.onSurface }]}>
            Goal
          </Text>
          <SegmentedButtons
            value={goal}
            onValueChange={(v) => handleSegmentChange("goal", v)}
            buttons={GOAL_BUTTONS as unknown as Array<{ value: string; label: string; accessibilityLabel: string }>}
            style={styles.segmented}
          />
        </Card.Content>
      </Card>

      <Snackbar
        visible={!!snack}
        onDismiss={() => setSnack("")}
        duration={2000}
      >
        {snack}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 0 },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  input: { marginBottom: 4 },
  fieldLabel: { marginTop: 16, marginBottom: 8, fontSize: 14 },
  segmented: { marginBottom: 8 },
  errorText: { fontSize: 14, marginBottom: 8 },
});
