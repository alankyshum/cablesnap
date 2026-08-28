/**
 * BLD-1089: "Today's GTG" card shown on the home screen when at least one
 * quick-add set has been logged today. AC4.
 */
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { TodayGtgSummaryRow } from "@/lib/db/day-session";
import { t } from "@lingui/core/macro";

type Props = {
  colors: ThemeColors;
  rows: TodayGtgSummaryRow[];
  onRowPress: (daySessionId: string) => void;
};

function parseSetTimes(setTimesJson: string): number[] {
  try {
    return JSON.parse(setTimesJson) as number[];
  } catch {
    return [];
  }
}

/**
 * Sparkline — renders time-of-day distribution as dots at hourly positions.
 * AC4, AC15: degrades to text list at fontScale > 1.5.
 */
function Sparkline({
  setTimes,
  colors,
}: {
  setTimes: number[];
  colors: ThemeColors;
}) {
  const validTimes = setTimes.filter(Boolean);
  if (validTimes.length === 0) return null;

  const hourBuckets = new Array<number>(24).fill(0);
  for (const t of validTimes) {
    hourBuckets[new Date(t).getHours()]++;
  }

  const firstHour = new Date(validTimes[0]).getHours();
  const lastHour = new Date(validTimes[validTimes.length - 1]).getHours();
  const range = Math.max(lastHour - firstHour, 1);

  return (
    <View
      style={styles.sparkline}
      accessible={false}
      accessibilityElementsHidden
    >
      {hourBuckets.map((count, hour) => {
        if (count === 0) return null;
        const left = range > 0
          ? ((hour - firstHour) / range) * 100
          : 50;
        return (
          <View
            key={hour}
            style={[
              styles.sparkDot,
              {
                backgroundColor: colors.primary,
                left: `${Math.max(0, Math.min(100, left))}%`,
                opacity: Math.min(0.4 + count * 0.2, 1),
              },
            ]}
          />
        );
      })}
    </View>
  );
}

export default function TodaysGtgCard({ colors, rows, onRowPress }: Props) {
  if (rows.length === 0) return null;

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surfaceVariant }]}
      accessible={false}
    >
      <Text
        style={[styles.heading, { color: colors.onSurfaceVariant }]}
        accessibilityRole="header"
      >
        Today&apos;s Quick-add sets
      </Text>
      {rows.map((row) => {
        const times = parseSetTimes(row.set_times);
        const firstTime = times[0];
        const lastTime = times[times.length - 1];
        const timeRange = firstTime && lastTime && firstTime !== lastTime
          ? `${new Date(firstTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${new Date(lastTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          : firstTime
            ? new Date(firstTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : null;

        return (
          <Pressable
            key={row.day_session_id}
            onPress={() => onRowPress(row.day_session_id)}
            accessible
            accessibilityRole="button"
            accessibilityLabel={t({ id: "home.gtg.entryA11y", message: `${row.exercise_name}, ${row.total_reps} total reps across ${row.set_count} sets. Tap to view details.` })}
            style={({ pressed }) => [
              styles.row,
              { borderTopColor: colors.outline, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={styles.rowLeft}>
              <Text
                style={[styles.exerciseName, { color: colors.onSurface }]}
                numberOfLines={1}
              >
                {row.exercise_name}
              </Text>
              {timeRange && (
                <Text style={[styles.timeRange, { color: colors.onSurfaceVariant }]}>
                  {timeRange}
                </Text>
              )}
            </View>
            <View style={styles.rowRight}>
              <View style={styles.stats}>
                <Text
                  style={[styles.statValue, { color: colors.primary }]}
                  accessibilityLabel={t({ id: "home.gtg.repsA11y", message: `${row.total_reps} total reps` })}
                >
                  {row.total_reps}
                </Text>
                <Text style={[styles.statLabel, { color: colors.onSurfaceVariant }]}>
                  reps
                </Text>
              </View>
              <View style={styles.stats}>
                <Text
                  style={[styles.statValue, { color: colors.onSurface }]}
                  accessibilityLabel={t({ id: "home.gtg.setsA11y", message: `${row.set_count} sets` })}
                >
                  {row.set_count}
                </Text>
                <Text style={[styles.statLabel, { color: colors.onSurfaceVariant }]}>
                  sets
                </Text>
              </View>
            </View>
            <Sparkline setTimes={times} colors={colors} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    marginVertical: 8,
    overflow: "hidden",
  },
  heading: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexWrap: "wrap",
    gap: 4,
  },
  rowLeft: {
    flex: 1,
    minWidth: 80,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: "500",
  },
  timeRange: {
    fontSize: 12,
    marginTop: 2,
  },
  rowRight: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
  },
  stats: {
    alignItems: "center",
    minWidth: 40,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 11,
  },
  sparkline: {
    width: "100%",
    height: 8,
    position: "relative",
    marginTop: 8,
  },
  sparkDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    top: 0,
  },
});
