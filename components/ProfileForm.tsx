import { View } from "react-native";
import { StyleSheet } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  GOAL_LABELS,
  type Goal,
  type NutritionProfile,
  type Sex,
} from "../lib/nutrition-calc";
import { useProfileForm } from "../hooks/useProfileForm";
import { ActivityDropdown } from "./profile/ActivityDropdown";
import { fontSizes } from "@/constants/design-tokens";

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
  const {
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
  } = useProfileForm({ initialProfile, onSave, onDirtyChange });

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
      <ActivityDropdown
        value={activityLevel}
        onChange={(key) => {
          setActivityLevel(key);
          setActivityMenuVisible(false);
        }}
        visible={activityMenuVisible}
        onToggle={() => setActivityMenuVisible(!activityMenuVisible)}
      />

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
  fieldLabel: { marginTop: 16, marginBottom: 8, fontSize: fontSizes.sm },
  segmented: { marginBottom: 8 },
  errorText: { fontSize: fontSizes.sm, marginBottom: 8 },
  buttonRow: { flexDirection: "row", marginTop: 16 },
});
