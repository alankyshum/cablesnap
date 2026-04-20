import { StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { WeeklyGoalProgress } from "./loadHomeData";

type Props = {
  colors: ThemeColors;
  streak: number;
  progress: WeeklyGoalProgress;
  prCount: number;
};

export default function StatsRow({ colors, streak, progress, prCount }: Props) {
  const { completedCount, targetCount } = progress;
  const weekDisplay = targetCount > 0 ? `${completedCount}/${targetCount}` : String(completedCount);
  const weekLabel = targetCount > 0 ? `${completedCount} of ${targetCount} workouts this week` : `${completedCount} workouts this week`;
  const items = [
    { icon: "fire" as const, value: streak, label: "Streak", a11y: `${streak} week streak` },
    { icon: "calendar-check" as const, value: weekDisplay, label: "This Week", a11y: weekLabel },
    { icon: "trophy" as const, value: prCount, label: "Recent PRs", a11y: `${prCount} recent personal records` },
  ];
  return (
    <View style={styles.row}>
      {items.map((s) => (
        <View key={s.label} style={styles.stat} accessibilityLabel={s.a11y}>
          <MaterialCommunityIcons name={s.icon} size={20} color={colors.primary} />
          <Text variant="body" style={{ color: colors.onBackground, fontWeight: "700" }}>{String(s.value)}</Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-around", marginBottom: 16 },
  stat: { flex: 1, alignItems: "center", gap: 2 },
});
