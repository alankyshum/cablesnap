import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SegmentedControl } from "@/components/ui/segmented-control";
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
  const [activityExpanded, setActivityExpanded] = useState(false);
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
        <Alert variant="destructive" style={{ marginBottom: 12 }}>
          <AlertDescription>{loadError}</AlertDescription>
          <Button variant="ghost" size="sm" onPress={() => setLoadError(null)} style={{ marginTop: 8 }}>
            Dismiss
          </Button>
        </Alert>
      ) : null}

      {saveError ? (
        <Alert variant="destructive" style={{ marginBottom: 12 }}>
          <AlertDescription>{saveError}</AlertDescription>
          <Button variant="ghost" size="sm" onPress={() => setSaveError(null)} style={{ marginTop: 8 }}>
            Dismiss
          </Button>
        </Alert>
      ) : null}

      <Text
        variant="subtitle"
        style={{ color: colors.onSurface, marginBottom: 16 }}
      >
        Your Profile
      </Text>

      <Input
        label="Birth Year"
        value={birthYear}
        onChangeText={setBirthYear}
        keyboardType="numeric"
        variant="outline"
        placeholder="1990"
        accessibilityLabel="Birth year"
        accessibilityHint="Enter your birth year for calorie calculation"
        error={errors.birthYear}
        containerStyle={styles.input}
      />

      <Input
        label={"Weight (" + weightUnit + ")"}
        value={weight}
        onChangeText={setWeight}
        keyboardType="numeric"
        variant="outline"
        accessibilityLabel={"Weight in " + weightUnit}
        accessibilityHint="Enter your current body weight"
        error={errors.weight}
        containerStyle={styles.input}
      />

      <Input
        label={"Height (" + heightUnit + ")"}
        value={height}
        onChangeText={setHeight}
        keyboardType="numeric"
        variant="outline"
        accessibilityLabel={"Height in " + heightUnit}
        accessibilityHint="Enter your height"
        error={errors.height}
        containerStyle={styles.input}
      />

      <Text
        variant="caption"
        style={[styles.fieldLabel, { color: colors.onSurface, fontWeight: "600" }]}
      >
        Sex
      </Text>
      <SegmentedControl
        value={sex}
        onValueChange={(v) => setSex(v as Sex)}
        buttons={SEX_BUTTONS as unknown as Array<{ value: string; label: string; accessibilityLabel: string }>}
        style={styles.segmented}
      />

      <Text
        variant="caption"
        style={[styles.fieldLabel, { color: colors.onSurface, fontWeight: "600" }]}
      >
        Activity Level
      </Text>
      <Pressable
        onPress={() => setActivityExpanded(!activityExpanded)}
        style={[styles.dropdown, { borderColor: colors.outline, backgroundColor: colors.surface }]}
        accessibilityLabel={`Activity level: ${ACTIVITY_LABELS[activityLevel]}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: activityExpanded }}
      >
        <Text variant="body" style={{ color: colors.onSurface, flex: 1 }}>
          {ACTIVITY_LABELS[activityLevel]}
        </Text>
        <Text style={{ color: colors.onSurfaceVariant }}>{activityExpanded ? "▲" : "▼"}</Text>
      </Pressable>
      {activityExpanded && (
        <View style={[styles.dropdownList, { borderColor: colors.outline, backgroundColor: colors.surface }]}>
          {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((key) => (
            <Pressable
              key={key}
              onPress={() => {
                setActivityLevel(key);
                setActivityExpanded(false);
              }}
              style={[
                styles.dropdownItem,
                key === activityLevel ? { backgroundColor: colors.primaryContainer } : undefined,
              ]}
              accessibilityLabel={ACTIVITY_LABELS[key]}
              accessibilityRole="radio"
              accessibilityState={{ selected: key === activityLevel }}
            >
              <Text
                variant="body"
                style={{ color: key === activityLevel ? colors.onPrimaryContainer : colors.onSurface }}
              >
                {ACTIVITY_LABELS[key]}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text
        variant="caption"
        style={[styles.fieldLabel, { color: colors.onSurface, fontWeight: "600" }]}
      >
        Goal
      </Text>
      <SegmentedControl
        value={goal}
        onValueChange={(v) => setGoal(v as Goal)}
        buttons={GOAL_BUTTONS as unknown as Array<{ value: string; label: string; accessibilityLabel: string }>}
        style={styles.segmented}
      />

      <View style={styles.buttonRow}>
        {onCancel ? (
          <Button
            variant="outline"
            onPress={onCancel}
            style={{ flex: 1, marginRight: 8 }}
            accessibilityLabel="Cancel profile editing"
          >
            Cancel
          </Button>
        ) : null}
        <Button
          variant="default"
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          style={onCancel ? { flex: 1 } : { marginTop: 24 }}
          accessibilityLabel="Calculate and save nutrition targets"
        >
          Calculate &amp; Save
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
  dropdownList: {
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 8,
    overflow: "hidden",
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  errorText: { fontSize: 14, marginBottom: 8 },
  buttonRow: { flexDirection: "row", marginTop: 16 },
});
