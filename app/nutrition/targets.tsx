import { useCallback, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { Button, Card, Text, TextInput, useTheme } from "react-native-paper";
import { router, useFocusEffect } from "expo-router";
import { getMacroTargets, updateMacroTargets } from "../../lib/db";

export default function Targets() {
  const theme = useTheme();
  const [calories, setCalories] = useState("2000");
  const [protein, setProtein] = useState("150");
  const [carbs, setCarbs] = useState("250");
  const [fat, setFat] = useState("65");
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getMacroTargets().then((t) => {
        setCalories(String(t.calories));
        setProtein(String(t.protein));
        setCarbs(String(t.carbs));
        setFat(String(t.fat));
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
    setCalories("2000");
    setProtein("150");
    setCarbs("250");
    setFat("65");
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
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
          />
          <TextInput
            label="Protein (g)"
            value={protein}
            onChangeText={setProtein}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
          />
          <TextInput
            label="Carbs (g)"
            value={carbs}
            onChangeText={setCarbs}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
          />
          <TextInput
            label="Fat (g)"
            value={fat}
            onChangeText={setFat}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
          />
          <Button mode="contained" onPress={save} loading={saving} disabled={saving} style={styles.btn}>
            Save Targets
          </Button>
          <Button mode="outlined" onPress={reset} style={styles.btn}>
            Reset to Defaults
          </Button>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  card: { marginBottom: 16 },
  input: { marginBottom: 12 },
  btn: { marginTop: 8 },
});
