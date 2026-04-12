import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  Button,
  Card,
  Chip,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { router, useFocusEffect } from "expo-router";
import {
  addFoodEntry,
  addDailyLog,
  getFavoriteFoods,
} from "../../lib/db";
import type { FoodEntry, Meal } from "../../lib/types";
import { MEALS, MEAL_LABELS } from "../../lib/types";

export default function AddFood() {
  const theme = useTheme();
  const [tab, setTab] = useState("new");
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [serving, setServing] = useState("1 serving");
  const [meal, setMeal] = useState<Meal>("snack");
  const [favorite, setFavorite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [favorites, setFavorites] = useState<FoodEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      getFavoriteFoods().then(setFavorites);
    }, [])
  );

  const today = new Date().toISOString().slice(0, 10);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const entry = await addFoodEntry(
      name.trim(),
      parseFloat(calories) || 0,
      parseFloat(protein) || 0,
      parseFloat(carbs) || 0,
      parseFloat(fat) || 0,
      serving.trim() || "1 serving",
      favorite
    );
    await addDailyLog(entry.id, today, meal, 1);
    setSaving(false);
    router.back();
  };

  const quickLog = async (food: FoodEntry) => {
    setSaving(true);
    await addDailyLog(food.id, today, meal, 1);
    setSaving(false);
    router.back();
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      <SegmentedButtons
        value={tab}
        onValueChange={setTab}
        buttons={[
          { value: "new", label: "New Food" },
          { value: "favorites", label: "Favorites" },
        ]}
        style={styles.tabs}
      />

      <View style={styles.meals}>
        {MEALS.map((m) => (
          <Chip
            key={m}
            selected={meal === m}
            onPress={() => setMeal(m)}
            style={styles.chip}
          >
            {MEAL_LABELS[m]}
          </Chip>
        ))}
      </View>

      {tab === "new" ? (
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <TextInput
              label="Food name"
              value={name}
              onChangeText={setName}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Calories"
              value={calories}
              onChangeText={setCalories}
              keyboardType="numeric"
              mode="outlined"
              style={styles.input}
            />
            <View style={styles.row}>
              <TextInput
                label="Protein (g)"
                value={protein}
                onChangeText={setProtein}
                keyboardType="numeric"
                mode="outlined"
                style={[styles.input, styles.flex]}
              />
              <View style={{ width: 8 }} />
              <TextInput
                label="Carbs (g)"
                value={carbs}
                onChangeText={setCarbs}
                keyboardType="numeric"
                mode="outlined"
                style={[styles.input, styles.flex]}
              />
              <View style={{ width: 8 }} />
              <TextInput
                label="Fat (g)"
                value={fat}
                onChangeText={setFat}
                keyboardType="numeric"
                mode="outlined"
                style={[styles.input, styles.flex]}
              />
            </View>
            <TextInput
              label="Serving size"
              value={serving}
              onChangeText={setServing}
              mode="outlined"
              style={styles.input}
            />
            <Chip
              selected={favorite}
              onPress={() => setFavorite(!favorite)}
              icon={favorite ? "heart" : "heart-outline"}
              style={styles.favChip}
            >
              Save as favorite
            </Chip>
            <Button
              mode="contained"
              onPress={save}
              loading={saving}
              disabled={saving || !name.trim()}
              style={styles.btn}
            >
              Log Food
            </Button>
          </Card.Content>
        </Card>
      ) : (
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            {favorites.length === 0 ? (
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", padding: 16 }}
              >
                No favorites yet. Save foods as favorites when logging them.
              </Text>
            ) : (
              favorites.map((f) => (
                <Card
                  key={f.id}
                  style={[styles.favCard, { backgroundColor: theme.colors.surfaceVariant }]}
                  onPress={() => quickLog(f)}
                >
                  <Card.Content>
                    <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
                      {f.name}
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {f.calories} cal · {f.protein}p · {f.carbs}c · {f.fat}f · {f.serving_size}
                    </Text>
                  </Card.Content>
                </Card>
              ))
            )}
          </Card.Content>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  tabs: { marginBottom: 16 },
  meals: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16, gap: 8 },
  chip: { marginRight: 0 },
  card: { marginBottom: 16 },
  input: { marginBottom: 12 },
  row: { flexDirection: "row" },
  flex: { flex: 1 },
  favChip: { marginBottom: 16 },
  btn: { marginTop: 8 },
  favCard: { marginBottom: 8, borderRadius: 8 },
});
