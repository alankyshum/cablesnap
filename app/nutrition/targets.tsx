import { useCallback, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { Button, Card, Text, TextInput, useTheme } from "react-native-paper";
import { router, useFocusEffect } from "expo-router";
import { useLayout } from "../../lib/layout";
import { getAppSetting, getMacroTargets, updateMacroTargets } from "../../lib/db";
import {
  calculateFromProfile,
  migrateProfile,
  ACTIVITY_LABELS,
  GOAL_LABELS,
  type NutritionProfile,
} from "../../lib/nutrition-calc";

export default function Targets() {
  const theme = useTheme();
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
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}
    >
      <Card
        style={[styles.card, { backgroundColor: theme.colors.primaryContainer }]}
        onPress={() => router.push("/nutrition/profile")}
        accessibilityLabel={profile ? "Update your nutrition profile" : "Set your profile for personalized targets"}
        accessibilityRole="button"
      >
        <Card.Content>
          <Text variant="titleSmall" style={{ color: theme.colors.onPrimaryContainer, fontSize: 16 }}>
            {profile ? "Update your profile" : "Set your profile for personalized targets"}
          </Text>
          {profileSummary ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer, marginTop: 4, fontSize: 14 }}>
              {"Based on: " + profileSummary}
            </Text>
          ) : null}
        </Card.Content>
      </Card>

      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 16 }}>
            Daily Macro Targets
          </Text>
          <TextInput
            label="Calories"
            value={calories}
            onChangeText={setCalories}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
            accessibilityLabel="Calories"
          />
          <TextInput
            label="Protein (g)"
            value={protein}
            onChangeText={setProtein}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
            accessibilityLabel="Protein"
          />
          <TextInput
            label="Carbs (g)"
            value={carbs}
            onChangeText={setCarbs}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
            accessibilityLabel="Carbs"
          />
          <TextInput
            label="Fat (g)"
            value={fat}
            onChangeText={setFat}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
            accessibilityLabel="Fat"
          />
          <Button mode="contained" onPress={save} loading={saving} disabled={saving} style={styles.btn} contentStyle={styles.btnContent} accessibilityLabel="Save macro targets">
            Save Targets
          </Button>
          <Button mode="outlined" onPress={reset} style={styles.btn} contentStyle={styles.btnContent} accessibilityLabel="Reset to default targets">
            Reset to Defaults
          </Button>
        </Card.Content>
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
