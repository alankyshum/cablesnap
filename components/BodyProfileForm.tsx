import React from "react";
import { StyleSheet } from "react-native";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ActivityDropdown } from "./profile/ActivityDropdown";
import { GOAL_LABELS, type ActivityLevel, type Goal, type Sex } from "../lib/nutrition-calc";
import { fontSizes } from "@/constants/design-tokens";

const SEX_BUTTONS = [
  { value: "male", label: "Male", accessibilityLabel: "Male" },
  { value: "female", label: "Female", accessibilityLabel: "Female" },
] as const;

const GOAL_BUTTONS = [
  { value: "cut", label: GOAL_LABELS.cut, accessibilityLabel: GOAL_LABELS.cut },
  { value: "maintain", label: GOAL_LABELS.maintain, accessibilityLabel: GOAL_LABELS.maintain },
  { value: "bulk", label: GOAL_LABELS.bulk, accessibilityLabel: GOAL_LABELS.bulk },
] as const;

type Props = {
  colors: { onSurface: string };
  birthYear: string; setBirthYear: (v: string) => void;
  weight: string; setWeight: (v: string) => void;
  height: string; setHeight: (v: string) => void;
  sex: Sex; activityLevel: ActivityLevel; goal: Goal;
  weightUnit: string; heightUnit: string;
  errors: Record<string, string>;
  activityMenuVisible: boolean; setActivityMenuVisible: (v: boolean) => void;
  handleFieldBlur: (field: string, value: string) => void;
  handleSegmentChange: (field: "sex" | "activityLevel" | "goal", value: string) => void;
};

type SegButton = { value: string; label: string; accessibilityLabel: string };

export function BodyProfileForm(props: Props) {
  const { colors, handleFieldBlur, handleSegmentChange } = props;

  return (
    <>
      <Input
        label="Birth Year" value={props.birthYear} onChangeText={props.setBirthYear}
        onBlur={() => handleFieldBlur("birthYear", props.birthYear)}
        keyboardType="numeric" variant="outline" containerStyle={styles.input}
        placeholder="1990" accessibilityLabel="Birth year"
        accessibilityHint="Enter your birth year for calorie calculation" error={props.errors.birthYear}
      />
      <Input
        label={`Weight (${props.weightUnit})`} value={props.weight} onChangeText={props.setWeight}
        onBlur={() => handleFieldBlur("weight", props.weight)}
        keyboardType="numeric" variant="outline" containerStyle={styles.input}
        accessibilityLabel={`Weight in ${props.weightUnit}`}
        accessibilityHint="Enter your current body weight" error={props.errors.weight}
      />
      <Input
        label={`Height (${props.heightUnit})`} value={props.height} onChangeText={props.setHeight}
        onBlur={() => handleFieldBlur("height", props.height)}
        keyboardType="numeric" variant="outline" containerStyle={styles.input}
        accessibilityLabel={`Height in ${props.heightUnit}`}
        accessibilityHint="Enter your height" error={props.errors.height}
      />

      <Text variant="caption" style={[styles.fieldLabel, { color: colors.onSurface, fontWeight: "600" }]}>Sex</Text>
      <SegmentedControl
        value={props.sex} onValueChange={(v) => handleSegmentChange("sex", v)}
        buttons={SEX_BUTTONS as unknown as SegButton[]} style={styles.segmented}
      />

      <Text variant="caption" style={[styles.fieldLabel, { color: colors.onSurface, fontWeight: "600" }]}>Activity Level</Text>
      <ActivityDropdown
        value={props.activityLevel}
        onChange={(key) => { handleSegmentChange("activityLevel", key); props.setActivityMenuVisible(false); }}
        visible={props.activityMenuVisible}
        onToggle={() => props.setActivityMenuVisible(!props.activityMenuVisible)}
      />

      <Text variant="caption" style={[styles.fieldLabel, { color: colors.onSurface, fontWeight: "600" }]}>Goal</Text>
      <SegmentedControl
        value={props.goal} onValueChange={(v) => handleSegmentChange("goal", v)}
        buttons={GOAL_BUTTONS as unknown as SegButton[]} style={styles.segmented}
      />
    </>
  );
}

const styles = StyleSheet.create({
  input: { marginBottom: 4 },
  fieldLabel: { marginTop: 16, marginBottom: 8, fontSize: fontSizes.sm },
  segmented: { marginBottom: 8 },
});
