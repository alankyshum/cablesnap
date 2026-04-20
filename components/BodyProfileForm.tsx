import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ActivityDropdown } from "./profile/ActivityDropdown";
import { GOAL_LABELS, type ActivityLevel, type Goal, type Sex } from "../lib/nutrition-calc";
import { fontSizes } from "@/constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";

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
  rmrOverride: string;
  handleRmrChange: (v: string) => void;
  clearRmrOverride: () => void;
  rmrDeviationInfo: { deviation: number; estimated: number } | null;
};

type SegButton = { value: string; label: string; accessibilityLabel: string };

export function BodyProfileForm(props: Props) {
  const { colors, handleFieldBlur, handleSegmentChange } = props;
  const themeColors = useThemeColors();
  const [tooltipVisible, setTooltipVisible] = useState(false);

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

      {/* RMR Override — optional advanced field */}
      <View style={styles.rmrContainer}>
        <View style={styles.rmrLabelRow}>
          <Text variant="caption" style={[styles.fieldLabel, { color: colors.onSurface, fontWeight: "600", marginBottom: 0 }]}>
            Measured RMR (optional)
          </Text>
          <Pressable
            onPress={() => setTooltipVisible(!tooltipVisible)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Help: What is Measured RMR"
            accessibilityRole="button"
            style={styles.tooltipButton}
          >
            <Text variant="caption" style={{ color: themeColors.primary, fontSize: fontSizes.sm }}>ⓘ</Text>
          </Pressable>
        </View>

        {tooltipVisible && (
          <Text
            variant="caption"
            style={[styles.tooltipText, { color: themeColors.onSurfaceVariant, backgroundColor: themeColors.surfaceVariant }]}
          >
            Enter your Resting Metabolic Rate from a clinical metabolic test (indirect calorimetry). Do not use smart scale or fitness tracker estimates — they&apos;re often less accurate than our built-in formula. Leave blank to use automatic calculation.
          </Text>
        )}

        <View style={styles.rmrInputRow}>
          <Input
            value={props.rmrOverride}
            onChangeText={props.handleRmrChange}
            keyboardType="numeric"
            variant="outline"
            containerStyle={styles.rmrInput}
            placeholder="e.g. 1750"
            accessibilityLabel="Measured resting metabolic rate in kilocalories per day"
            accessibilityHint="Optional: enter your clinically measured RMR for more accurate calorie targets"
          />
          <Text variant="caption" style={[styles.rmrSuffix, { color: themeColors.onSurfaceVariant }]}>kcal/day</Text>
          {props.rmrOverride ? (
            <Pressable
              onPress={props.clearRmrOverride}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Clear measured RMR value"
              accessibilityRole="button"
              style={styles.clearButton}
            >
              <Text variant="caption" style={{ color: themeColors.onSurfaceVariant, fontSize: fontSizes.base }}>×</Text>
            </Pressable>
          ) : null}
        </View>

        {props.rmrDeviationInfo && (
          <Text
            variant="caption"
            accessibilityLiveRegion="polite"
            style={[styles.deviationWarning, { color: themeColors.tertiary }]}
          >
            This value is {props.rmrDeviationInfo.deviation}% different from the estimated {props.rmrDeviationInfo.estimated} kcal. Double-check it&apos;s from a clinical metabolic test.
          </Text>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  input: { marginBottom: 4 },
  fieldLabel: { marginTop: 16, marginBottom: 8, fontSize: fontSizes.sm },
  segmented: { marginBottom: 8 },
  rmrContainer: { marginTop: 16 },
  rmrLabelRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  tooltipButton: { marginLeft: 6, minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  tooltipText: { fontSize: fontSizes.xs, padding: 10, borderRadius: 6, marginBottom: 8, lineHeight: 18 },
  rmrInputRow: { flexDirection: "row", alignItems: "center" },
  rmrInput: { flex: 1, marginBottom: 0 },
  rmrSuffix: { marginLeft: 8, fontSize: fontSizes.sm },
  clearButton: { marginLeft: 8, minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  deviationWarning: { fontSize: fontSizes.xs, marginTop: 6, lineHeight: 18 },
});
