import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { router, useFocusEffect } from "expo-router";
import { useLayout } from "../../lib/layout";
import { getAppSetting, getMacroTargets, updateMacroTargets } from "../../lib/db";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  calculateFromProfile,
  migrateProfile,
  ACTIVITY_LABELS,
  GOAL_LABELS,
  type NutritionProfile,
} from "../../lib/nutrition-calc";
import { fontSizes } from "@/constants/design-tokens";

export default function Targets() {
  const colors = useThemeColors();
  const layout = useLayout();
  const [calories, setCalories] = useState("2000");
  const [protein, setProtein] = useState("150");
  const [carbs, setCarbs] = useState("250");
  const [fat, setFat] = useState("65");
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<NutritionProfile | null>(null);

  useFocusEffect(
    useCallback(() => {
      getMacroTargets().then((t) => {
        setCalories(String(t.calories));
        setProtein(String(t.protein));
        setCarbs(String(t.carbs));
        setFat(String(t.fat));
      });
      getAppSetting("nutrition_profile").then((saved) => {
        setProfile(saved ? migrateProfile(JSON.parse(saved)) : null);
      });
    }, [])
  );

  const save = async () => {
    setSaving(true);
    try {
      await updateMacroTargets(
        Math.max(0, parseFloat(calories) || 2000),
        Math.max(0, parseFloat(protein) || 150),
        Math.max(0, parseFloat(carbs) || 250),
        Math.max(0, parseFloat(fat) || 65)
      );
      router.back();
    } finally {
      setSaving(false);
    }
  };

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

  const profileSummary = profile
    ? (new Date().getFullYear() - profile.birthYear) + "yo, " + profile.weight + profile.weightUnit + ", " +
      ACTIVITY_LABELS[profile.activityLevel].toLowerCase() + ", " +
      GOAL_LABELS[profile.goal].toLowerCase()
    : null;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}
    >
      <Pressable
        onPress={() => router.push("/nutrition/profile")}
        accessibilityLabel={profile ? "Update your nutrition profile" : "Set your profile for personalized targets"}
        accessibilityRole="button"
      >
      <Card
        style={StyleSheet.flatten([styles.card, { backgroundColor: colors.primaryContainer }])}
      >
        <CardContent>
          <Text variant="subtitle" style={{ color: colors.onPrimaryContainer, fontSize: fontSizes.base }}>
            {profile ? "Update your profile" : "Set your profile for personalized targets"}
          </Text>
          {profileSummary ? (
            <Text variant="caption" style={{ color: colors.onPrimaryContainer, marginTop: 4, fontSize: fontSizes.sm }}>
              {"Based on: " + profileSummary}
            </Text>
          ) : null}
        </CardContent>
      </Card>
      </Pressable>

      <Card style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface }])}>
        <CardContent>
          <Text variant="title" style={{ color: colors.onSurface, marginBottom: 16 }}>
            Daily Macro Targets
          </Text>
          <Input
            label="Calories"
            value={calories}
            onChangeText={setCalories}
            keyboardType="numeric"
            containerStyle={styles.input}
            accessibilityLabel="Calories"
          />
          <Input
            label="Protein (g)"
            value={protein}
            onChangeText={setProtein}
            keyboardType="numeric"
            containerStyle={styles.input}
            accessibilityLabel="Protein"
          />
          <Input
            label="Carbs (g)"
            value={carbs}
            onChangeText={setCarbs}
            keyboardType="numeric"
            containerStyle={styles.input}
            accessibilityLabel="Carbs"
          />
          <Input
            label="Fat (g)"
            value={fat}
            onChangeText={setFat}
            keyboardType="numeric"
            containerStyle={styles.input}
            accessibilityLabel="Fat"
          />
          <Button variant="default" onPress={save} loading={saving} disabled={saving} style={styles.btn} accessibilityLabel="Save macro targets" label="Save Targets" />
          <Button variant="outline" onPress={reset} style={styles.btn} accessibilityLabel="Reset to default targets" label="Reset to Defaults" />
        </CardContent>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingVertical: 16, paddingBottom: 32 },
  card: { marginBottom: 16 },
  input: { marginBottom: 12 },
  btn: { marginTop: 8 },
  btnContent: { paddingVertical: 8 },
});
