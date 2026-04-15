import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { useLayout } from "../lib/layout";
import { withOpacity } from "../lib/format";

type HeatmapProps = {
  data: Map<string, number>;
  weeks?: number;
  onDayPress?: (date: string) => void;
};

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"] as const;

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}

function formatDateForLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function heatmapColor(
  count: number,
  theme: { colors: { surfaceVariant: string; primaryContainer: string; primary: string } }
): string {
  if (count === 0) return theme.colors.surfaceVariant;
  if (count === 1) return theme.colors.primaryContainer;
  if (count === 2) return withOpacity(theme.colors.primary, 0.7);
  return theme.colors.primary;
}

type CellData = {
  date: Date;
  dateKey: string;
  count: number;
};

function buildGrid(weeks: number): CellData[][] {
  const today = new Date();
  const monday = getMondayOfWeek(today);
  const startDate = new Date(monday);
  startDate.setDate(startDate.getDate() - (weeks - 1) * 7);

  const grid: CellData[][] = [];
  for (let row = 0; row < 7; row++) {
    grid.push([]);
  }

  const cursor = new Date(startDate);
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(cursor);
      grid[d].push({
        date,
        dateKey: formatDateKey(date),
        count: 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return grid;
}

export default function WorkoutHeatmap({ data, weeks = 16, onDayPress }: HeatmapProps) {
  const theme = useTheme();
  const layout = useLayout();

  const grid = useMemo(() => {
    const g = buildGrid(weeks);
    for (const row of g) {
      for (const cell of row) {
        cell.count = data.get(cell.dateKey) ?? 0;
      }
    }
    return g;
  }, [data, weeks]);

  const labelWidth = 18;
  const gap = 2;
  const availableWidth = layout.width - layout.horizontalPadding * 2 - labelWidth - gap;
  const cellSize = Math.max(14, Math.min(24, Math.floor((availableWidth - gap * (weeks - 1)) / weeks)));
  const hitPad = Math.max(0, Math.floor((48 - cellSize) / 2));

  const hasAnyWorkout = useMemo(() => {
    for (const row of grid) {
      for (const cell of row) {
        if (cell.count > 0) return true;
      }
    }
    return false;
  }, [grid]);

  const renderDots = (count: number, size: number) => {
    if (count === 0) return null;
    if (count >= 3) {
      return (
        <Text style={[styles.cellText, { fontSize: Math.max(12, size * 0.5), color: theme.colors.onPrimary }]}>
          3+
        </Text>
      );
    }
    const dotSize = Math.max(3, size * 0.15);
    return (
      <View style={styles.dotsRow}>
        <View style={[styles.cellDot, { width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: count === 1 ? theme.colors.onPrimaryContainer : theme.colors.onPrimary }]} />
        {count >= 2 && (
          <View style={[styles.cellDot, { width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: theme.colors.onPrimary }]} />
        )}
      </View>
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gridRole = "grid" as any;

  return (
    <View accessibilityRole={gridRole} accessibilityLabel="Workout heatmap grid" style={styles.container}>
      {grid.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          <Text
            variant="labelSmall"
            style={[styles.dayLabel, { width: labelWidth, color: theme.colors.onSurfaceVariant }]}
          >
            {DAY_LABELS[rowIdx]}
          </Text>
          {row.map((cell) => {
            const today = new Date();
            const isFuture = cell.date > today;
            const bgColor = isFuture
              ? "transparent"
              : heatmapColor(cell.count, theme);
            const label = `${formatDateForLabel(cell.date)}, ${cell.count} workout${cell.count !== 1 ? "s" : ""}`;
            return (
              <Pressable
                key={cell.dateKey}
                onPress={() => onDayPress?.(cell.dateKey)}
                hitSlop={{ top: hitPad, bottom: hitPad, left: hitPad, right: hitPad }}
                accessibilityLabel={label}
                accessibilityRole="button"
                style={[
                  styles.cell,
                  {
                    width: cellSize,
                    height: cellSize,
                    borderRadius: 3,
                    backgroundColor: bgColor,
                    margin: gap / 2,
                    opacity: isFuture ? 0.3 : 1,
                  },
                ]}
              >
                {!isFuture && renderDots(cell.count, cellSize)}
              </Pressable>
            );
          })}
        </View>
      ))}

      {/* Color Legend */}
      <View style={styles.legend}>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          Less
        </Text>
        {[0, 1, 2, 3].map((level) => (
          <View
            key={level}
            style={[
              styles.legendCell,
              {
                backgroundColor: heatmapColor(level, theme),
                borderRadius: 3,
              },
            ]}
          >
            {renderDots(level, 16)}
          </View>
        ))}
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          More
        </Text>
      </View>

      {/* Empty state */}
      {!hasAnyWorkout && (
        <View style={styles.emptyState}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}>
            Start working out to see your consistency here!
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  dayLabel: {
    fontSize: 12,
    textAlign: "center",
  },
  cell: {
    alignItems: "center",
    justifyContent: "center",
  },
  cellText: {
    fontWeight: "700",
    textAlign: "center",
  },
  dotsRow: {
    flexDirection: "row",
    gap: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cellDot: {},
  legend: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 6,
    paddingRight: 4,
  },
  legendCell: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
});
