import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Banner, Button, Menu, SegmentedButtons, Text, TextInput } from "react-native-paper";
import { getAppSetting, setAppSetting, updateMacroTargets } from "../lib/db";
import { getBodySettings, getLatestBodyWeight } from "../lib/db/body";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  calculateFromProfile,
  migrateProfile,
  ACTIVITY_LABELS,
  GOAL_LABELS,
  type ActivityLevel,
  type Goal,
  type NutritionProfile,
  type Sex,
} from "../lib/nutrition-calc";

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
  const colors = useThemeColors();
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
        style={{ color: colors.onSurface, marginBottom: 16 }}
      >
        Your Profile
      </Text>

      <TextInput
        label="Birth Year"
        value={birthYear}
        onChangeText={setBirthYear}
        keyboardType="numeric"
        mode="outlined"
        style={styles.input}
        placeholder="1990"
        accessibilityLabel="Birth year"
        accessibilityHint="Enter your birth year for calorie calculation"
        error={!!errors.birthYear}
      />
      {errors.birthYear ? (
        <Text
          style={[styles.errorText, { color: colors.error }]}
          accessibilityLiveRegion="polite"
        >
          {errors.birthYear}
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
          style={[styles.errorText, { color: colors.error }]}
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
          style={[styles.errorText, { color: colors.error }]}
          accessibilityLiveRegion="polite"
        >
          {errors.height}
        </Text>
      ) : null}

      <Text
        variant="labelLarge"
        style={[styles.fieldLabel, { color: colors.onSurface }]}
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
        style={[styles.fieldLabel, { color: colors.onSurface }]}
      >
        Activity Level
      </Text>
      <Menu
        visible={activityMenuVisible}
        onDismiss={() => setActivityMenuVisible(false)}
        anchor={
          <Pressable
            onPress={() => setActivityMenuVisible(true)}
            style={[styles.dropdown, { borderColor: colors.outline, backgroundColor: colors.surface }]}
            accessibilityLabel={`Activity level: ${ACTIVITY_LABELS[activityLevel]}`}
            accessibilityRole="button"
            accessibilityState={{ expanded: activityMenuVisible }}
          >
            <Text variant="bodyLarge" style={{ color: colors.onSurface, flex: 1 }}>
              {ACTIVITY_LABELS[activityLevel]}
            </Text>
            <Text style={{ color: colors.onSurfaceVariant }}>▼</Text>
          </Pressable>
        }
        anchorPosition="bottom"
        style={{ width: "auto" }}
      >
        {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((key) => (
          <Menu.Item
            key={key}
            title={ACTIVITY_LABELS[key]}
            onPress={() => {
              setActivityLevel(key);
              setActivityMenuVisible(false);
            }}
            style={key === activityLevel ? { backgroundColor: colors.primaryContainer } : undefined}
            accessibilityLabel={ACTIVITY_LABELS[key]}
          />
        ))}
      </Menu>

      <Text
        variant="labelLarge"
        style={[styles.fieldLabel, { color: colors.onSurface }]}
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
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    minHeight: 48,
  },
  btnContent: { paddingVertical: 8, minHeight: 48 },
  errorText: { fontSize: 14, marginBottom: 8 },
  buttonRow: { flexDirection: "row", marginTop: 16 },
});
