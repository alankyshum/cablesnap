import { useCallback, useMemo, useRef, useState } from "react";
import { LayoutAnimation, SectionList, StyleSheet, TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { FAB } from "@/components/ui/fab";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/bna-toast";
import { router, useFocusEffect } from "expo-router";
import InlineFoodSearch from "../../components/InlineFoodSearch";
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
import { useLayout } from "../../lib/layout";
import { useFloatingTabBarHeight } from "../../components/FloatingTabBar";
import { todayKey, formatDateKey } from "../../lib/format";
import SwipeToDelete from "../../components/SwipeToDelete";
import { radii } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";

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
  const colors = useThemeColors();
  const layout = useLayout();
  const tabBarHeight = useFloatingTabBarHeight();
  const [date, setDate] = useState(new Date());
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [summary, setSummary] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [targets, setTargets] = useState<MacroTargets | null>(null);
  const { info } = useToast();
  const deleted = useRef<{ log: DailyLog; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [showAddCard, setShowAddCard] = useState(false);

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
    }, [load])
  );

  const prev = () => { setDate((d) => new Date(d.getTime() - DAY_MS)); setShowAddCard(false); };
  const next = () => { setDate((d) => new Date(d.getTime() + DAY_MS)); setShowAddCard(false); };

  const remove = async (log: DailyLog) => {
    if (deleted.current) clearTimeout(deleted.current.timer);
    await deleteDailyLog(log.id);
    deleted.current = {
      log,
      timer: setTimeout(() => {
        deleted.current = null;
      }, 4000),
    };
    info(`${log.food?.name ?? "Food"} removed`, {
      action: { label: "Undo", onPress: undo },
    });
    load();
  };

  const undo = useCallback(async () => {
    if (!deleted.current) return;
    clearTimeout(deleted.current.timer);
    const dl = deleted.current.log;
    await addDailyLog(dl.food_entry_id, dl.date, dl.meal, dl.servings);
    deleted.current = null;
    load();
  }, [load]);

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
        <Text variant="subtitle" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
          {section.title}
        </Text>
      )}
      renderItem={({ item }) => (
        <SwipeToDelete onDelete={() => remove(item)}>
          <Card style={[styles.foodCard, { backgroundColor: colors.surface }]}>
            <CardContent style={styles.foodRow}>
              <View style={{ flex: 1 }}>
                <Text variant="body" style={{ color: colors.onSurface }}>
                  {item.food?.name ?? "Unknown"}
                </Text>
                <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                  {item.servings !== 1 ? ` · ${item.servings}×` : ""}
                  {" · "}
                  {Math.round((item.food?.protein ?? 0) * item.servings)}p
                  {" · "}
                  {Math.round((item.food?.carbs ?? 0) * item.servings)}c
                  {" · "}
                  {Math.round((item.food?.fat ?? 0) * item.servings)}f
                </Text>
              </View>
              <TouchableOpacity onPress={() => remove(item)} accessibilityLabel={`Remove ${item.food?.name ?? "food"}`} hitSlop={8} style={{ padding: 8 }}><MaterialCommunityIcons name="delete-outline" size={20} color={colors.onSurface} /></TouchableOpacity>
            </CardContent>
          </Card>
        </SwipeToDelete>
      )}
      SectionSeparatorComponent={() => <View style={{ height: 16 }} />}
      ListHeaderComponent={
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={prev} accessibilityLabel="Previous day" hitSlop={8} style={{ padding: 8 }}><MaterialCommunityIcons name="chevron-left" size={24} color={colors.onSurface} /></TouchableOpacity>
            <Text variant="title" style={{ color: colors.onBackground }}>
              {label(date)}
            </Text>
            <TouchableOpacity onPress={next} accessibilityLabel="Next day" hitSlop={8} style={{ padding: 8 }}><MaterialCommunityIcons name="chevron-right" size={24} color={colors.onSurface} /></TouchableOpacity>
          </View>

          {targets && (
            <Card style={[styles.card, { backgroundColor: colors.surface, marginHorizontal: 16 }]}>
              <CardContent>
                <MacroRow label="Calories" value={summary.calories} target={targets.calories} color={colors.primary} colors={colors} />
                <MacroRow label="Protein" value={summary.protein} target={targets.protein} color={semantic.protein} unit="g" colors={colors} />
                <MacroRow label="Carbs" value={summary.carbs} target={targets.carbs} color={semantic.carbs} unit="g" colors={colors} />
                <MacroRow label="Fat" value={summary.fat} target={targets.fat} color={semantic.fat} unit="g" colors={colors} />
                <Text
                  variant="caption"
                  style={{ color: colors.primary, marginTop: 8 }}
                  onPress={() => router.push("/nutrition/targets")}
                  accessibilityLabel="Edit macro targets"
                  accessibilityRole="link"
                >
                  Edit Targets →
                </Text>
              </CardContent>
            </Card>
          )}
        </>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text variant="body" style={{ color: colors.onSurfaceVariant, textAlign: "center" }}>
            No food logged yet.{"\n"}Tap + to add your first meal.
          </Text>
        </View>
      }
    />
  );

  const toggleAddCard = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAddCard((v) => !v);
  }, []);

  const handleFoodLogged = useCallback(() => {
    load();
  }, [load]);

  const handleSnack = useCallback((message: string, undoFn?: () => Promise<void>) => {
    const onPress = async () => {
      if (undoFn) {
        await undoFn();
      } else {
        await undo();
      }
    };
    info(message, {
      action: { label: "Undo", onPress },
    });
  }, [info, undo]);

  if (layout.atLeastMedium) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingHorizontal: layout.horizontalPadding }]}>
        <View style={styles.wideRow}>
          <View style={styles.wideLog}>{logContent}</View>
          <View style={[styles.wideAdd, { borderLeftColor: colors.outlineVariant }]}>
            <InlineFoodSearch
              dateKey={formatDateKey(date.getTime())}
              onFoodLogged={handleFoodLogged}
              onSnack={handleSnack}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {logContent}

      {showAddCard && (
        <View style={styles.inlineCardOverlay}>
          <InlineFoodSearch
            dateKey={formatDateKey(date.getTime())}
            onFoodLogged={handleFoodLogged}
            onSnack={handleSnack}
          />
        </View>
      )}

      <FAB
        icon={showAddCard ? "close" : "plus"}
        style={[styles.fab, { backgroundColor: colors.primary }]}
        color={colors.onPrimary}
        onPress={toggleAddCard}
        accessibilityLabel={showAddCard ? "Close add food" : "Add food"}
      />
    </View>
  );
}

function MacroRow({
  label: name,
  value,
  target,
  color: _color, // eslint-disable-line @typescript-eslint/no-unused-vars
  unit,
  colors,
}: {
  label: string;
  value: number;
  target: number;
  color: string;
  unit?: string;
  colors: { onSurface: string; onSurfaceVariant: string };
}) {
  const u = unit ?? "";
  return (
    <View style={styles.macro}>
      <View style={styles.macroHeader}>
        <Text variant="caption" style={{ color: colors.onSurface }}>
          {name}
        </Text>
        <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
          {Math.round(value)}{u} / {Math.round(target)}{u}
        </Text>
      </View>
      <Progress
        value={target > 0 ? Math.min(value / target, 1) * 100 : 0}
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
  inlineCardOverlay: { position: "absolute", left: 0, right: 0, bottom: 80, zIndex: 1 },
  macro: { marginBottom: 8 },
  macroHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  bar: { height: 6, borderRadius: radii.sm },
  wideRow: { flex: 1, flexDirection: "row" },
  wideLog: { flex: 6 },
  wideAdd: { flex: 4, borderLeftWidth: StyleSheet.hairlineWidth },
});
