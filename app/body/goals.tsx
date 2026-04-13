import { useState, useCallback } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Text, TextInput, useTheme } from "react-native-paper";
import { useFocusEffect, useRouter } from "expo-router";
import { getBodySettings, updateBodySettings } from "../../lib/db";

const KG_TO_LB = 2.20462;
const LB_TO_KG = 0.453592;

export default function Goals() {
  const theme = useTheme();
  const router = useRouter();
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [measUnit, setMeasUnit] = useState<"cm" | "in">("cm");
  const [weight, setWeight] = useState("");
  const [fat, setFat] = useState("");
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const settings = await getBodySettings();
        setUnit(settings.weight_unit);
        setMeasUnit(settings.measurement_unit);
        if (settings.weight_goal) {
          const display = settings.weight_unit === "lb"
            ? Math.round(settings.weight_goal * KG_TO_LB * 10) / 10
            : Math.round(settings.weight_goal * 10) / 10;
          setWeight(String(display));
        }
        if (settings.body_fat_goal) {
          setFat(String(settings.body_fat_goal));
        }
      })();
    }, [])
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const w = parseFloat(weight);
      const f = parseFloat(fat);
      const goal = isNaN(w) || w <= 0 ? null : (unit === "lb" ? w * LB_TO_KG : w);
      const fatGoal = isNaN(f) || f <= 0 ? null : f;
      await updateBodySettings(unit, measUnit, goal, fatGoal);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text variant="titleLarge" style={{ color: theme.colors.onBackground, marginBottom: 16 }}>
        Body Goals
      </Text>

      <TextInput
        label={`Weight Goal (${unit})`}
        value={weight}
        onChangeText={setWeight}
        keyboardType="numeric"
        mode="outlined"
        style={styles.input}
        accessibilityLabel={`Weight goal in ${unit}`}
      />

      <TextInput
        label="Body Fat Goal (%)"
        value={fat}
        onChangeText={setFat}
        keyboardType="numeric"
        mode="outlined"
        style={styles.input}
        accessibilityLabel="Body fat percentage goal"
      />

      <View style={styles.buttons}>
        <Button
          mode="outlined"
          onPress={() => router.back()}
          style={{ flex: 1, marginRight: 8 }}
          accessibilityLabel="Cancel goal editing"
        >
          Cancel
        </Button>
        <Button
          mode="contained"
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          style={{ flex: 1 }}
          accessibilityLabel="Save body goals"
        >
          Save
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  input: {
    marginBottom: 12,
  },
  buttons: {
    flexDirection: "row",
    marginTop: 8,
  },
});
