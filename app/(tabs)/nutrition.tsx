import { useCallback, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  Card,
  FAB,
  IconButton,
  MD3Theme,
  ProgressBar,
  Snackbar,
  Text,
  useTheme,
} from "react-native-paper";
import { router, useFocusEffect } from "expo-router";
import {
  getDailyLogs,
  getDailySummary,
  getMacroTargets,
  deleteDailyLog,
  addDailyLog,
} from "../../lib/db";
import type { DailyLog, MacroTargets } from "../../lib/types";
import { MEALS, MEAL_LABELS } from "../../lib/types";
import { semantic } from "../../constants/theme";

const DAY_MS = 86_400_000;

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function label(d: Date): string {
  const today = dateStr(new Date());
  const yesterday = dateStr(new Date(Date.now() - DAY_MS));
  const ds = dateStr(d);
  if (ds === today) return "Today";
  if (ds === yesterday) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function Nutrition() {
  const theme = useTheme();
  const [date, setDate] = useState(new Date());
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [summary, setSummary] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [targets, setTargets] = useState<MacroTargets | null>(null);
  const [snack, setSnack] = useState("");
  const deleted = useRef<{ log: DailyLog; timer: ReturnType<typeof setTimeout> } | null>(null);

  const load = useCallback(async () => {
    const ds = dateStr(date);
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
    }, [load])
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

  const empty = logs.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {empty ? (
          <View style={styles.empty}>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}>
              No food logged yet.{"\n"}Tap + to add your first meal.
            </Text>
          </View>
        ) : (
          MEALS.map((meal) => {
            const items = logs.filter((l) => l.meal === meal);
            if (items.length === 0) return null;
            return (
              <View key={meal} style={styles.section}>
                <Text variant="titleSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                  {MEAL_LABELS[meal]}
                </Text>
                {items.map((item) => (
                  <Card key={item.id} style={[styles.foodCard, { backgroundColor: theme.colors.surface }]}>
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
                ))}
              </View>
            );
          })
        )}
      </ScrollView>

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color={theme.colors.onPrimary}
        onPress={() => router.push("/nutrition/add")}
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
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 64 },
  section: { marginBottom: 16 },
  foodCard: { marginBottom: 6, borderRadius: 8 },
  foodRow: { flexDirection: "row", alignItems: "center" },
  fab: { position: "absolute", right: 16, bottom: 16 },
  macro: { marginBottom: 8 },
  macroHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  bar: { height: 6, borderRadius: 3 },
});
