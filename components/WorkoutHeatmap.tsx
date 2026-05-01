import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useLayout } from "../lib/layout";
import { withOpacity } from "../lib/format";
import { radii } from "../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

type HeatmapProps = {
  data: Map<string, number>;
  weeks?: number;
  onDayPress?: (date: string) => void;
  /**
   * Total all-time completed workouts. Used only to disambiguate the empty-state
   * copy: when `data` is empty AND `totalAllTime > 0`, we know the heatmap is
   * empty because nothing landed in the visible window — not because the user
   * has never worked out. Defaults to 0 (treats empty data as "no workouts ever").
   * BLD-662.
   */
  totalAllTime?: number;
};

// GitHub-style: only Mon/Wed/Fri labeled to avoid T/T and S/S ambiguity (BLD-686).
// rowIdx 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""] as const;

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

/**
 * Background color for a heatmap cell.
 *
 * BLD-732 a11y fix: use a clear opacity ramp on the primary color so the
 * 1-workout, 2-workout, and 3+-workout steps are perceptually distinct.
 * Previously 1 and 2 used different theme tokens that rendered as nearly
 * identical light-orange tints; deuteranopia/protanopia simulation could
 * not distinguish them.
 *
 * Step 0 stays on `surfaceVariant` (background tone) so an empty week is
 * visually distinct from a 1-workout week even with the increased opacity
 * floor on step 1.
 */
function heatmapColor(
  count: number,
  colors: { surfaceVariant: string; primary: string }
): string {
  if (count === 0) return colors.surfaceVariant;
  if (count === 1) return withOpacity(colors.primary, 0.3);
  if (count === 2) return withOpacity(colors.primary, 0.6);
  return colors.primary;
}

/**
 * Foreground color for the numeric label inside a filled heatmap cell.
 *
 * Step 1 uses a tinted background that is too light to support white text,
 * so we render the count in `onPrimaryContainer` (dark accent foreground)
 * for the lowest step and `onPrimary` for the higher (saturated) steps.
 */
function heatmapTextColor(
  count: number,
  colors: { onPrimary: string; onPrimaryContainer: string }
): string {
  return count <= 1 ? colors.onPrimaryContainer : colors.onPrimary;
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

export default function WorkoutHeatmap({ data, weeks = 16, onDayPress, totalAllTime = 0 }: HeatmapProps) {
  const colors = useThemeColors();
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

  // BLD-686: bumped 18→22; BLD-927: bumped to 24 to prevent truncation on narrow (390px+) viewports.
  const labelWidth = 24;
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

  /**
   * Numeric label inside a filled cell.
   *
   * BLD-732 a11y fix: provides a non-color cue so deuteranopia/protanopia
   * users can distinguish step 1 / step 2 / step 3+. The same encoding is
   * used in the body and the legend.
   *
   * Empty cells render nothing (the empty background is the cue for "0").
   * The label is hidden from assistive tech because the parent Pressable
   * already announces the full date and count via accessibilityLabel.
   */
  const renderCellLabel = (count: number, size: number) => {
    if (count === 0) return null;
    const text = count >= 3 ? "3+" : String(count);
    return (
      <Text
        style={[
          styles.cellText,
          {
            fontSize: Math.max(fontSizes.xs, size * 0.5),
            color: heatmapTextColor(count, colors),
          },
        ]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {text}
      </Text>
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gridRole = "grid" as any;

  return (
    <View accessibilityRole={gridRole} accessibilityLabel="Workout heatmap grid" style={styles.container}>
      {grid.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          <Text
            variant="caption"
            style={[styles.dayLabel, { width: labelWidth, fontSize: fontSizes.xs, color: colors.onSurfaceVariant }]}
          >
            {DAY_LABELS[rowIdx]}
          </Text>
          {row.map((cell) => {
            const today = new Date();
            const isFuture = cell.date > today;
            const bgColor = isFuture
              ? "transparent"
              : heatmapColor(cell.count, colors);
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
                    borderRadius: radii.sm,
                    backgroundColor: bgColor,
                    margin: gap / 2,
                    opacity: isFuture ? 0.3 : 1,
                  },
                ]}
              >
                {!isFuture && renderCellLabel(cell.count, cellSize)}
              </Pressable>
            );
          })}
        </View>
      ))}

      {/* Color Legend
       * BLD-732: shows all 4 steps (0/1/2/3+) using the same encoding as
       * the heatmap body — opacity ramp + numeric label as the non-color
       * cue. The 0-step gets an explicit border so it remains distinct
       * from the surrounding card surface even when surfaceVariant blends
       * with the panel background.
       */}
      <View
        style={styles.legend}
        accessibilityLabel="Heatmap legend: 0, 1, 2, and 3 or more workouts"
      >
        <Text variant="caption" style={{ fontSize: fontSizes.xs, color: colors.onSurfaceVariant }}>
          Less
        </Text>
        {[0, 1, 2, 3].map((level) => (
          <View
            key={level}
            style={[
              styles.legendCell,
              {
                backgroundColor: heatmapColor(level, colors),
                borderRadius: radii.sm,
                borderWidth: level === 0 ? StyleSheet.hairlineWidth : 0,
                borderColor: colors.outline ?? colors.onSurfaceVariant,
              },
            ]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {renderCellLabel(level, 18)}
          </View>
        ))}
        <Text variant="caption" style={{ fontSize: fontSizes.xs, color: colors.onSurfaceVariant }}>
          More
        </Text>
      </View>

      {/* Empty state */}
      {!hasAnyWorkout && (
        <View style={styles.emptyState}>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, textAlign: "center" }}>
            {totalAllTime > 0
              ? `No completed workouts in the last ${weeks} weeks`
              : "Start working out to see your consistency here!"}
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
    fontSize: fontSizes.xs,
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
  legend: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 6,
    paddingRight: 4,
  },
  legendCell: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
});
