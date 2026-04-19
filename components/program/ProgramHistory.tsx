import { StyleSheet, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import type { Router } from "expo-router";
import { dateStr, type HistoryEntry } from "@/hooks/useProgramDetail";

type Props = {
  history: HistoryEntry[];
  colors: import("@/hooks/useThemeColors").ThemeColors;
  router: Router;
};

export function ProgramHistory({ history, colors, router }: Props) {
  if (history.length === 0) return null;

  return (
    <View style={styles.history}>
      <Text variant="title" style={[styles.historyTitle, { color: colors.onBackground }]}>
        History
      </Text>
      {history.map((h) => (
        <Card
          key={h.session_id}
          style={StyleSheet.flatten([styles.historyCard, { backgroundColor: colors.surface }])}
          onPress={() => router.push(`/session/detail/${h.session_id}`)}
          accessibilityLabel={`Completed ${h.day_label || h.template_name || "workout"} on ${dateStr(h.completed_at)}`}
          accessibilityRole="button"
        >
          <CardContent style={styles.historyRow}>
            <Text variant="body" style={{ color: colors.onSurface, flex: 1 }}>
              {h.day_label || h.template_name || "Workout"}
            </Text>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
              {dateStr(h.completed_at)}
            </Text>
          </CardContent>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  history: {
    marginTop: 24,
  },
  historyTitle: {
    marginBottom: 8,
  },
  historyCard: {
    marginBottom: 4,
    minHeight: 48,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
  },
});
