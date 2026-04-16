import { useCallback, useMemo, useRef, useState } from "react";
import { SectionList, StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import {
  Button,
  Card,
  Chip,
  FAB,
  IconButton,
  MD3Theme,
  ProgressBar,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { router, useFocusEffect } from "expo-router";
import {
  getDailyLogs,
  getDailySummary,
  getMacroTargets,
  deleteDailyLog,
  addDailyLog,
  addFoodEntry,
  getFavoriteFoods,
} from "../../lib/db";
import type { DailyLog, FoodEntry, MacroTargets, Meal } from "../../lib/types";
import { MEALS, MEAL_LABELS } from "../../lib/types";
import { semantic } from "../../constants/theme";
import { useLayout } from "../../lib/layout";
import { useFloatingTabBarHeight } from "../../components/FloatingTabBar";
import { todayKey, formatDateKey } from "../../lib/format";
import SwipeToDelete from "../../components/SwipeToDelete";
import { radii } from "../../constants/design-tokens";

const DAY_MS = 86_400_000;

function label(d: Date): string {
  const today = todayKey();
  const yesterday = formatDateKey(Date.now() - DAY_MS);
  const ds = formatDateKey(d.getTime());
  if (ds === today) return "Today";
  if (ds === yesterday) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function Nutrition() {
  const theme = useTheme();
  const layout = useLayout();
  const tabBarHeight = useFloatingTabBarHeight();
  const [date, setDate] = useState(new Date());
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [summary, setSummary] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [targets, setTargets] = useState<MacroTargets | null>(null);
  const [snack, setSnack] = useState("");
  const deleted = useRef<{ log: DailyLog; timer: ReturnType<typeof setTimeout> } | null>(null);

  // Inline add-form state (tablet only)
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

  const load = useCallback(async () => {
    const ds = formatDateKey(date.getTime());
    const [l, s, t] = await Promise.all([
      getDailyLogs(ds),
      getDailySummary(ds),
      getMacroTargets(),
    ]);
    setLogs(l);
    setSummary(s);
    setTargets(t);
  }, [date]);

  useFocusEffect(
    useCallback(() => {
      load();
      if (layout.atLeastMedium) getFavoriteFoods().then(setFavorites);
    }, [load, layout.atLeastMedium])
  );

  const prev = () => setDate((d) => new Date(d.getTime() - DAY_MS));
  const next = () => setDate((d) => new Date(d.getTime() + DAY_MS));

  const remove = async (log: DailyLog) => {
    if (deleted.current) clearTimeout(deleted.current.timer);
    await deleteDailyLog(log.id);
    deleted.current = {
      log,
      timer: setTimeout(() => {
        deleted.current = null;
      }, 4000),
    };
    setSnack(`${log.food?.name ?? "Food"} removed`);
    load();
  };

  const undo = async () => {
    if (!deleted.current) return;
    clearTimeout(deleted.current.timer);
    const dl = deleted.current.log;
    await addDailyLog(dl.food_entry_id, dl.date, dl.meal, dl.servings);
    deleted.current = null;
    setSnack("");
    load();
  };

  const inlineSave = async () => {
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
      await addDailyLog(entry.id, formatDateKey(date.getTime()), meal, 1);
      setName("");
      setCalories("");
      setProtein("");
      setCarbs("");
      setFat("");
      setServing("1 serving");
      setFavorite(false);
      load();
      getFavoriteFoods().then(setFavorites);
      setSnack("Food logged");
    } finally {
      setSaving(false);
    }
  };

  const quickLog = async (food: FoodEntry) => {
    setSaving(true);
    try {
      await addDailyLog(food.id, formatDateKey(date.getTime()), meal, 1);
      load();
      setSnack(`${food.name} logged`);
    } finally {
      setSaving(false);
    }
  };

  const sections = useMemo(() =>
    MEALS
      .map((m) => ({ title: MEAL_LABELS[m], meal: m, data: logs.filter((l) => l.meal === m) }))
      .filter((s) => s.data.length > 0),
    [logs],
  );

  const logContent = (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 16 }]}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => (
        <Text variant="titleSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
          {section.title}
        </Text>
      )}
      renderItem={({ item }) => (
        <SwipeToDelete onDelete={() => remove(item)}>
          <Card style={[styles.foodCard, { backgroundColor: theme.colors.surface }]}>
            <Card.Content style={styles.foodRow}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                  {item.food?.name ?? "Unknown"}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {Math.round((item.food?.calories ?? 0) * item.servings)} cal
                  {item.servings !== 1 ? ` · ${item.servings}×` : ""}
                  {" · "}
                  {Math.round((item.food?.protein ?? 0) * item.servings)}p
                  {" · "}
                  {Math.round((item.food?.carbs ?? 0) * item.servings)}c
                  {" · "}
                  {Math.round((item.food?.fat ?? 0) * item.servings)}f
                </Text>
              </View>
              <IconButton icon="delete-outline" size={20} onPress={() => remove(item)} accessibilityLabel={`Remove ${item.food?.name ?? "food"}`} />
            </Card.Content>
          </Card>
        </SwipeToDelete>
      )}
      SectionSeparatorComponent={() => <View style={{ height: 16 }} />}
      ListHeaderComponent={
        <>
          <View style={styles.header}>
            <IconButton icon="chevron-left" onPress={prev} accessibilityLabel="Previous day" />
            <Text variant="titleMedium" style={{ color: theme.colors.onBackground }}>
              {label(date)}
            </Text>
            <IconButton icon="chevron-right" onPress={next} accessibilityLabel="Next day" />
          </View>

          {targets && (
            <Card style={[styles.card, { backgroundColor: theme.colors.surface, marginHorizontal: 16 }]}>
              <Card.Content>
                <MacroRow label="Calories" value={summary.calories} target={targets.calories} color={theme.colors.primary} theme={theme} />
                <MacroRow label="Protein" value={summary.protein} target={targets.protein} color={semantic.protein} unit="g" theme={theme} />
                <MacroRow label="Carbs" value={summary.carbs} target={targets.carbs} color={semantic.carbs} unit="g" theme={theme} />
                <MacroRow label="Fat" value={summary.fat} target={targets.fat} color={semantic.fat} unit="g" theme={theme} />
                <Text
                  variant="labelSmall"
                  style={{ color: theme.colors.primary, marginTop: 8 }}
                  onPress={() => router.push("/nutrition/targets")}
                  accessibilityLabel="Edit macro targets"
                  accessibilityRole="link"
                >
                  Edit Targets →
                </Text>
              </Card.Content>
            </Card>
          )}
        </>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}>
            No food logged yet.{"\n"}Tap + to add your first meal.
          </Text>
        </View>
      }
    />
  );

  const addForm = (
    <FlashList
      data={favorites}
      keyExtractor={(f) => f.id}
      contentContainerStyle={[styles.addContent, { paddingBottom: tabBarHeight + 16 }]}
      renderItem={({ item: f }) => (
        <Card
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
              {f.calories} cal · {f.protein}p · {f.carbs}c · {f.fat}f
            </Text>
          </Card.Content>
        </Card>
      )}
      ListHeaderComponent={
        <>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 12 }}>
            Add Food
          </Text>

          <View style={styles.meals}>
            {MEALS.map((m) => (
              <Chip
                key={m}
                selected={meal === m}
                onPress={() => setMeal(m)}
                accessibilityLabel={`Meal: ${MEAL_LABELS[m]}`}
                accessibilityRole="button"
                accessibilityState={{ selected: meal === m }}
              >
                {MEAL_LABELS[m]}
              </Chip>
            ))}
          </View>

          <TextInput label="Food name" value={name} onChangeText={setName} mode="outlined" style={styles.input} />
          <TextInput label="Calories" value={calories} onChangeText={setCalories} keyboardType="numeric" mode="outlined" style={styles.input} />
          <View style={styles.macroInputRow}>
            <TextInput label="Protein (g)" value={protein} onChangeText={setProtein} keyboardType="numeric" mode="outlined" style={[styles.input, styles.flex]} />
            <View style={{ width: 8 }} />
            <TextInput label="Carbs (g)" value={carbs} onChangeText={setCarbs} keyboardType="numeric" mode="outlined" style={[styles.input, styles.flex]} />
            <View style={{ width: 8 }} />
            <TextInput label="Fat (g)" value={fat} onChangeText={setFat} keyboardType="numeric" mode="outlined" style={[styles.input, styles.flex]} />
          </View>
          <TextInput label="Serving size" value={serving} onChangeText={setServing} mode="outlined" style={styles.input} />

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
            onPress={inlineSave}
            loading={saving}
            disabled={saving || !name.trim()}
            contentStyle={styles.btnContent}
            accessibilityLabel="Log food"
          >
            Log Food
          </Button>

          {favorites.length > 0 && (
            <Text variant="titleSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 24, marginBottom: 8 }}>
              Quick Log Favorites
            </Text>
          )}
        </>
      }
    />
  );

  if (layout.atLeastMedium) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background, paddingHorizontal: layout.horizontalPadding }]}>
        <View style={styles.wideRow}>
          <View style={styles.wideLog}>{logContent}</View>
          <View style={[styles.wideAdd, { borderLeftColor: theme.colors.outlineVariant }]}>
            {addForm}
          </View>
        </View>
        <Snackbar
          visible={!!snack}
          onDismiss={() => setSnack("")}
          duration={4000}
          action={{ label: "Undo", onPress: undo }}
        >
          {snack}
        </Snackbar>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {logContent}

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color={theme.colors.onPrimary}
        onPress={() => router.push(`/nutrition/add?date=${formatDateKey(date.getTime())}`)}
        accessibilityLabel="Add food"
      />

      <Snackbar
        visible={!!snack}
        onDismiss={() => setSnack("")}
        duration={4000}
        action={{ label: "Undo", onPress: undo }}
      >
        {snack}
      </Snackbar>
    </View>
  );
}

function MacroRow({
  label: name,
  value,
  target,
  color,
  unit,
  theme,
}: {
  label: string;
  value: number;
  target: number;
  color: string;
  unit?: string;
  theme: MD3Theme;
}) {
  const u = unit ?? "";
  return (
    <View style={styles.macro}>
      <View style={styles.macroHeader}>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurface }}>
          {name}
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {Math.round(value)}{u} / {Math.round(target)}{u}
        </Text>
      </View>
      <ProgressBar
        progress={target > 0 ? Math.min(value / target, 1) : 0}
        color={color}
        style={styles.bar}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  card: { marginBottom: 8 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 80 },
  addContent: { padding: 16, paddingBottom: 32 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 64 },
  section: { marginBottom: 16 },
  foodCard: { marginBottom: 6, borderRadius: 8 },
  foodRow: { flexDirection: "row", alignItems: "center" },
  fab: { position: "absolute", right: 16, bottom: 16 },
  macro: { marginBottom: 8 },
  macroHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  bar: { height: 6, borderRadius: radii.sm },
  wideRow: { flex: 1, flexDirection: "row" },
  wideLog: { flex: 6 },
  wideAdd: { flex: 4, borderLeftWidth: StyleSheet.hairlineWidth },
  meals: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12, gap: 8 },
  input: { marginBottom: 12 },
  macroInputRow: { flexDirection: "row" },
  flex: { flex: 1 },
  favChip: { marginBottom: 16 },
  favCard: { marginBottom: 8, borderRadius: 8 },
  btnContent: { paddingVertical: 8 },
});
