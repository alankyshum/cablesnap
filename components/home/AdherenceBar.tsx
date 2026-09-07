import { FlatList, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { radii } from "@/constants/design-tokens";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";
import type { WeeklyGoalProgress } from "./loadHomeData";

type Props = {
  colors: ThemeColors;
  progress: WeeklyGoalProgress;
};

export default function AdherenceBar({ colors, progress }: Props) {
  if (progress.mode === "hidden") return null;
  if (progress.slots.length === 0) return null;

  const { slots, completedCount, targetCount, mode } = progress;
  const allDone = completedCount >= targetCount;
  const overGoal = completedCount > targetCount;
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  let statusText: string;
  if (mode === "frequency" && overGoal) {
    statusText = t({ id: "home.adherence.goalReached", message: `Goal reached! ${completedCount} workouts this week 🔥` });
  } else {
    statusText = i18n._({ id: "home.adherence.progress", message: "{completed} of {target} this week {symbol}", values: { completed: completedCount, target: targetCount, symbol: allDone ? "🔥" : "🎯" } });
  }

  return (
    <View style={styles.adherence} accessibilityLabel={t({ id: "home.adherence.a11y", message: `Adherence: ${completedCount} of ${targetCount} workouts this week` })}>
      <View style={styles.dots}>
        <FlatList
          data={slots}
          horizontal
          scrollEnabled={false}
          keyExtractor={(_, i) => `slot-${i}-${slots.length}`}
          renderItem={({ item: a, index: i }) => (
            <View
              style={[
                styles.dot,
                a.completed
                  ? { backgroundColor: colors.primary }
                  : a.scheduled
                  ? { backgroundColor: "transparent", borderWidth: 2, borderColor: colors.onSurfaceVariant }
                  : { backgroundColor: colors.surfaceVariant },
              ]}
              accessibilityLabel={
                mode === "schedule"
                  ? i18n._({ id: "home.adherence.dayA11y", message: "{day}: {status, select, completed {completed} scheduled {scheduled} rest {rest day}}", values: { day: dayLabels[i], status: a.completed ? "completed" : a.scheduled ? "scheduled" : "rest" } })
                  : i18n._({ id: "home.adherence.workoutA11y", message: "Workout {number}: {status, select, completed {completed} notYet {not yet}}", values: { number: i + 1, status: a.completed ? "completed" : "notYet" } })
              }
            />
          )}
        />
      </View>
      <Text variant="caption" style={{ color: colors.onSurfaceVariant, textAlign: "center", marginTop: 4 }}>
        {statusText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  adherence: { marginBottom: 12, alignItems: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8 },
  dot: { width: 12, height: 12, borderRadius: radii.md },
});
