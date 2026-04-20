import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import { rpeColor, rpeText } from "@/lib/rpe";
import { formatDuration, formatDateShort } from "@/lib/format";
import { flowCardStyle } from "@/components/ui/FlowContainer";
import { Button } from "@/components/ui/button";
import type { WorkoutSession } from "@/lib/types";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  colors: ThemeColors;
  sessions: WorkoutSession[];
  setCounts: Record<string, number>;
  avgRPEs: Record<string, number | null>;
};

export default function RecentWorkoutsList({ colors, sessions, setCounts, avgRPEs }: Props) {
  const router = useRouter();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="subtitle" style={{ color: colors.onBackground }}>Recent Workouts</Text>
        {sessions.length > 0 && (
          <Button variant="ghost" size="sm" onPress={() => router.push("/history")} accessibilityLabel="View all workout history" label="View All History" />
        )}
      </View>
      {sessions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: colors.onSurfaceVariant }}>No workouts yet. Start one above!</Text>
        </View>
      ) : (
        <View style={styles.flowList}>
          {sessions.map((item, index) => {
            const rpe = avgRPEs[item.id];
            const rpeStr = rpe != null ? ` · RPE ${Math.round(rpe * 10) / 10}` : "";
            return (
              <Animated.View key={item.id} entering={FadeInDown.delay(index * 60).duration(300)}>
                <Pressable
                  style={[styles.flowCard, { backgroundColor: colors.surface, borderRadius: 12, padding: 18 }]}
                  onPress={() => router.push(`/session/detail/${item.id}`)}
                  accessibilityLabel={`View workout: ${item.name}, ${formatDateShort(item.started_at)}, ${formatDuration(item.duration_seconds)}, ${setCounts[item.id] ?? 0} sets${rpeStr}`}
                  accessibilityRole="button"
                >
                  <Text variant="body" style={{ color: colors.onSurface, fontWeight: "600" }}>{item.name}</Text>
                  <View style={styles.recentRow}>
                    <Text variant="caption" style={{ color: colors.onSurfaceVariant, flex: 1 }}>
                      {formatDateShort(item.started_at)} · {formatDuration(item.duration_seconds)} · {setCounts[item.id] ?? 0} sets
                    </Text>
                    {rpe != null && (
                      <View style={[styles.rpeTag, { backgroundColor: rpeColor(rpe) }]}>
                        <Text style={{ color: rpeText(rpe), fontSize: fontSizes.xs, fontWeight: "600" }}>RPE {Math.round(rpe * 10) / 10}</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  flowList: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "flex-start" },
  flowCard: { marginBottom: 8, ...flowCardStyle, flexGrow: 0 },
  empty: { alignItems: "center", paddingVertical: 16 },
  recentRow: { flexDirection: "row", alignItems: "center" },
  rpeTag: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 },
});
