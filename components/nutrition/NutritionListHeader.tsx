import { StyleSheet, TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import type { MacroTargets } from "@/lib/types";
import { todayKey, formatDateKey } from "@/lib/format";
import { MacroRow } from "./MacroRow";

const DAY_MS = 86_400_000;

function dateLabel(d: Date): string {
  const today = todayKey();
  const yesterday = formatDateKey(Date.now() - DAY_MS);
  const ds = formatDateKey(d.getTime());
  if (ds === today) return "Today";
  if (ds === yesterday) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

type Props = {
  date: Date;
  summary: { calories: number; protein: number; carbs: number; fat: number };
  targets: MacroTargets | null;
  colors: { primary: string; onSurface: string; onSurfaceVariant: string; onBackground: string; surface: string };
  onPrev: () => void;
  onNext: () => void;
};

export function NutritionListHeader({ date, summary, targets, colors, onPrev, onNext }: Props) {
  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity onPress={onPrev} accessibilityLabel="Previous day" hitSlop={8} style={{ padding: 8 }}>
          <MaterialCommunityIcons name="chevron-left" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text variant="title" style={{ color: colors.onBackground }}>{dateLabel(date)}</Text>
        <TouchableOpacity onPress={onNext} accessibilityLabel="Next day" hitSlop={8} style={{ padding: 8 }}>
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.onSurface} />
        </TouchableOpacity>
      </View>
      {targets && (
        <Card style={[styles.card, { backgroundColor: colors.surface }]}>
          <CardContent>
            <MacroRow label="Calories" value={summary.calories} target={targets.calories} colors={colors} />
            <MacroRow label="Protein" value={summary.protein} target={targets.protein} unit="g" colors={colors} />
            <MacroRow label="Carbs" value={summary.carbs} target={targets.carbs} unit="g" colors={colors} />
            <MacroRow label="Fat" value={summary.fat} target={targets.fat} unit="g" colors={colors} />
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

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  card: { marginBottom: 8 },
});
