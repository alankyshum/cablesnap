import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { t } from "@lingui/core/macro";
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
       accessibilityLabel={t({ id: "components.progress.calendarStreaks.summaryA11y", message: `Current training streak: ${currentStreak} days. Longest streak: ${longestStreak} days` })}
    >
      <View style={styles.streakItem}>
        <Text style={[styles.streakValue, { color: colors.primary }]}>
          {currentStreak}
        </Text>
        <Text
          variant="caption"
          style={{ color: colors.onSurfaceVariant }}
        >
           {t({ id: "components.progress.calendarStreaks.currentLabel", message: "Current streak (days)" })}
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
           {t({ id: "components.progress.calendarStreaks.longestLabel", message: "Longest streak (days)" })}
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
