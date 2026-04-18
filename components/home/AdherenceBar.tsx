import { FlatList, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { radii } from "@/constants/design-tokens";
import type { ThemeColors } from "@/hooks/useThemeColors";

type AdherenceDay = { scheduled: boolean; completed: boolean };

type Props = {
  colors: ThemeColors;
  adherence: AdherenceDay[];
};

export default function AdherenceBar({ colors, adherence }: Props) {
  const scheduled = adherence.filter((a) => a.scheduled);
  if (scheduled.length === 0) return null;

  const completedCount = adherence.filter((a) => a.scheduled && a.completed).length;
  const allDone = scheduled.every((a) => a.completed);
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <View style={styles.adherence} accessibilityLabel={`Adherence: ${completedCount} of ${scheduled.length} this week`}>
      <View style={styles.dots}>
        <FlatList
          data={adherence}
          horizontal
          scrollEnabled={false}
          keyExtractor={(_, i) => String(i)}
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
              accessibilityLabel={`${dayLabels[i]}: ${a.completed ? "completed" : a.scheduled ? "scheduled" : "rest day"}`}
            />
          )}
        />
      </View>
      <Text variant="caption" style={{ color: colors.onSurfaceVariant, textAlign: "center", marginTop: 4 }}>
        {completedCount} of {scheduled.length} this week {allDone ? "🔥" : "🎯"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  adherence: { marginBottom: 12, alignItems: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8 },
  dot: { width: 12, height: 12, borderRadius: radii.md },
});
