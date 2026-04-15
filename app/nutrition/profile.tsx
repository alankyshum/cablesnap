import { useCallback, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import {
  Button,
  Card,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { router, useFocusEffect } from "expo-router";
import { getAppSetting, setAppSetting } from "../../lib/db";
import { getBodySettings, getLatestBodyWeight } from "../../lib/db/body";
import {
  calculateFromProfile,
  ACTIVITY_LABELS,
  GOAL_LABELS,
  type ActivityLevel,
  type Goal,
  type NutritionProfile,
  type Sex,
} from "../../lib/nutrition-calc";
import { updateMacroTargets } from "../../lib/db";

const ACTIVITY_LEVELS: ActivityLevel[] = [
  "sedentary",
  "lightly_active",
  "moderately_active",
  "very_active",
  "extra_active",
];

export default function ProfileScreen() {
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

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        const [saved, bodySettings, latestWeight] = await Promise.all([
          getAppSetting("nutrition_profile"),
          getBodySettings(),
          getLatestBodyWeight(),
        ]);

        if (!active) return;

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
      }
      load();
      return () => { active = false; };
    }, [])
  );

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

      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text
            variant="titleMedium"
            style={{ color: theme.colors.onSurface, marginBottom: 16, fontSize: 18 }}
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
            buttons={[
              { value: "male", label: "Male", accessibilityLabel: "Male" },
              { value: "female", label: "Female", accessibilityLabel: "Female" },
            ]}
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
            buttons={ACTIVITY_LEVELS.map((level) => ({
              value: level,
              label: ACTIVITY_LABELS[level].split(" ")[0],
              accessibilityLabel: ACTIVITY_LABELS[level],
              style: styles.activityButton,
            }))}
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
            buttons={(["cut", "maintain", "bulk"] as Goal[]).map((g) => ({
              value: g,
              label: GOAL_LABELS[g],
              accessibilityLabel: GOAL_LABELS[g],
            }))}
            style={styles.segmented}
          />

          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            style={styles.btn}
            contentStyle={styles.btnContent}
            accessibilityLabel="Calculate and save nutrition targets"
          >
            Calculate & Save
          </Button>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  card: { marginBottom: 16 },
  input: { marginBottom: 4 },
  fieldLabel: { marginTop: 16, marginBottom: 8, fontSize: 14 },
  segmented: { marginBottom: 8 },
  activityButton: { minHeight: 48 },
  btn: { marginTop: 24 },
  btnContent: { paddingVertical: 8, minHeight: 48 },
  errorText: { fontSize: 14, marginBottom: 8 },
});
