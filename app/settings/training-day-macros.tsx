/* eslint-disable max-lines-per-function */
/**
 * Training-Day Macro Adjustment — Settings screen.
 *
 * AC14: Uses C2 verbatim psychologist-approved copy (settings opt-in body + off-ramp line C5).
 * AC19: Default OFF, off-ramp line (C5), no notifications, "logged workouts" copy (QD5).
 * AC20: Live preview shows both days + weekly average (C6).
 *
 * PROHIBITION (AC16/C1): No "earn/earned/bonus/reward/treat/deserve/penalty/punish/
 *   unlock/spend/burn it off/work it off/guilt/cheat" copy in this file or its callers.
 * No directional color tokens on calorie numbers.
 *
 * @see PLAN-BLD-2634.md — binding copy strings, psychologist C2/C5 requirements
 */

import React, { useCallback, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useToast } from "@/components/ui/bna-toast";
import { spacing, radii } from "@/constants/design-tokens";
import {
  getEnabled,
  getSplitPercent,
  getTrainingDaysPerWeek,
  setEnabled,
  setSplitPercent,
  setTrainingDaysPerWeek,
} from "@/lib/db/training-day-settings";
import {
  computeEffectiveTargets,
  SPLIT_PERCENT_MIN,
  SPLIT_PERCENT_MAX,
  TRAINING_DAYS_MIN,
  TRAINING_DAYS_MAX,
  type PureMacroTargets,
} from "@/lib/training-day-macros";
import { getMacroTargets } from "@/lib/db";

// ─── Binding copy strings (psychologist C2 verbatim — AC14) ──────────────────
// DO NOT modify these strings without psychologist sign-off.

const COPY = {
  settingsOptInBody:
    "Match your fuel to your training. On days you work out, your body uses more energy — this shifts some of your calories (mostly carbs) to those days and eases them back on rest days. Your weekly total stays exactly the same as your base target. This is about fueling recovery, not a reward for exercising.",
  offRampLine:
    "Not for everyone — if adjusting food around workouts feels stressful, keep this off and use a single steady target.",
  loggedWorkoutsNote:
    "Adjustments are based on your logged workouts — only sessions you complete in the app count.",
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatKcal(n: number): string {
  return `${n.toLocaleString()} kcal`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TrainingDayMacrosScreen() {
  const colors = useThemeColors();
  const toast = useToast();

  const [enabled, setEnabledState] = useState(false);
  const [splitPercent, setSplitPercentState] = useState(10);
  const [trainingDays, setTrainingDaysState] = useState(4);
  const [baseTargets, setBaseTargets] = useState<PureMacroTargets | null>(null);
  const [previewCals, setPreviewCals] = useState<{ training: number; rest: number; weeklyAvg: number } | null>(null);
  const [weightKg] = useState<number>(75); // fallback default

  const computePreview = useCallback(
    (base: PureMacroTargets, p: number, n: number) => {
      const trainingResult = computeEffectiveTargets(base, true, { splitPercent: p, trainingDaysPerWeek: n }, weightKg);
      const restResult = computeEffectiveTargets(base, false, { splitPercent: p, trainingDaysPerWeek: n }, weightKg);
      const weeklyAvg = Math.round((n * trainingResult.calories + (7 - n) * restResult.calories) / 7);
      setPreviewCals({ training: trainingResult.calories, rest: restResult.calories, weeklyAvg });
    },
    [weightKg]
  );

  const load = useCallback(async () => {
    const [en, sp, td, targets] = await Promise.all([
      getEnabled(),
      getSplitPercent(),
      getTrainingDaysPerWeek(),
      getMacroTargets(),
    ]);

    setEnabledState(en);
    setSplitPercentState(sp);
    setTrainingDaysState(td);

    if (targets) {
      const base: PureMacroTargets = {
        calories: targets.calories,
        protein: targets.protein,
        carbs: targets.carbs,
        fat: targets.fat,
      };
      setBaseTargets(base);
      computePreview(base, sp, td);
    }
  }, [computePreview]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleToggleEnabled = async (value: boolean) => {
    setEnabledState(value);
    await setEnabled(value);
  };

  const handleSplitPercentChange = async (delta: number) => {
    const next = Math.max(SPLIT_PERCENT_MIN, Math.min(SPLIT_PERCENT_MAX, splitPercent + delta));
    setSplitPercentState(next);
    await setSplitPercent(next);
    if (baseTargets) computePreview(baseTargets, next, trainingDays);
  };

  const handleTrainingDaysChange = async (delta: number) => {
    const next = Math.max(TRAINING_DAYS_MIN, Math.min(TRAINING_DAYS_MAX, trainingDays + delta));
    setTrainingDaysState(next);
    await setTrainingDaysPerWeek(next);
    if (baseTargets) computePreview(baseTargets, splitPercent, next);
    toast.info(`Training days: ${next}/week`);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Stack.Screen options={{ title: "Training-Day Macros" }} />

      {/* ── Enable toggle ─────────────────────────────────────────────── */}
      <Card style={{ backgroundColor: colors.surface, marginBottom: 16 }}>
        <CardContent>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text variant="subtitle" style={{ color: colors.onSurface }}>
                Training-Day Macro Adjustment
              </Text>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                Different calorie targets on training vs rest days. Off by default.
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={handleToggleEnabled}
              accessibilityLabel="Enable Training-Day Macro Adjustment"
              accessibilityRole="switch"
            />
          </View>
        </CardContent>
      </Card>

      {/* ── How it works (C2 verbatim — AC14) ─────────────────────────── */}
      <Card style={{ backgroundColor: colors.surface, marginBottom: 16 }}>
        <CardContent>
          <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>
            How it works
          </Text>
          {/* C2 verbatim body — DO NOT alter wording */}
          <Text variant="body" style={{ color: colors.onSurfaceVariant, lineHeight: 22 }}>
            {COPY.settingsOptInBody}
          </Text>
          {/* C5 off-ramp line — AC19 */}
          <Text
            variant="caption"
            style={{ color: colors.onSurfaceVariant, marginTop: 12, fontStyle: "italic" }}
          >
            {COPY.offRampLine}
          </Text>
          {/* QD5 logged-workout copy — AC19 */}
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 8 }}>
            {COPY.loggedWorkoutsNote}
          </Text>
        </CardContent>
      </Card>

      {/* ── Parameters (only shown when enabled) ─────────────────────── */}
      {enabled && (
        <>
          {/* Split percentage */}
          <Card style={{ backgroundColor: colors.surface, marginBottom: 16 }}>
            <CardContent>
              <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 4 }}>
                Training boost
              </Text>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 12 }}>
                How much extra to add on training days (offset by rest days to keep weekly total steady).
              </Text>
              <View style={styles.stepper}>
                <StepperButton
                  label="−"
                  onPress={() => handleSplitPercentChange(-5)}
                  disabled={splitPercent <= SPLIT_PERCENT_MIN}
                  colors={colors}
                  accessibilityLabel="Decrease training boost"
                />
                <Text variant="subtitle" style={{ color: colors.onSurface, minWidth: 60, textAlign: "center" }}>
                  {splitPercent}%
                </Text>
                <StepperButton
                  label="+"
                  onPress={() => handleSplitPercentChange(5)}
                  disabled={splitPercent >= SPLIT_PERCENT_MAX}
                  colors={colors}
                  accessibilityLabel="Increase training boost"
                />
              </View>
            </CardContent>
          </Card>

          {/* Training days per week */}
          <Card style={{ backgroundColor: colors.surface, marginBottom: 16 }}>
            <CardContent>
              <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 4 }}>
                Training days per week
              </Text>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 12 }}>
                Used to keep your weekly calorie average exactly equal to your base target.
              </Text>
              <View style={styles.stepper}>
                <StepperButton
                  label="−"
                  onPress={() => handleTrainingDaysChange(-1)}
                  disabled={trainingDays <= TRAINING_DAYS_MIN}
                  colors={colors}
                  accessibilityLabel="Decrease training days per week"
                />
                <Text variant="subtitle" style={{ color: colors.onSurface, minWidth: 60, textAlign: "center" }}>
                  {trainingDays}/week
                </Text>
                <StepperButton
                  label="+"
                  onPress={() => handleTrainingDaysChange(1)}
                  disabled={trainingDays >= TRAINING_DAYS_MAX}
                  colors={colors}
                  accessibilityLabel="Increase training days per week"
                />
              </View>
            </CardContent>
          </Card>

          {/* Preview (C6 — AC20: shows both days + weekly avg) */}
          {previewCals && (
            <Card style={{ backgroundColor: colors.surface, marginBottom: 16 }}>
              <CardContent>
                <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>
                  Preview
                </Text>
                <View style={styles.previewRow}>
                  <Text variant="body" style={{ color: colors.onSurface }}>Training day</Text>
                  <Text
                    variant="body"
                    style={{ color: colors.onSurface, fontWeight: "600" }}
                    accessibilityLabel={`Training day target: ${formatKcal(previewCals.training)}`}
                  >
                    {formatKcal(previewCals.training)}
                  </Text>
                </View>
                <View style={styles.previewRow}>
                  <Text variant="body" style={{ color: colors.onSurface }}>Rest day</Text>
                  <Text
                    variant="body"
                    style={{ color: colors.onSurface, fontWeight: "600" }}
                    accessibilityLabel={`Rest day target: ${formatKcal(previewCals.rest)}`}
                  >
                    {formatKcal(previewCals.rest)}
                  </Text>
                </View>
                <View style={[styles.previewRow, styles.previewDivider, { borderTopColor: colors.onSurfaceVariant + "40" }]}>
                  <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>Weekly average</Text>
                  <Text
                    variant="caption"
                    style={{ color: colors.onSurfaceVariant }}
                    accessibilityLabel={`Weekly average: ${formatKcal(previewCals.weeklyAvg)}`}
                  >
                    {formatKcal(previewCals.weeklyAvg)}
                    {baseTargets && ` (= your base)`}
                  </Text>
                </View>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

// ─── StepperButton ────────────────────────────────────────────────────────────

function StepperButton({
  label,
  onPress,
  disabled,
  colors,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  colors: ReturnType<typeof useThemeColors>;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.stepperBtn,
        {
          borderColor: disabled ? colors.onSurfaceVariant + "40" : colors.onSurface,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Text variant="subtitle" style={{ color: colors.onSurface }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24 },
  stepperBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  previewDivider: {
    borderTopWidth: 1,
    marginTop: 4,
    paddingTop: 10,
  },
});
