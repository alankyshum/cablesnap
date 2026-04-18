import { StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  colors: ThemeColors;
  streak: number;
  weekDone: number;
  scheduled: { scheduled: boolean; completed: boolean }[];
  prCount: number;
};

export default function StatsRow({ colors, streak, weekDone, scheduled, prCount }: Props) {
  const items = [
    { icon: "fire" as const, value: streak, label: "Streak" },
    { icon: "calendar-check" as const, value: `${weekDone}/${scheduled.length}`, label: "This Week" },
    { icon: "trophy" as const, value: prCount, label: "Recent PRs" },
  ];
  return (
    <View style={styles.row}>
      {items.map((s) => (
        <View key={s.label} style={styles.stat} accessibilityLabel={`${s.label}: ${s.value}`}>
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
  stat: { alignItems: "center", gap: 2 },
});
