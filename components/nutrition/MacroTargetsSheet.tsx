import { useCallback, useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { router } from "expo-router";
import { getAppSetting, getMacroTargets, updateMacroTargets } from "../../lib/db";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  calculateFromProfile,
  migrateProfile,
  type NutritionProfile,
} from "../../lib/nutrition-calc";
import { fontSizes } from "@/constants/design-tokens";
import { getAllSettings as getTrainingDaySettings } from "../../lib/db/training-day-settings";

/**
 * PROHIBITION (AC16/C1): No "earn/earned/bonus/reward/treat/deserve/penalty/punish/
 *   unlock/spend/burn it off/work it off/guilt/cheat" copy in this file.
 * No directional color tokens on calorie values.
 *
 * AC14 / C2 verbatim manual-editor helper — wording may NOT change without psych sign-off.
 * Layout (color, size, placement) may vary.
 */
const TRAINING_DAY_HELPER_TEXT =
  "This is your base target. Training-day fueling is applied on top — manage it in Settings › Training-Day Macros.";

type Props = { visible: boolean; onClose: () => void };

export function MacroTargetsSheet({ visible, onClose }: Props) {
  const colors = useThemeColors();
  const [calories, setCalories] = useState("2000");
  const [protein, setProtein] = useState("150");
  const [carbs, setCarbs] = useState("250");
  const [fat, setFat] = useState("65");
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<NutritionProfile | null>(null);
  /**
   * AC14: Show the C2 verbatim helper when the Training-Day Macros feature is enabled.
   * Default null (unknown) → render nothing until loaded; false → hidden; true → shown.
   */
  const [trainingDayEnabled, setTrainingDayEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!visible) return;
    getMacroTargets().then((t) => {
      setCalories(String(t.calories));
      setProtein(String(t.protein));
      setCarbs(String(t.carbs));
      setFat(String(t.fat));
    });
    getAppSetting("nutrition_profile").then((saved) => {
      if (!saved) { setProfile(null); return; }
      try {
        setProfile(migrateProfile(JSON.parse(saved)));
      } catch {
        if (__DEV__) console.warn("[MacroTargetsSheet] corrupt nutrition_profile, resetting");
        setProfile(null);
      }
    });
    // AC14: load training-day feature state to determine whether to show the helper
    getTrainingDaySettings().then((s) => {
      setTrainingDayEnabled(s.enabled);
    }).catch(() => {
      setTrainingDayEnabled(false); // safe default — don't show on error
    });
  }, [visible]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await updateMacroTargets(
        Math.max(0, parseFloat(calories) || 2000),
        Math.max(0, parseFloat(protein) || 150),
        Math.max(0, parseFloat(carbs) || 250),
        Math.max(0, parseFloat(fat) || 65)
      );
      onClose();
    } finally {
      setSaving(false);
    }
  }, [calories, protein, carbs, fat, onClose]);

  const reset = () => {
    if (profile) {
      const result = calculateFromProfile(profile);
      setCalories(String(result.calories));
      setProtein(String(result.protein));
      setCarbs(String(result.carbs));
      setFat(String(result.fat));
    } else {
      setCalories("2000");
      setProtein("150");
      setCarbs("250");
      setFat("65");
    }
  };

  return (
    <BottomSheet
      isVisible={visible}
      onClose={onClose}
      title="Macro Targets"
      snapPoints={[0.65, 0.85]}
    >
      <View style={styles.container}>
        <TouchableOpacity
          onPress={() => { onClose(); router.push("/(tabs)/settings"); }}
          accessibilityLabel={profile ? "Update your body profile in settings" : "Set your profile for personalized targets"}
          accessibilityRole="button"
          style={[styles.profileCta, { backgroundColor: colors.primaryContainer }]}
        >
          <Text variant="body" style={{ color: colors.onPrimaryContainer, fontSize: fontSizes.sm, fontWeight: "600" }}>
            {profile ? "Update profile in Settings →" : "Set your profile for personalized targets →"}
          </Text>
        </TouchableOpacity>

        {/* AC14 / C2: feature-aware helper — shown ONLY when Training-Day Macros is ON */}
        {trainingDayEnabled === true && (
          <View
            style={[styles.helperBanner, { backgroundColor: colors.onSurface + "0D" }]}
            accessibilityRole="text"
          >
            <Text
              variant="caption"
              style={{ color: colors.onSurfaceVariant }}
              accessibilityLabel={TRAINING_DAY_HELPER_TEXT}
            >
              {TRAINING_DAY_HELPER_TEXT}
            </Text>
          </View>
        )}

        <Input label="Calories" value={calories} onChangeText={setCalories} keyboardType="numeric" containerStyle={styles.input} accessibilityLabel="Calories" />
        <Input label="Protein (g)" value={protein} onChangeText={setProtein} keyboardType="numeric" containerStyle={styles.input} accessibilityLabel="Protein" />
        <Input label="Carbs (g)" value={carbs} onChangeText={setCarbs} keyboardType="numeric" containerStyle={styles.input} accessibilityLabel="Carbs" />
        <Input label="Fat (g)" value={fat} onChangeText={setFat} keyboardType="numeric" containerStyle={styles.input} accessibilityLabel="Fat" />

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
          onPress={save}
          disabled={saving}
          accessibilityLabel="Save macro targets"
          accessibilityRole="button"
        >
          <Text variant="body" style={{ color: colors.onPrimary, fontWeight: "600" }}>{saving ? "Saving…" : "Save Targets"}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.resetBtn, { borderColor: colors.outline }]}
          onPress={reset}
          accessibilityLabel="Reset to default targets"
          accessibilityRole="button"
        >
          <Text variant="body" style={{ color: colors.onSurface }}>Reset to Defaults</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  profileCta: { padding: 12, borderRadius: 8, marginBottom: 8 },
  helperBanner: { padding: 10, borderRadius: 6, marginBottom: 4 },
  input: { marginBottom: 4 },
  saveBtn: { marginTop: 8, paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  resetBtn: { marginTop: 4, paddingVertical: 12, borderRadius: 8, alignItems: "center", borderWidth: 1 },
});
