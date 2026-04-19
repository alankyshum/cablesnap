import { useCallback, useMemo, useRef, useState } from "react";
import { SectionList, StyleSheet, TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/bna-toast";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import InlineFoodSearch from "../../components/InlineFoodSearch";
import SaveAsTemplateSheet from "../../components/SaveAsTemplateSheet";
import {
  getDailyLogs,
  getDailySummary,
  getMacroTargets,
  deleteDailyLog,
  addDailyLog,
} from "../../lib/db";
import type { DailyLog, MacroTargets, Meal } from "../../lib/types";
import { MEALS, MEAL_LABELS } from "../../lib/types";
import { semantic } from "../../constants/theme";
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
  const tabBarHeight = useFloatingTabBarHeight();
  const [date, setDate] = useState(new Date());
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [summary, setSummary] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [targets, setTargets] = useState<MacroTargets | null>(null);
  const { info } = useToast();
  const deleted = useRef<{ log: DailyLog; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [templateSheet, setTemplateSheet] = useState<{ visible: boolean; meal: Meal; items: DailyLog[] }>({
    visible: false, meal: "breakfast", items: [],
  });
  const { add } = useLocalSearchParams<{ add?: string }>();
  const shouldAdd = add === "true";

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
      if (shouldAdd) {
        setAddSheetVisible(true);
        router.setParams({ add: undefined });
      }
    }, [load, shouldAdd])
  );

  const prev = () => { setDate((d) => new Date(d.getTime() - DAY_MS)); };
  const next = () => { setDate((d) => new Date(d.getTime() + DAY_MS)); };

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
        <MealSectionHeader
          section={section}
          colors={colors}
          onSaveAsTemplate={(m, data) =>
            setTemplateSheet({ visible: true, meal: m, items: data })
          }
        />
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
        <NutritionListHeader
          date={date}
          summary={summary}
          targets={targets}
          colors={colors}
          onPrev={prev}
          onNext={next}
        />
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {logContent}

      <BottomSheet
        isVisible={addSheetVisible}
        onClose={() => setAddSheetVisible(false)}
        snapPoints={[0.7, 0.9]}
        title="Add Food"
      >
        <InlineFoodSearch
          dateKey={formatDateKey(date.getTime())}
          onFoodLogged={handleFoodLogged}
          onSnack={handleSnack}
        />
      </BottomSheet>
      <SaveAsTemplateSheet
        visible={templateSheet.visible}
        onClose={() => setTemplateSheet((s) => ({ ...s, visible: false }))}
        meal={templateSheet.meal}
        items={templateSheet.items}
        onSaved={load}
      />
    </View>
  );
}

function MealSectionHeader({
  section,
  colors,
  onSaveAsTemplate,
}: {
  section: { title: string; meal: Meal; data: DailyLog[] };
  colors: ReturnType<typeof useThemeColors>;
  onSaveAsTemplate: (meal: Meal, items: DailyLog[]) => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text variant="subtitle" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
        {section.title}
      </Text>
      {section.data.length > 0 && (
        <TouchableOpacity
          onPress={() => onSaveAsTemplate(section.meal, section.data)}
          accessibilityLabel={`Save ${section.title} as template`}
          accessibilityRole="button"
          hitSlop={8}
          style={{ padding: 8, minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
        >
          <MaterialCommunityIcons name="content-save-outline" size={20} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function NutritionListHeader({
  date,
  summary,
  targets,
  colors,
  onPrev,
  onNext,
}: {
  date: Date;
  summary: { calories: number; protein: number; carbs: number; fat: number };
  targets: MacroTargets | null;
  colors: ReturnType<typeof useThemeColors>;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity onPress={onPrev} accessibilityLabel="Previous day" hitSlop={8} style={{ padding: 8 }}><MaterialCommunityIcons name="chevron-left" size={24} color={colors.onSurface} /></TouchableOpacity>
        <Text variant="title" style={{ color: colors.onBackground }}>
          {label(date)}
        </Text>
        <TouchableOpacity onPress={onNext} accessibilityLabel="Next day" hitSlop={8} style={{ padding: 8 }}><MaterialCommunityIcons name="chevron-right" size={24} color={colors.onSurface} /></TouchableOpacity>
      </View>
      {targets && (
        <Card style={[styles.card, { backgroundColor: colors.surface, marginHorizontal: 16 }]}>
          <CardContent>
            <MacroRow label="Calories" value={summary.calories} target={targets.calories} color={colors.primary} colors={colors} />
            <MacroRow label="Protein" value={summary.protein} target={targets.protein} color={semantic.protein} unit="g" colors={colors} />
            <MacroRow label="Carbs" value={summary.carbs} target={targets.carbs} color={semantic.carbs} unit="g" colors={colors} />
            <MacroRow label="Fat" value={summary.fat} target={targets.fat} color={semantic.fat} unit="g" colors={colors} />
            <Text variant="caption" style={{ color: colors.primary, marginTop: 8 }} onPress={() => router.push("/nutrition/targets")} accessibilityLabel="Edit macro targets" accessibilityRole="link">
              Edit Targets →
            </Text>
            <Text variant="caption" style={{ color: colors.primary, marginTop: 4 }} onPress={() => router.push("/nutrition/templates")} accessibilityLabel="View meal templates" accessibilityRole="link">
              Meal Templates →
            </Text>
          </CardContent>
        </Card>
      )}
    </>
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
  macro: { marginBottom: 8 },
  macroHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  bar: { height: 6, borderRadius: radii.sm },
});
