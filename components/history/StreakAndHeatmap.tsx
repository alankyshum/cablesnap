import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import WorkoutHeatmap from "@/components/WorkoutHeatmap";
import { Flame, Trophy, Dumbbell, ChevronUp, ChevronDown } from "lucide-react-native";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  colors: ThemeColors;
  currentStreak: number;
  longestStreak: number;
  totalWorkouts: number;
  heatmapData: Map<string, number>;
  heatmapLoading: boolean;
  heatmapError: boolean;
  heatmapExpanded: boolean;
  setHeatmapExpanded: (v: boolean) => void;
  onDayPress: (dateKey: string) => void;
};

export default function StreakAndHeatmap({
  colors, currentStreak, longestStreak, totalWorkouts,
  heatmapData, heatmapLoading, heatmapError, heatmapExpanded, setHeatmapExpanded, onDayPress,
}: Props) {
  return (
    <>
      <Card style={{ ...styles.streakCard, backgroundColor: colors.surface }}>
        <CardContent style={styles.streakRow}>
          <View style={styles.streakItem} accessibilityLabel={`Current streak: ${currentStreak} weeks`}>
            <Icon name={Flame} size={20} color={colors.primary} />
            <Text variant="subtitle" style={{ color: colors.onSurface }}>{currentStreak}</Text>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>current</Text>
          </View>
          <View style={styles.streakItem} accessibilityLabel={`Longest streak: ${longestStreak} weeks`}>
            <Icon name={Trophy} size={20} color={colors.primary} />
            <Text variant="subtitle" style={{ color: colors.onSurface }}>{longestStreak}</Text>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>longest</Text>
          </View>
          <View style={styles.streakItem} accessibilityLabel={`Total workouts: ${totalWorkouts}`}>
            <Icon name={Dumbbell} size={20} color={colors.primary} />
            <Text variant="subtitle" style={{ color: colors.onSurface }}>{totalWorkouts}</Text>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>workouts</Text>
          </View>
        </CardContent>
      </Card>

      <View style={styles.heatmapSection}>
        <Pressable onPress={() => setHeatmapExpanded(!heatmapExpanded)} accessibilityRole="button" accessibilityLabel={`Last 16 Weeks, ${heatmapExpanded ? "collapse" : "expand"}`}
          style={styles.heatmapHeader}
          accessibilityState={{ expanded: heatmapExpanded }}>
          <Text variant="subtitle" style={{ color: colors.onBackground }}>Last 16 Weeks</Text>
          <Icon name={heatmapExpanded ? ChevronUp : ChevronDown} size={20} color={colors.onSurfaceVariant} />
        </Pressable>
        {heatmapExpanded && (
          heatmapLoading ? (
            <View style={styles.heatmapLoading}><ActivityIndicator size="small" color={colors.primary} /></View>
          ) : heatmapError ? (
            <View style={styles.heatmapLoading}>
              <Text variant="caption" style={{ color: colors.error }}>Unable to load heatmap data. Pull down to retry.</Text>
            </View>
          ) : (
            <WorkoutHeatmap data={heatmapData} weeks={16} onDayPress={onDayPress} totalAllTime={totalWorkouts} />
          )
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  streakCard: { marginBottom: 12 },
  streakRow: { flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingVertical: 4 },
  streakItem: { alignItems: "center", gap: 2 },
  heatmapSection: { marginBottom: 12 },
  heatmapHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, paddingHorizontal: 4 },
  heatmapLoading: { height: 120, alignItems: "center", justifyContent: "center" },
});
