import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  Banner,
  Button,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { getAppSetting, setAppSetting, updateMacroTargets } from "../lib/db";
import { getBodySettings, getLatestBodyWeight } from "../lib/db/body";
import {
  calculateFromProfile,
  ACTIVITY_LABELS,
  GOAL_LABELS,
  type ActivityLevel,
  type Goal,
  type NutritionProfile,
  type Sex,
} from "../lib/nutrition-calc";

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

const SEX_BUTTONS = [
  { value: "male", label: "Male", accessibilityLabel: "Male" },
  { value: "female", label: "Female", accessibilityLabel: "Female" },
] as const;

export interface ProfileFormProps {
  initialProfile?: NutritionProfile;
  onSave: () => void;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export default function ProfileForm({ initialProfile, onSave, onCancel, onDirtyChange }: ProfileFormProps) {
  const theme = useTheme();
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [sex, setSex] = useState<Sex>("male");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("moderately_active");
  const [goal, setGoal] = useState<Goal>("maintain");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [heightUnit, setHeightUnit] = useState<"cm" | "in">("cm");
  const [saving, setSaving] = useState(false);
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
          const profile: NutritionProfile = typeof saved === "string" ? JSON.parse(saved) : saved;
          setAge(String(profile.age));
          setWeight(String(profile.weight));
          setHeight(String(profile.height));
          setSex(profile.sex);
          setActivityLevel(profile.activityLevel);
          setGoal(profile.goal);
          initialSnapshot.current = JSON.stringify({
            age: String(profile.age),
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
            age: "",
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
    const current = JSON.stringify({ age, weight, height, sex, activityLevel, goal });
    onDirtyChange(current !== initialSnapshot.current);
  }, [age, weight, height, sex, activityLevel, goal, loaded, onDirtyChange]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    const ageNum = parseFloat(age);
    const weightNum = parseFloat(weight);
    const heightNum = parseFloat(height);

    if (!age || isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
      e.age = "Enter a valid age (1–120)";
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
        age: parseFloat(age),
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

  return (
    <View>
      {loadError ? (
        <Banner
          visible
          actions={[{ label: "Dismiss", onPress: () => setLoadError(null) }]}
          icon="alert-circle-outline"
          style={{ marginBottom: 12 }}
        >
          {loadError}
        </Banner>
      ) : null}

      {saveError ? (
        <Banner
          visible
          actions={[{ label: "Dismiss", onPress: () => setSaveError(null) }]}
          icon="alert-circle-outline"
          style={{ marginBottom: 12 }}
        >
          {saveError}
        </Banner>
      ) : null}

      <Text
        variant="titleMedium"
        style={{ color: theme.colors.onSurface, marginBottom: 16 }}
      >
        Your Profile
      </Text>

      <TextInput
        label="Age"
        value={age}
        onChangeText={setAge}
        keyboardType="numeric"
        mode="outlined"
        style={styles.input}
        accessibilityLabel="Age in years"
        accessibilityHint="Enter your age for calorie calculation"
        error={!!errors.age}
      />
      {errors.age ? (
        <Text
          style={[styles.errorText, { color: theme.colors.error }]}
          accessibilityLiveRegion="polite"
        >
          {errors.age}
        </Text>
      ) : null}

      <TextInput
        label={"Weight (" + weightUnit + ")"}
        value={weight}
        onChangeText={setWeight}
        keyboardType="numeric"
        mode="outlined"
        style={styles.input}
        accessibilityLabel={"Weight in " + weightUnit}
        accessibilityHint="Enter your current body weight"
        error={!!errors.weight}
      />
      {errors.weight ? (
        <Text
          style={[styles.errorText, { color: theme.colors.error }]}
          accessibilityLiveRegion="polite"
        >
          {errors.weight}
        </Text>
      ) : null}

      <TextInput
        label={"Height (" + heightUnit + ")"}
        value={height}
        onChangeText={setHeight}
        keyboardType="numeric"
        mode="outlined"
        style={styles.input}
        accessibilityLabel={"Height in " + heightUnit}
        accessibilityHint="Enter your height"
        error={!!errors.height}
      />
      {errors.height ? (
        <Text
          style={[styles.errorText, { color: theme.colors.error }]}
          accessibilityLiveRegion="polite"
        >
          {errors.height}
        </Text>
      ) : null}

      <Text
        variant="labelLarge"
        style={[styles.fieldLabel, { color: theme.colors.onSurface }]}
      >
        Sex
      </Text>
      <SegmentedButtons
        value={sex}
        onValueChange={(v) => setSex(v as Sex)}
        buttons={SEX_BUTTONS as unknown as Array<{ value: string; label: string; accessibilityLabel: string }>}
        style={styles.segmented}
      />

      <Text
        variant="labelLarge"
        style={[styles.fieldLabel, { color: theme.colors.onSurface }]}
      >
        Activity Level
      </Text>
      <SegmentedButtons
        value={activityLevel}
        onValueChange={(v) => setActivityLevel(v as ActivityLevel)}
        buttons={ACTIVITY_BUTTONS as unknown as Array<{ value: string; label: string; accessibilityLabel: string; style: Record<string, number> }>}
        style={styles.segmented}
      />

      <Text
        variant="labelLarge"
        style={[styles.fieldLabel, { color: theme.colors.onSurface }]}
      >
        Goal
      </Text>
      <SegmentedButtons
        value={goal}
        onValueChange={(v) => setGoal(v as Goal)}
        buttons={GOAL_BUTTONS as unknown as Array<{ value: string; label: string; accessibilityLabel: string }>}
        style={styles.segmented}
      />

      <View style={styles.buttonRow}>
        {onCancel ? (
          <Button
            mode="outlined"
            onPress={onCancel}
            style={{ flex: 1, marginRight: 8 }}
            contentStyle={styles.btnContent}
            accessibilityLabel="Cancel profile editing"
          >
            Cancel
          </Button>
        ) : null}
        <Button
          mode="contained"
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          style={onCancel ? { flex: 1 } : { marginTop: 24 }}
          contentStyle={styles.btnContent}
          accessibilityLabel="Calculate and save nutrition targets"
        >
          Calculate & Save
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { marginBottom: 4 },
  fieldLabel: { marginTop: 16, marginBottom: 8, fontSize: 14 },
  segmented: { marginBottom: 8 },
  btnContent: { paddingVertical: 8, minHeight: 48 },
  errorText: { fontSize: 14, marginBottom: 8 },
  buttonRow: { flexDirection: "row", marginTop: 16 },
});
