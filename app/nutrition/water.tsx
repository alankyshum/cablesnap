/**
 * BLD-600 — Hydration day-detail screen.
 *
 * Shows today's water-log entries (newest-first) + total/goal/bar header.
 * v1: only edits today; older days are read-only here.
 */
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useToast } from "@/components/ui/bna-toast";
import {
  getDailyTotalMl,
  getWaterLogsForDate,
  addWaterLog,
  deleteWaterLog,
  updateWaterLog,
  getAppSetting,
} from "@/lib/db";
import type { WaterLog } from "@/lib/types";
import { todayKey } from "@/lib/format";
import { formatTotalOverGoal, type HydrationUnit } from "@/lib/hydration-units";
import { WaterDayList } from "@/components/nutrition/WaterDayList";
import { WaterAmountSheet } from "@/components/nutrition/WaterAmountSheet";
import { radii } from "@/constants/design-tokens";

const DEFAULT_GOAL_ML = 2000;

export default function WaterDetail() {
  const colors = useThemeColors();
  const { error } = useToast();
  const [entries, setEntries] = useState<WaterLog[]>([]);
  const [totalMl, setTotalMl] = useState(0);
  const [goalMl, setGoalMl] = useState(DEFAULT_GOAL_ML);
  const [unit, setUnit] = useState<HydrationUnit>("ml");
  const [sheet, setSheet] = useState<{ visible: boolean; entry: WaterLog | null }>({
    visible: false,
    entry: null,
  });

  const load = useCallback(async () => {
    const dk = todayKey();
    const [tot, list, goalRaw, unitRaw] = await Promise.all([
      getDailyTotalMl(dk),
      getWaterLogsForDate(dk),
      getAppSetting("hydration.daily_goal_ml"),
      getAppSetting("hydration.unit"),
    ]);
    setTotalMl(tot);
    setEntries(list);
    const g = goalRaw ? parseInt(goalRaw, 10) : NaN;
    setGoalMl(Number.isFinite(g) && g > 0 ? g : DEFAULT_GOAL_ML);
    setUnit(unitRaw === "fl_oz" ? "fl_oz" : "ml");
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleAdd = useCallback(async (amountMl: number) => {
    try {
      await addWaterLog(todayKey(), amountMl);
      await load();
    } catch {
      error("Couldn't save water log. Try again.");
    }
  }, [load, error]);

  const handleDelete = useCallback(async (entry: WaterLog) => {
    try {
      await deleteWaterLog(entry.id);
      await load();
    } catch {
      error("Couldn't remove water log. Try again.");
    }
  }, [load, error]);

  const handleUpdate = useCallback(async (id: string, amountMl: number) => {
    try {
      await updateWaterLog(id, amountMl);
      await load();
    } catch {
      error("Couldn't update water log. Try again.");
    }
  }, [load, error]);

  const pct = goalMl > 0 ? Math.min(totalMl / goalMl, 1) * 100 : 0;
  const headerLabel = formatTotalOverGoal(totalMl, goalMl, unit);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={8}
          style={{ padding: 8 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text variant="title" style={{ color: colors.onBackground, flex: 1, textAlign: "center" }}>
          Water
        </Text>
        <TouchableOpacity
          onPress={() => setSheet({ visible: true, entry: null })}
          accessibilityLabel="Add water entry"
          accessibilityRole="button"
          hitSlop={8}
          style={{ padding: 8 }}
        >
          <MaterialCommunityIcons name="plus" size={24} color={colors.onSurface} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={[styles.card, { backgroundColor: colors.surface }]}>
          <CardContent>
            <View style={styles.headerRowSummary}>
              <Text variant="caption" style={{ color: colors.onSurface }}>Today</Text>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{headerLabel}</Text>
            </View>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: Math.max(goalMl, 1), now: Math.min(totalMl, goalMl) }}
              {...({
                "aria-valuemin": 0,
                "aria-valuemax": Math.max(goalMl, 1),
                "aria-valuenow": Math.min(totalMl, goalMl),
                role: "progressbar",
              } as Record<string, unknown>)}
            >
              <Progress value={pct} style={styles.bar} />
            </View>
          </CardContent>
        </Card>

        <View style={{ height: 16 }} />

        <WaterDayList
          entries={entries}
          unit={unit}
          colors={colors}
          onDelete={handleDelete}
          onEdit={(entry) => setSheet({ visible: true, entry })}
        />
      </ScrollView>

      <WaterAmountSheet
        visible={sheet.visible}
        onClose={() => setSheet({ visible: false, entry: null })}
        unit={unit}
        initialMl={sheet.entry?.amount_ml ?? null}
        colors={colors}
        onSubmit={async (amt) => {
          if (sheet.entry) await handleUpdate(sheet.entry.id, amt);
          else await handleAdd(amt);
        }}
        onDelete={sheet.entry ? async () => { await handleDelete(sheet.entry!); } : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  content: { padding: 16, paddingBottom: 80 },
  card: { borderRadius: 12 },
  headerRowSummary: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  bar: { height: 6, borderRadius: radii.sm },
});
