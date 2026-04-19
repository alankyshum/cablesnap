import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  currentStreak: number;
  longestStreak: number;
};

export default function CalendarStreaks({
  currentStreak,
  longestStreak,
}: Props) {
  const colors = useThemeColors();

  return (
    <View
      style={[styles.container, { backgroundColor: colors.surface }]}
      accessibilityLabel={`Current training streak: ${currentStreak} day${currentStreak !== 1 ? "s" : ""}. Longest streak: ${longestStreak} day${longestStreak !== 1 ? "s" : ""}`}
    >
      <View style={styles.streakItem}>
        <Text style={[styles.streakValue, { color: colors.primary }]}>
          {currentStreak}
        </Text>
        <Text
          variant="caption"
          style={{ color: colors.onSurfaceVariant }}
        >
          Current streak (days)
        </Text>
      </View>
      <View
        style={[styles.divider, { backgroundColor: colors.outlineVariant }]}
      />
      <View style={styles.streakItem}>
        <Text style={[styles.streakValue, { color: colors.onSurface }]}>
          {longestStreak}
        </Text>
        <Text
          variant="caption"
          style={{ color: colors.onSurfaceVariant }}
        >
          Longest streak (days)
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  streakItem: {
    flex: 1,
    alignItems: "center",
  },
  streakValue: {
    fontSize: fontSizes.xxl,
    fontWeight: "700",
    marginBottom: 4,
  },
  divider: {
    width: 1,
    marginHorizontal: 12,
  },
});
