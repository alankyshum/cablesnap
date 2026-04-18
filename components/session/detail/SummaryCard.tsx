import { StyleSheet, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import type { WorkoutSession } from "@/lib/types";
import { formatDuration, formatDateShort } from "@/lib/format";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  session: WorkoutSession;
  completedSets: number;
  volume: number;
  colors: ThemeColors;
};

export function SummaryCard({ session, completedSets, volume, colors }: Props) {
  return (
    <Card style={StyleSheet.flatten([styles.summary, { backgroundColor: colors.surface }])}>
      <CardContent>
        <Text variant="body" style={{ color: colors.onSurfaceVariant }}>
          {formatDateShort(session.started_at)}
        </Text>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text variant="heading" style={{ color: colors.primary }}>
              {formatDuration(session.duration_seconds)}
            </Text>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
              Duration
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="heading" style={{ color: colors.primary }}>
              {completedSets}
            </Text>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
              Sets
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="heading" style={{ color: colors.primary }}>
              {volume.toLocaleString()}
            </Text>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
              Volume
            </Text>
          </View>
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  summary: {
    marginBottom: 20,
  },
  stats: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 12,
  },
  stat: {
    alignItems: "center",
  },
});
