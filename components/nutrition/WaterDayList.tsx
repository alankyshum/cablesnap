/**
 * BLD-600 — Day list of water entries (used by app/nutrition/water.tsx).
 */
import { TouchableOpacity, View, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import SwipeToDelete from "@/components/SwipeToDelete";
import type { WaterLog } from "@/lib/types";
import { formatVolume, type HydrationUnit } from "@/lib/hydration-units";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  entries: WaterLog[];
  unit: HydrationUnit;
  colors: ThemeColors;
  onDelete: (entry: WaterLog) => void;
  onEdit: (entry: WaterLog) => void;
};

function timeOfDay(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ampm = hh < 12 ? "AM" : "PM";
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${mm} ${ampm}`;
}

export function WaterDayList({ entries, unit, colors, onDelete, onEdit }: Props) {
  if (entries.length === 0) {
    return (
      <View style={styles.empty}>
        <Text variant="body" style={{ color: colors.onSurfaceVariant, textAlign: "center" }}>
          No water logged yet today.
        </Text>
      </View>
    );
  }

  return (
    <View>
      {entries.map((entry) => (
        <View key={entry.id} style={styles.wrapper}>
          <SwipeToDelete onDelete={() => onDelete(entry)}>
            <TouchableOpacity
              onPress={() => onEdit(entry)}
              accessibilityLabel={`Water entry ${formatVolume(entry.amount_ml, unit)} at ${timeOfDay(entry.logged_at)}`}
              accessibilityRole="button"
              style={{ minHeight: 48 }}
            >
              <Card style={[styles.card, { backgroundColor: colors.surface }]}>
                <CardContent style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text variant="body" style={{ color: colors.onSurface }}>
                      {formatVolume(entry.amount_ml, unit)}
                    </Text>
                    <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                      {timeOfDay(entry.logged_at)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => onDelete(entry)}
                    accessibilityLabel="Delete water entry"
                    hitSlop={8}
                    style={{ padding: 8 }}
                  >
                    <MaterialCommunityIcons name="delete-outline" size={20} color={colors.onSurface} />
                  </TouchableOpacity>
                </CardContent>
              </Card>
            </TouchableOpacity>
          </SwipeToDelete>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 6 },
  card: { borderRadius: 8, elevation: 0, shadowOpacity: 0 },
  row: { flexDirection: "row", alignItems: "center" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 64 },
});
