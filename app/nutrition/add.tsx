import { useCallback, useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, View } from "react-native";
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
import { searchFoods, getCategories } from "../../lib/foods";
import type { FoodEntry, Meal, BuiltinFood, FoodCategory } from "../../lib/types";
import { MEALS, MEAL_LABELS } from "../../lib/types";

function DatabaseTab({ meal, saving, onSaving }: { meal: Meal; saving: boolean; onSaving: (v: boolean) => void }) {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FoodCategory | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [multiplier, setMultiplier] = useState("1");
  const [saveFav, setSaveFav] = useState(false);
  const categories = getCategories();
  const today = new Date().toISOString().slice(0, 10);

  const results = useMemo(() => searchFoods(query, category), [query, category]);

  const mult = Math.max(0.25, parseFloat(multiplier) || 0);
  const valid = parseFloat(multiplier) >= 0.25;

  const expand = (id: string) => {
    setExpanded(expanded === id ? null : id);
    setMultiplier("1");
    setSaveFav(false);
  };

  const log = async (food: BuiltinFood) => {
    if (!valid) return;
    onSaving(true);
    try {
      const entry = await addFoodEntry(
        food.name,
        food.calories,
        food.protein,
        food.carbs,
        food.fat,
        food.serving,
        saveFav
      );
      await addDailyLog(entry.id, today, meal, mult);
      router.back();
    } finally {
      onSaving(false);
    }
  };

  const header = () => (
    <View>
      <TextInput
        mode="outlined"
        placeholder="Search foods..."
        value={query}
        onChangeText={setQuery}
        left={<TextInput.Icon icon="magnify" />}
        style={styles.input}
        accessibilityLabel="Search foods"
      />
      <View style={styles.chips}>
        <Chip
          selected={category === null}
          onPress={() => setCategory(null)}
          style={styles.chip}
          accessibilityRole="button"
          accessibilityState={{ selected: category === null }}
        >
          All
        </Chip>
        {categories.map((c) => (
          <Chip
            key={c.id}
            selected={category === c.id}
            onPress={() => setCategory(category === c.id ? null : c.id)}
            style={styles.chip}
            accessibilityRole="button"
            accessibilityState={{ selected: category === c.id }}
          >
            {c.label}
          </Chip>
        ))}
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: BuiltinFood }) => {
    const open = expanded === item.id;
    const scaled = {
      calories: (item.calories * mult).toFixed(0),
      protein: (item.protein * mult).toFixed(1),
      carbs: (item.carbs * mult).toFixed(1),
      fat: (item.fat * mult).toFixed(1),
    };

    return (
      <Card
        style={[styles.dbCard, { backgroundColor: theme.colors.surfaceVariant }]}
        onPress={() => expand(item.id)}
        accessibilityLabel={`${item.name}, ${item.calories} calories per ${item.serving}`}
        accessibilityRole="button"
      >
        <Card.Content>
          <Text
            variant="titleSmall"
            numberOfLines={1}
            style={{ color: theme.colors.onSurface }}
          >
            {item.name}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {item.calories} cal · {item.protein}p · {item.carbs}c · {item.fat}f · {item.serving}
          </Text>
          {open && (
            <View style={styles.detail}>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                Serving: {item.serving}
              </Text>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurface, marginBottom: 4 }}>
                Multiplier
              </Text>
              <View style={styles.multChips}>
                {["0.5", "1", "1.5", "2"].map((v) => (
                  <Chip
                    key={v}
                    selected={multiplier === v}
                    onPress={() => setMultiplier(v)}
                    style={styles.chip}
                    accessibilityRole="button"
                    accessibilityState={{ selected: multiplier === v }}
                  >
                    {v}x
                  </Chip>
                ))}
              </View>
              <TextInput
                mode="outlined"
                label="Custom amount"
                value={multiplier}
                onChangeText={setMultiplier}
                keyboardType="numeric"
                dense
                style={styles.multInput}
                accessibilityLabel={`Serving multiplier: ${multiplier} times`}
              />
              {!valid && (
                <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 4 }}>
                  Minimum 0.25x
                </Text>
              )}
              <View
                style={styles.macros}
                accessibilityLiveRegion="polite"
              >
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                  {scaled.calories} cal · {scaled.protein}p · {scaled.carbs}c · {scaled.fat}f
                </Text>
              </View>
              <Chip
                selected={saveFav}
                onPress={() => setSaveFav(!saveFav)}
                icon={saveFav ? "heart" : "heart-outline"}
                style={styles.favChip}
                accessibilityLabel={saveFav ? "Remove from favorites" : "Save as favorite"}
                accessibilityRole="button"
                accessibilityState={{ selected: saveFav }}
              >
                Save as Favorite
              </Chip>
              <Button
                mode="contained"
                onPress={() => log(item)}
                loading={saving}
                disabled={saving || !valid}
                style={styles.btn}
                accessibilityLabel="Log food"
              >
                Log Food
              </Button>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  const empty = () => (
    <Text
      variant="bodyMedium"
      style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", padding: 24 }}
    >
      No foods found. Try a different search term.
    </Text>
  );

  return (
    <FlatList
      data={results}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      style={{ backgroundColor: theme.colors.background }}
    />
  );
}

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
    try {
      const entry = await addFoodEntry(
        name.trim(),
        Math.max(0, parseFloat(calories) || 0),
        Math.max(0, parseFloat(protein) || 0),
        Math.max(0, parseFloat(carbs) || 0),
        Math.max(0, parseFloat(fat) || 0),
        serving.trim() || "1 serving",
        favorite
      );
      await addDailyLog(entry.id, today, meal, 1);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const quickLog = async (food: FoodEntry) => {
    setSaving(true);
    try {
      await addDailyLog(food.id, today, meal, 1);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  if (tab === "database") {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.header}>
          <SegmentedButtons
            value={tab}
            onValueChange={setTab}
            buttons={[
              { value: "new", label: "New Food" },
              { value: "favorites", label: "Favorites" },
              { value: "database", label: "Database" },
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
                accessibilityLabel={`Meal: ${MEAL_LABELS[m]}`}
                accessibilityRole="button"
                accessibilityState={{ selected: meal === m }}
              >
                {MEAL_LABELS[m]}
              </Chip>
            ))}
          </View>
        </View>
        <DatabaseTab meal={meal} saving={saving} onSaving={setSaving} />
      </View>
    );
  }

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
          { value: "database", label: "Database" },
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
            accessibilityLabel={`Meal: ${MEAL_LABELS[m]}`}
            accessibilityRole="button"
            accessibilityState={{ selected: meal === m }}
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
              accessibilityLabel={favorite ? "Remove from favorites" : "Save as favorite"}
              accessibilityRole="button"
              accessibilityState={{ selected: favorite }}
            >
              Save as favorite
            </Chip>
            <Button
              mode="contained"
              onPress={save}
              loading={saving}
              disabled={saving || !name.trim()}
              style={styles.btn}
              accessibilityLabel="Log food"
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
                  accessibilityLabel={`Quick log ${f.name}, ${f.calories} calories`}
                  accessibilityRole="button"
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
  header: { padding: 16, paddingBottom: 0 },
  tabs: { marginBottom: 16 },
  meals: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16, gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12, gap: 6 },
  chip: { marginRight: 0 },
  card: { marginBottom: 16 },
  input: { marginBottom: 12 },
  row: { flexDirection: "row" },
  flex: { flex: 1 },
  favChip: { marginBottom: 16 },
  btn: { marginTop: 8 },
  favCard: { marginBottom: 8, borderRadius: 8 },
  dbCard: { marginBottom: 8, borderRadius: 8 },
  detail: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.1)" },
  multChips: { flexDirection: "row", gap: 6, marginBottom: 8 },
  multInput: { marginBottom: 8 },
  macros: { marginBottom: 12, padding: 8, borderRadius: 8 },
});
