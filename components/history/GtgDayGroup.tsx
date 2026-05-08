/**
 * BLD-1089: Collapsed "Quick-add sets" group shown per day in the History tab.
 * Renders a summary row per exercise that has GTG sets on a given date.
 * Tapping a row navigates to the read-only day-session detail screen.
 */
import React, { useState } from "react";
import { Pressable, View, StyleSheet } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { DaySessionEntry } from "@/lib/db/day-session";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  dateLabel: string;
  entries: DaySessionEntry[];
  colors: ThemeColors;
  onEntryPress: (sessionId: string) => void;
};

export function GtgDayGroup({ dateLabel, entries, colors, onEntryPress }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) return null;

  const totalSets = entries.reduce((sum, e) => sum + e.set_count, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceVariant, borderColor: colors.outlineVariant }]}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={styles.header}
        accessibilityRole="button"
        accessibilityLabel={`Quick-add sets for ${dateLabel}, ${entries.length} exercises, ${totalSets} sets total. ${expanded ? "Collapse" : "Expand"}`}
        accessibilityState={{ expanded }}
      >
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons name="lightning-bolt" size={16} color={colors.onSurfaceVariant} style={{ marginRight: 6 }} />
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
            Quick-add sets — {entries.length} exercise{entries.length !== 1 ? "s" : ""}, {totalSets} set{totalSets !== 1 ? "s" : ""}
          </Text>
        </View>
        <MaterialCommunityIcons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.onSurfaceVariant}
        />
      </Pressable>

      {expanded && (
        <View style={styles.entriesList}>
          {entries.map((entry) => (
            <Pressable
              key={entry.id}
              onPress={() => onEntryPress(entry.id)}
              style={[styles.entryRow, { borderTopColor: colors.outlineVariant }]}
              accessibilityRole="button"
              accessibilityLabel={`${entry.exercise_name}: ${entry.total_reps} reps across ${entry.set_count} sets`}
            >
              <Text style={{ color: colors.onSurface, flex: 1 }}>{entry.exercise_name}</Text>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                {entry.total_reps} rep{entry.total_reps !== 1 ? "s" : ""} · {entry.set_count} set{entry.set_count !== 1 ? "s" : ""}
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={16} color={colors.onSurfaceVariant} style={{ marginLeft: 4 }} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  entriesList: {
    paddingBottom: 4,
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
});
